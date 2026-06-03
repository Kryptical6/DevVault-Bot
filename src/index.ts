import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, Events,
  Message, DMChannel, TextChannel
} from 'discord.js';
import { config } from './config/index.js';
import { initDb } from './db/index.js';
import { setLogClient } from './utils/logger.js';
import { registerCommands, handleCommand } from './commands/index.js';
import { routeInteraction, routeDMMessage, routeServerMessage } from './events/interactionRouter.js';
import { handleEvidenceMessage } from './systems/reviewSystem.js';
import { setPostWorkflowClient } from './workflows/postWorkflow.js';
import { setTicketClient, mirrorToUser } from './systems/ticketSystem.js';
import { setReviewClient } from './systems/reviewSystem.js';
import { setModClient, scheduleBanExpiry } from './systems/moderationSystem.js';
import { setApplyClient } from './systems/sellerSystem.js';
import { setBrowseClient } from './workflows/browseWorkflow.js';
import { setRepostClient } from './workflows/repostWorkflow.js';
import { setPurchaseClient } from './systems/purchaseSystem.js';
import { runFeaturedRotation } from './systems/sellerSystem.js';
import { logMisc } from './utils/logger.js';
import { updateUserBan } from './db/helpers.js';
import { query } from './db/index.js';

// ─── CLIENT SETUP ─────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

// ─── READY ────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, async (c) => {
  console.log(`[BOT] Logged in as ${c.user.tag}`);

  await initDb();
  console.log('[BOT] Database ready.');

  setLogClient(client);
  setPostWorkflowClient(client);
  setTicketClient(client);
  setReviewClient(client);
  setModClient(client);
  setApplyClient(client);
  setBrowseClient(client);
  setRepostClient(client);
  setPurchaseClient(client);

  await registerCommands();

  setInterval(() => runFeaturedRotation(client), 5 * 60 * 1000);
  await runFeaturedRotation(client);

  await restoreBanTimers();
  await restorePostTimers();

  await logMisc('bot_startup', `DevVault bot started as ${c.user.tag}`);
  console.log('[BOT] DevVault is online and ready.');
});

// ─── INTERACTION HANDLER ──────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction, client);
    } else {
      await routeInteraction(interaction, client);
    }
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    console.error('[EVENT] InteractionCreate error:', e.message);
    await logMisc('interaction_error', e.message, e.code);
  }
});

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  try {
    if (message.channel instanceof DMChannel || message.channel.type === 1) {
      await routeDMMessage(message, client);
      return;
    }
    if (message.guild?.id === config.servers.staff) {
      await mirrorToUser(message);
      // Handle evidence uploads from staff moderators
      const evidenceHandled = await handleEvidenceMessage(message);
      if (evidenceHandled) return;
    }
    // Handle /embed content from any server channel
    await routeServerMessage(message, client);
  } catch (err: unknown) {
    console.error('[EVENT] MessageCreate error:', (err as Error).message);
  }
});

// ─── GUILD BAN REMOVE ─────────────────────────────────────────────────────────

client.on(Events.GuildBanRemove, async (ban) => {
  if (ban.guild.id === config.servers.main) {
    await updateUserBan(ban.user.id, false);
  }
});

// ─── RESTORE TIMERS ───────────────────────────────────────────────────────────

async function restoreBanTimers(): Promise<void> {
  try {
    const res = await query(
      `SELECT user_id, expires_at FROM moderation WHERE action_type='ban' AND is_active=TRUE AND expires_at IS NOT NULL AND expires_at > NOW()`
    );
    for (const row of res.rows) {
      scheduleBanExpiry(row.user_id, new Date(row.expires_at));
    }
    console.log(`[BOT] Restored ${res.rows.length} ban expiry timer(s).`);
  } catch (err: unknown) {
    console.error('[BOT] Failed to restore ban timers:', (err as Error).message);
  }
}

async function restorePostTimers(): Promise<void> {
  try {
    const { schedulePostExpiry } = await import('./systems/reviewSystem.js');
    const { skillRoleMap, assetCategoryMap } = await import('./config/index.js');

    const res = await query(
      `SELECT post_id, user_id, discord_message_id, post_type, category, expires_at FROM posts WHERE status='live' AND expires_at > NOW()`
    );

    for (const row of res.rows) {
      const delay = new Date(row.expires_at).getTime() - Date.now();
      if (delay <= 0) continue;

      let channelId = '';
      if (row.post_type === 'FH')        channelId = Object.values(skillRoleMap).find(s => s.label === row.category)?.mainFH  ?? '';
      else if (row.post_type === 'LFD')  channelId = Object.values(skillRoleMap).find(s => s.label === row.category)?.mainLFD ?? '';
      else                               channelId = Object.values(assetCategoryMap).find(c => c.label === row.category)?.mainChannel ?? '';

      if (channelId && row.discord_message_id) {
        schedulePostExpiry(row.post_id, row.user_id, row.discord_message_id, channelId, delay);
      }
    }

    const archivedRes = await query(
      `SELECT post_id, user_id, repost_available_until FROM posts WHERE status='archived' AND repost_available_until > NOW()`
    );

    for (const row of archivedRes.rows) {
      const deletionDelay = new Date(row.repost_available_until).getTime() - Date.now();
      if (deletionDelay <= 0) continue;
      setTimeout(async () => {
        const helpers = await import('./db/helpers.js');
        const p = await helpers.getPost(row.post_id);
        if (!p || p.status !== 'archived') return;
        await helpers.updatePostStatus(row.post_id, 'deleted');
        const { logPost } = await import('./utils/logger.js');
        await logPost({ action: 'Deleted (Permanent)', postId: row.post_id, userId: row.user_id, username: row.user_id });
      }, deletionDelay);
    }

    console.log(`[BOT] Restored ${res.rows.length} post expiry timer(s), ${archivedRes.rows.length} deletion timer(s).`);
  } catch (err: unknown) {
    console.error('[BOT] Failed to restore post timers:', (err as Error).message);
  }
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────

client.login(config.token).catch((err) => {
  console.error('[BOT] Login failed:', (err as Error).message);
  process.exit(1);
});

// ─── GLOBAL ERROR HANDLING ────────────────────────────────────────────────────

process.on('unhandledRejection', async (err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[UNHANDLED]', msg);
  await logMisc('unhandled_rejection', msg).catch(() => {});
});

process.on('uncaughtException', async (err: Error) => {
  console.error('[UNCAUGHT]', err.message);
  await logMisc('uncaught_exception', err.message, err.name).catch(() => {});
  process.exit(1);
});
