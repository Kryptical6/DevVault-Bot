// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — COMMANDS
// ─────────────────────────────────────────────────────────────────────────────
import {
  Client, REST, Routes, SlashCommandBuilder,
  ChatInputCommandInteraction, GuildMember, EmbedBuilder
} from 'discord.js';
import { config } from '../config/index.js';
import { addMpNote, getMpNotes, upsertUser, updateUserMpMute, getActiveModEntries, createModEntry, deactivateModEntry } from '../db/helpers.js';
import { buildInfoEmbed, buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';
import {
  handleWarn, handleMute, handleKick, handleBan, handleNote,
  handleUnmute, handleUnban, handleModLogs, handleMyLogs
} from '../systems/moderationSystem.js';

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL COMMANDS — available in DMs and every server
// ─────────────────────────────────────────────────────────────────────────────
const globalCommands = [
  new SlashCommandBuilder().setName('post').setDescription('Create a new marketplace listing'),
  new SlashCommandBuilder().setName('repost').setDescription('Repost one of your archived listings'),
  new SlashCommandBuilder().setName('browse').setDescription('Browse marketplace listings'),
  new SlashCommandBuilder().setName('apply').setDescription('Apply for a skill role'),
  new SlashCommandBuilder().setName('ticket').setDescription('Open a support ticket'),
  new SlashCommandBuilder().setName('get-seller').setDescription('Request marketplace access (use if Patreon did not assign your role)'),
  new SlashCommandBuilder().setName('analytics').setDescription('View analytics for your posts (Marketplace Subscribers only)'),
  new SlashCommandBuilder().setName('saved').setDescription('View your saved listings'),
  new SlashCommandBuilder().setName('mylogs').setDescription('View your own moderation history'),
].map(c => c.toJSON());

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SERVER COMMANDS — user-facing + mp staff + admin
// ─────────────────────────────────────────────────────────────────────────────
const mainServerCommands = [
  new SlashCommandBuilder().setName('mp-notes').setDescription('Add or view marketplace notes for a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('note').setDescription('Note to add (leave blank to view existing notes)').setRequired(false)),
  new SlashCommandBuilder().setName('marketplace-mute').setDescription('Restrict a user from marketplace features')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 7d, 30d, or 0 for permanent').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the restriction').setRequired(true)),
  new SlashCommandBuilder().setName('marketplace-unmute').setDescription('Remove a marketplace restriction from a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for removal').setRequired(true)),
  new SlashCommandBuilder().setName('delete-post').setDescription('Delete a marketplace post')
    .addStringOption(o => o.setName('post_id').setDescription('Post ID to delete directly (e.g. FH-0001)').setRequired(false))
    .addUserOption(o => o.setName('user').setDescription('Select a user to pick from their posts').setRequired(false)),
  new SlashCommandBuilder().setName('grant-trusted-seller').setDescription('Grant Trusted Seller role to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('embed').setDescription('Send a custom embed to a channel (Admin only)'),
  new SlashCommandBuilder().setName('get-delivery').setDescription('Retrieve the private delivery link for an asset post (Admin only, logged)')
    .addStringOption(o => o.setName('post_id').setDescription('Asset post ID e.g. ASSET-0001').setRequired(true)),
  new SlashCommandBuilder().setName('audit-log').setDescription('View system audit log (Admin only)'),
].map(c => c.toJSON());

// ─────────────────────────────────────────────────────────────────────────────
// STAFF SERVER COMMANDS — moderation + admin tools
// ─────────────────────────────────────────────────────────────────────────────
const staffServerCommands = [
  new SlashCommandBuilder().setName('warn').setDescription('Issue a warning to a user')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Timeout a user (Discord mute)')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user from the server')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true)),
  new SlashCommandBuilder().setName('note').setDescription('Add an internal moderation note to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Remove a Discord mute early')
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('unban').setDescription('Remove a ban early')
    .addStringOption(o => o.setName('user_id').setDescription('Discord user ID').setRequired(true)),
  new SlashCommandBuilder().setName('mod-logs').setDescription('View full moderation history for a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('mp-notes').setDescription('Add or view marketplace notes for a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('note').setDescription('Note to add (leave blank to view existing notes)').setRequired(false)),
  new SlashCommandBuilder().setName('marketplace-mute').setDescription('Restrict a user from marketplace features')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 7d, 30d, or 0 for permanent').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the restriction').setRequired(true)),
  new SlashCommandBuilder().setName('marketplace-unmute').setDescription('Remove a marketplace restriction from a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for removal').setRequired(true)),
  new SlashCommandBuilder().setName('delete-post').setDescription('Delete a marketplace post')
    .addStringOption(o => o.setName('post_id').setDescription('Post ID to delete directly (e.g. FH-0001)').setRequired(false))
    .addUserOption(o => o.setName('user').setDescription('Select a user to pick from their posts').setRequired(false)),
  new SlashCommandBuilder().setName('grant-trusted-seller').setDescription('Grant Trusted Seller role to a user')
    .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('embed').setDescription('Send a custom embed to a channel (Admin only)'),
  new SlashCommandBuilder().setName('get-delivery').setDescription('Retrieve the private delivery link for an asset post (Admin only, logged)')
    .addStringOption(o => o.setName('post_id').setDescription('Asset post ID e.g. ASSET-0001').setRequired(true)),
  new SlashCommandBuilder().setName('audit-log').setDescription('View system audit log (Admin only)'),
].map(c => c.toJSON());

// ─────────────────────────────────────────────────────────────────────────────
// APPEALS SERVER COMMANDS — ticket only + embed for admins
// ─────────────────────────────────────────────────────────────────────────────
const appealsServerCommands = [
  new SlashCommandBuilder().setName('ticket').setDescription('Open an appeal ticket'),
  new SlashCommandBuilder().setName('embed').setDescription('Send a custom embed to a channel (Admin only)'),
].map(c => c.toJSON());

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────────────────────────────────────────

export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.token);
  try {
    // Global: works in DMs and all servers
    await rest.put(Routes.applicationCommands(config.clientId), { body: globalCommands });
    // Per-server filtered command sets
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.servers.main),    { body: mainServerCommands });
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.servers.staff),   { body: staffServerCommands });
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.servers.appeals), { body: appealsServerCommands });
    console.log('[CMD] Commands registered: global + main + staff + appeals.');
  } catch (err: unknown) {
    console.error('[CMD] Failed to register commands:', err instanceof Error ? err.message : err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function isAdmin(member: GuildMember): boolean {
  return member.roles.cache.has(config.roles.main.admin) || member.roles.cache.has(config.roles.staff.admin);
}

function isMod(member: GuildMember): boolean {
  return isAdmin(member)
    || member.roles.cache.has(config.roles.main.moderator)
    || member.roles.cache.has(config.roles.staff.moderator);
}

function isMpStaff(member: GuildMember): boolean {
  return isAdmin(member)
    || member.roles.cache.has(config.roles.main.marketplaceStaff)
    || member.roles.cache.has(config.roles.staff.marketplaceStaff);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  const cmd = interaction.commandName;

  // Appeals server: only /ticket (anyone) and /embed (appeals admin only)
  if (interaction.guild?.id === config.servers.appeals) {
    const member = interaction.member as GuildMember;
    const isAppealsAdmin = member.roles.cache.has(config.roles.appeals.admin);

    if (cmd === 'ticket') {
      await interaction.reply({ embeds: [buildInfoEmbed('Opening Ticket', "Your appeal ticket is being created. Check your DMs.")], ephemeral: true });
      const { routeDmCommand } = await import('../workflows/postWorkflow.js');
      await routeDmCommand(interaction.user, 'ticket', client);
      return;
    }

    if (cmd === 'embed') {
      if (!isAppealsAdmin) {
        await interaction.reply({ embeds: [buildErrorEmbed('No Permission', 'This command requires Admin.')], ephemeral: true });
        return;
      }
      await handleEmbed(interaction, client);
      return;
    }

    // Block every other command in appeals server
    await interaction.reply({ embeds: [buildErrorEmbed('Not Available', 'Use `/ticket` to open an appeal.')], ephemeral: true });
    return;
  }

  // Marketplace workflow commands: require user to be a member of the main server.
  // /ticket and /mylogs are exempt — anyone anywhere can use those.
  const marketplaceCmds = ['post', 'repost', 'browse', 'apply', 'get-seller', 'analytics', 'saved'];
  if (marketplaceCmds.includes(cmd)) {
    // Block from staff server and appeals server entirely
    if (interaction.guild?.id === config.servers.staff || interaction.guild?.id === config.servers.appeals) {
      await interaction.reply({ embeds: [buildErrorEmbed('Not Available', 'Marketplace commands can only be used in the DevVault main server or in DMs.')], ephemeral: true });
      return;
    }
    // Check the user is actually in the main server (covers DM usage too)
    let inMainServer = false;
    try {
      const mainGuild = await client.guilds.fetch(config.servers.main);
      await mainGuild.members.fetch(interaction.user.id);
      inMainServer = true;
    } catch { /* not in main server */ }
    if (!inMainServer) {
      await interaction.reply({ embeds: [buildErrorEmbed('Access Denied', 'You must be a member of the DevVault server to use marketplace commands.')], ephemeral: true });
      return;
    }
  }

  // Global user commands — work in DMs and the main server only.
  const dmWorkflowCmds = ['post', 'repost', 'browse', 'apply', 'ticket', 'get-seller', 'analytics', 'saved'];
  if (dmWorkflowCmds.includes(cmd)) {
    if (interaction.guild) {
      // Used in a server — send ephemeral reply then start DM workflow
      await interaction.reply({
        embeds: [buildInfoEmbed('Check your DMs', "Head to your DMs to continue. I've sent you a message.")],
        ephemeral: true,
      });
    } else {
      // Used directly in DMs — acknowledge silently then start workflow
      await interaction.deferReply({ ephemeral: true });
      await interaction.deleteReply().catch(() => null);
    }
    const { routeDmCommand } = await import('../workflows/postWorkflow.js');
    await routeDmCommand(interaction.user, cmd, client);
    return;
  }

  // /mylogs works in both DMs and servers
  if (cmd === 'mylogs') {
    await handleMyLogs(interaction);
    return;
  }

  // All remaining commands are guild-only (registered as guild commands so
  // Discord won't even show them in DMs, but guard anyway)
  if (!interaction.guild) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Server Only', 'This command can only be used in a server.')],
      ephemeral: true,
    });
    return;
  }

  const member = interaction.member as GuildMember;

  // Moderation commands
  if (['warn', 'mute', 'kick', 'ban', 'note', 'unmute', 'unban', 'mod-logs'].includes(cmd)) {
    if (!isMod(member)) {
      await interaction.reply({ embeds: [buildErrorEmbed('No Permission', 'This command requires Moderator or above.')], ephemeral: true });
      return;
    }
    switch (cmd) {
      case 'warn':     await handleWarn(interaction);    break;
      case 'mute':     await handleMute(interaction);    break;
      case 'kick':     await handleKick(interaction);    break;
      case 'ban':      await handleBan(interaction);     break;
      case 'note':     await handleNote(interaction);    break;
      case 'unmute':   await handleUnmute(interaction);  break;
      case 'unban':    await handleUnban(interaction);   break;
      case 'mod-logs': await handleModLogs(interaction); break;
    }
    return;
  }

  // Marketplace staff commands
  if (['mp-notes', 'marketplace-mute', 'marketplace-unmute', 'delete-post'].includes(cmd)) {
    if (!isMpStaff(member)) {
      await interaction.reply({ embeds: [buildErrorEmbed('No Permission', 'This command requires Marketplace Staff or above.')], ephemeral: true });
      return;
    }
    switch (cmd) {
      case 'mp-notes':           await handleMpNotes(interaction);           break;
      case 'marketplace-mute':   await handleMarketplaceMute(interaction);   break;
      case 'marketplace-unmute': await handleMarketplaceUnmute(interaction);  break;
      case 'delete-post':        await handleDeletePost(interaction, client); break;
    }
    return;
  }

  // Admin commands
  if (['grant-trusted-seller', 'audit-log', 'embed', 'get-delivery'].includes(cmd)) {
    if (!isAdmin(member)) {
      await interaction.reply({ embeds: [buildErrorEmbed('No Permission', 'This command requires Admin.')], ephemeral: true });
      return;
    }
    switch (cmd) {
      case 'grant-trusted-seller': await handleGrantTrustedSeller(interaction);      break;
      case 'audit-log':            await handleAuditLog(interaction);                break;
      case 'embed':                await handleEmbed(interaction, client);           break;
      case 'get-delivery':         await handleGetDelivery(interaction);             break;
    }
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// /mp-notes
// ─────────────────────────────────────────────────────────────────────────────

async function handleMpNotes(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const target   = interaction.options.getUser('user', true);
  const noteText = interaction.options.getString('note');

  if (noteText) {
    await upsertUser(target.id, target.tag);
    await addMpNote(target.id, noteText, interaction.user.id);
    await interaction.editReply({ embeds: [buildSuccessEmbed('Note Added', `Marketplace note added to <@${target.id}>.`)] });
  } else {
    const notes = await getMpNotes(target.id);
    if (!notes.length) {
      await interaction.editReply({ embeds: [buildInfoEmbed('MP Notes', `No marketplace notes found for <@${target.id}>.`)] });
      return;
    }
    const lines = notes.map(n =>
      `<t:${Math.floor(new Date(n.created_at).getTime() / 1000)}:d> by <@${n.added_by}>: ${n.note_text}`
    ).join('\n');
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(config.colours.system)
        .setTitle(`MP Notes: ${target.tag}`)
        .setDescription(lines.slice(0, 4000))
        .setFooter({ text: 'DevVault' })
      ],
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// /marketplace-mute
// ─────────────────────────────────────────────────────────────────────────────

async function handleMarketplaceMute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const target      = interaction.options.getUser('user', true);
  const durationStr = interaction.options.getString('duration', true);
  const reason      = interaction.options.getString('reason', true);

  const isPerm     = durationStr === '0' || durationStr.toLowerCase() === 'perm';
  const durationMs = isPerm ? null : parseDuration(durationStr);
  if (!isPerm && !durationMs) {
    await interaction.editReply({ embeds: [buildErrorEmbed('Invalid Duration', 'Use formats like 7d, 30d, or 0 for permanent.')] });
    return;
  }

  const expiresAt = durationMs ? new Date(Date.now() + durationMs) : undefined;
  const label     = isPerm ? 'Permanent' : durationStr;

  await upsertUser(target.id, target.tag);
  await updateUserMpMute(target.id, true, expiresAt);
  await createModEntry({
    userId: target.id, actionType: 'marketplace_mute', reason,
    durationDays: durationMs ? Math.ceil(durationMs / 86_400_000) : undefined,
    moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, expiresAt,
  });

  try {
    const { buildAppealButton } = await import('../utils/embeds.js');
    await target.send({
      embeds: [buildInfoEmbed('Marketplace Restriction', `You have been restricted from marketplace features.\n\n**Reason:** ${reason}\n**Duration:** ${label}`)],
      components: [buildAppealButton()],
    });
  } catch { /* DMs off */ }

  const { logMod } = await import('../utils/logger.js');
  await logMod({ action: 'Marketplace Mute', targetId: target.id, targetTag: target.tag, moderatorId: interaction.user.id, reason, duration: label });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Muted', `<@${target.id}> is now marketplace restricted for ${label}.`)] });
}

// ─────────────────────────────────────────────────────────────────────────────
// /marketplace-unmute
// ─────────────────────────────────────────────────────────────────────────────

async function handleMarketplaceUnmute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getUser('user', true);
  const reason = interaction.options.getString('reason', true);

  await updateUserMpMute(target.id, false);
  const entries = await getActiveModEntries(target.id);
  const mute    = entries.find(e => e.action_type === 'marketplace_mute');
  if (mute) await deactivateModEntry(mute.entry_id, interaction.user.id, reason);

  try { await target.send({ embeds: [buildSuccessEmbed('Restriction Removed', 'Your marketplace restriction has been removed.')] }); }
  catch { /* DMs off */ }

  const { logMod } = await import('../utils/logger.js');
  await logMod({ action: 'Marketplace Unmute', targetId: target.id, targetTag: target.tag, moderatorId: interaction.user.id, reason });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Unmuted', `<@${target.id}>'s marketplace restriction has been removed.`)] });
}

// ─────────────────────────────────────────────────────────────────────────────
// /grant-trusted-seller
// ─────────────────────────────────────────────────────────────────────────────

async function handleGrantTrustedSeller(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getMember('user') as GuildMember | null;
  if (!target) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'User not found.')] }); return; }

  const hasSub   = target.roles.cache.has(config.roles.main.marketplaceSubscriber);
  const skillIds = [
    config.roles.main.scripter, config.roles.main.uiDesigner, config.roles.main.builder,
    config.roles.main.animator, config.roles.main.vfx,        config.roles.main.modeller,
  ];
  const hasSkill = skillIds.some(id => target.roles.cache.has(id));

  if (!hasSub)   { await interaction.editReply({ embeds: [buildErrorEmbed('Cannot Grant', 'User does not have Marketplace Subscriber.')] }); return; }
  if (!hasSkill) { await interaction.editReply({ embeds: [buildErrorEmbed('Cannot Grant', 'User does not have a skill role.')] }); return; }

  const active = await getActiveModEntries(target.id);
  if (active.some(e => e.action_type === 'ban' || e.action_type === 'marketplace_mute')) {
    await interaction.editReply({ embeds: [buildErrorEmbed('Cannot Grant', 'User has active severe punishments.')] }); return;
  }

  await target.roles.add(config.roles.main.trustedSeller);
  try { await target.user.send({ embeds: [buildSuccessEmbed('Trusted Seller', 'You have been granted the Trusted Seller role on DevVault.')] }); }
  catch { /* DMs off */ }

  const { logMod } = await import('../utils/logger.js');
  await logMod({ action: 'Trusted Seller Granted', targetId: target.id, targetTag: target.user.tag, moderatorId: interaction.user.id, reason: 'Manual grant by Admin' });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Done', `Trusted Seller role granted to <@${target.id}>.`)] });
}

// ─────────────────────────────────────────────────────────────────────────────
// /audit-log
// ─────────────────────────────────────────────────────────────────────────────

async function handleAuditLog(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const { query } = await import('../db/index.js');
  const res = await query(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20`);
  if (!res.rows.length) {
    await interaction.editReply({ embeds: [buildInfoEmbed('Audit Log', 'No recent audit entries.')] });
    return;
  }
  const lines = res.rows.map((r: { event_type: string; detail: string; error_code: string; created_at: Date }) =>
    `**${r.event_type}** | <t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:d> | ${r.detail || ''} ${r.error_code ? `(${r.error_code})` : ''}`
  ).join('\n');
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(config.colours.system).setTitle('Audit Log').setDescription(lines.slice(0, 4000)).setFooter({ text: 'DevVault' })],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// /get-delivery
// ─────────────────────────────────────────────────────────────────────────────

async function handleGetDelivery(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const postIdRaw = interaction.options.getString('post_id', true).toUpperCase();
  const { getPost }  = await import('../db/helpers.js');
  const { logMisc }  = await import('../utils/logger.js');
  const { query }    = await import('../db/index.js');

  const post = await getPost(postIdRaw);
  if (!post) {
    await interaction.editReply({ embeds: [buildErrorEmbed('Not Found', `No post found with ID ${postIdRaw}.`)] });
    return;
  }
  if (post.post_type !== 'ASSET') {
    await interaction.editReply({ embeds: [buildErrorEmbed('Not an Asset', `${postIdRaw} is a ${post.post_type} post. Delivery links only exist on asset posts.`)] });
    return;
  }
  if (!post.asset_delivery) {
    await interaction.editReply({ embeds: [buildErrorEmbed('No Delivery Link', `${postIdRaw} does not have a stored delivery link.`)] });
    return;
  }

  await query(
    `INSERT INTO audit_log (event_type, detail) VALUES ($1, $2)`,
    ['delivery_link_accessed', `Admin ${interaction.user.tag} (${interaction.user.id}) accessed delivery link for ${postIdRaw}`]
  );
  await logMisc('delivery_link_accessed', `${interaction.user.tag} accessed delivery for ${postIdRaw}`);

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(config.colours.system)
      .setTitle(`Delivery Link: ${postIdRaw}`)
      .addFields(
        { name: 'Post',     value: post.title,               inline: true },
        { name: 'Seller',   value: `<@${post.user_id}>`,     inline: true },
        { name: 'Status',   value: post.status,              inline: true },
        { name: 'Delivery', value: post.asset_delivery,      inline: false },
      )
      .setFooter({ text: `Accessed by ${interaction.user.tag} - this access has been logged` })
      .setTimestamp()
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// /delete-post
// ─────────────────────────────────────────────────────────────────────────────

async function handleDeletePost(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  const postIdOpt = interaction.options.getString('post_id');
  const userOpt   = interaction.options.getUser('user');

  if (!postIdOpt && !userOpt) {
    await interaction.reply({ embeds: [buildErrorEmbed('Missing Input', 'Provide either a post ID or a user.')], ephemeral: true });
    return;
  }

  const { getPost, updatePostStatus, getUserPosts } = await import('../db/helpers.js');
  const { logPost } = await import('../utils/logger.js');

  if (postIdOpt) {
    await interaction.deferReply({ ephemeral: true });
    const post = await getPost(postIdOpt.toUpperCase());
    if (!post) {
      await interaction.editReply({ embeds: [buildErrorEmbed('Not Found', `No post found with ID ${postIdOpt}.`)] });
      return;
    }

    if (post.discord_message_id && post.status === 'live') {
      try {
        const { skillRoleMap, assetCategoryMap } = await import('../config/index.js');
        let channelId = '';
        if (post.post_type === 'FH')       channelId = Object.values(skillRoleMap).find(s => s.label === post.category)?.mainFH ?? '';
        else if (post.post_type === 'LFD') channelId = Object.values(skillRoleMap).find(s => s.label === post.category)?.mainLFD ?? '';
        else                               channelId = Object.values(assetCategoryMap).find(c => c.label === post.category)?.mainChannel ?? '';
        if (channelId) {
          const ch  = await client.channels.fetch(channelId) as import('discord.js').TextChannel;
          const msg = await ch.messages.fetch(post.discord_message_id);
          await msg.delete();
        }
      } catch { /* already gone */ }
    }

    await updatePostStatus(post.post_id, 'deleted');
    try {
      const user = await client.users.fetch(post.user_id);
      await user.send({ embeds: [buildErrorEmbed('Post Removed', `Your post has been removed by Marketplace Staff.\n\n-# ${post.post_id}`)] });
    } catch { /* DMs off */ }

    await logPost({ action: 'Deleted by Staff', postId: post.post_id, userId: post.user_id, username: post.user_id, actionedBy: interaction.user.id });
    await interaction.editReply({ embeds: [buildSuccessEmbed('Deleted', `Post ${post.post_id} has been removed.`)] });
    return;
  }

  // User post picker via dropdown
  const posts  = await getUserPosts(userOpt!.id);
  const active = posts.filter(p => ['live', 'pending', 'archived'].includes(p.status));
  if (!active.length) {
    await interaction.reply({ embeds: [buildInfoEmbed('No Posts', `<@${userOpt!.id}> has no active posts.`)], ephemeral: true });
    return;
  }

  const { StringSelectMenuBuilder: SSM, StringSelectMenuOptionBuilder: SSOB, ActionRowBuilder: ARB } = await import('discord.js');
  const select = new SSM()
    .setCustomId(`staff_delete_post_${userOpt!.id}`)
    .setPlaceholder('Select a post to delete')
    .addOptions(active.slice(0, 25).map(p =>
      new SSOB().setLabel(`${p.post_id} - ${p.title.slice(0, 60)}`).setValue(p.post_id).setDescription(`${p.post_type} | ${p.status}`)
    ));

  await interaction.reply({
    embeds: [buildInfoEmbed('Select Post to Delete', `Choose a post from <@${userOpt!.id}>.`)],
    components: [new ARB<InstanceType<typeof SSM>>().addComponents(select)],
    ephemeral: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// /embed
// ─────────────────────────────────────────────────────────────────────────────

const embedSessions = new Map<string, string>();

export function getEmbedSession(userId: string): string | undefined {
  return embedSessions.get(userId);
}

export function clearEmbedSession(userId: string): void {
  embedSessions.delete(userId);
}

async function handleEmbed(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  const guild    = await client.guilds.fetch(config.servers.main);
  const channels = [...guild.channels.cache.values()]
    .filter(c => c.type === 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25);

  if (!channels.length) {
    await interaction.reply({ embeds: [buildErrorEmbed('No Channels', 'No text channels found.')], ephemeral: true });
    return;
  }

  const { StringSelectMenuBuilder: SSM, StringSelectMenuOptionBuilder: SSOB, ActionRowBuilder: ARB } = await import('discord.js');
  const select = new SSM()
    .setCustomId('embed_channel_select')
    .setPlaceholder('Choose a channel')
    .addOptions(channels.map(c => new SSOB().setLabel(`# ${c.name}`).setValue(c.id)));

  await interaction.reply({
    embeds: [buildInfoEmbed('Send Embed', 'Pick the channel to send the embed to.')],
    components: [new ARB<InstanceType<typeof SSM>>().addComponents(select)],
    ephemeral: true,
  });
}

export async function handleEmbedChannelSelect(
  interaction: import('discord.js').StringSelectMenuInteraction,
  client: Client
): Promise<void> {
  const channelId = interaction.values[0];
  embedSessions.set(interaction.user.id, channelId);
  const guild   = await client.guilds.fetch(config.servers.main);
  const channel = guild.channels.cache.get(channelId);
  await interaction.update({
    embeds: [buildInfoEmbed(
      'Send Your Content',
      `Channel: <#${channelId}>\n\nSend your next message in this server and it will be posted as an embed in **#${channel?.name ?? channelId}**. Markdown is supported. Type **cancel** to stop.`
    )],
    components: [],
  });
}

export async function handleEmbedContent(message: import('discord.js').Message, client: Client): Promise<void> {
  const channelId = embedSessions.get(message.author.id);
  if (!channelId) return;
  embedSessions.delete(message.author.id);

  if (message.content.trim().toLowerCase() === 'cancel') {
    await message.reply({ embeds: [buildInfoEmbed('Cancelled', 'Embed cancelled.')] });
    return;
  }

  try {
    const targetChannel = await client.channels.fetch(channelId) as import('discord.js').TextChannel;
    await targetChannel.send({
      embeds: [new EmbedBuilder()
        .setColor(config.colours.system)
        .setDescription(message.content)
        .setFooter({ text: 'DevVault' })
        .setTimestamp()
      ],
    });
    await message.reply({ embeds: [buildSuccessEmbed('Sent', `Embed posted to <#${channelId}>.`)] });
  } catch (e) {
    await message.reply({ embeds: [buildErrorEmbed('Failed', `Could not send embed: ${(e as Error).message}`)] });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function parseDuration(str: string): number | null {
  const m = str.match(/^(\d+)(h|d|w)$/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  const u = m[2].toLowerCase();
  if (u === 'h') return n * 3_600_000;
  if (u === 'd') return n * 86_400_000;
  if (u === 'w') return n * 7 * 86_400_000;
  return null;
}
