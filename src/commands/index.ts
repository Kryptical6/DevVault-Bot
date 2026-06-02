import {
  Client, REST, Routes, SlashCommandBuilder,
  ChatInputCommandInteraction, GuildMember, EmbedBuilder
} from 'discord.js';
import { config, getDenialReasons } from '../config/index.js';
import { getUserPosts, getUserAnalyticsData, getModHistory, addMpNote, upsertUser, getUser } from '../db/helpers.js';
import { buildInfoEmbed, buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';
import {
  handleWarn, handleMute, handleKick, handleBan, handleNote,
  handleUnmute, handleUnban, handleModLogs, handleMyLogs
} from '../systems/moderationSystem.js';

// ─── SLASH COMMAND DEFINITIONS ────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder().setName('post').setDescription('Create a new listing'),
  new SlashCommandBuilder().setName('repost').setDescription('Repost an archived listing'),
  new SlashCommandBuilder().setName('browse').setDescription('Browse marketplace listings'),
  new SlashCommandBuilder().setName('apply').setDescription('Apply for a skill role'),
  new SlashCommandBuilder().setName('ticket').setDescription('Open a support ticket'),
  new SlashCommandBuilder().setName('get-seller').setDescription('Request marketplace access (use if Patreon did not assign your role)'),
  new SlashCommandBuilder().setName('analytics').setDescription('View analytics for your posts'),
  new SlashCommandBuilder().setName('saved').setDescription('View your saved listings'),
  new SlashCommandBuilder().setName('mylogs').setDescription('View your moderation history'),

  // Staff commands
  new SlashCommandBuilder().setName('warn').setDescription('Issue a warning')
    .addUserOption((o) => o.setName('user').setDescription('User to warn').setRequired(true)),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user')
    .addUserOption((o) => o.setName('user').setDescription('User to mute').setRequired(true)),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user')
    .addUserOption((o) => o.setName('user').setDescription('User to kick').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true)),
  new SlashCommandBuilder().setName('note').setDescription('Add an internal note to a user')
    .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('unmute').setDescription('Remove a mute early')
    .addUserOption((o) => o.setName('user').setDescription('User to unmute').setRequired(true)),
  new SlashCommandBuilder().setName('unban').setDescription('Remove a ban early')
    .addStringOption((o) => o.setName('user_id').setDescription('Discord user ID').setRequired(true)),
  new SlashCommandBuilder().setName('mod-logs').setDescription('View moderation history for a user')
    .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('mp-notes').setDescription('Add a marketplace note to a user')
    .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption((o) => o.setName('note').setDescription('Note text').setRequired(true)),
  new SlashCommandBuilder().setName('grant-trusted-seller').setDescription('Grant Trusted Seller role to a user')
    .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true)),
  new SlashCommandBuilder().setName('audit-log').setDescription('View system audit log'),
].map((c) => c.toJSON());

// ─── REGISTER COMMANDS ────────────────────────────────────────────────────────

export async function registerCommands(): Promise<void> {
  const rest = new REST().setToken(config.token);
  try {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.servers.main), { body: commands });
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.servers.staff), { body: commands });
    console.log('[CMD] Slash commands registered.');
  } catch (err: unknown) {
    console.error('[CMD] Failed to register commands:', err instanceof Error ? err.message : err);
  }
}

// ─── PERMISSION HELPERS ───────────────────────────────────────────────────────

function isAdmin(member: GuildMember): boolean {
  return member.roles.cache.has(config.roles.main.admin) || member.roles.cache.has(config.roles.staff.admin);
}

function isMod(member: GuildMember): boolean {
  return isAdmin(member) || member.roles.cache.has(config.roles.main.moderator) || member.roles.cache.has(config.roles.staff.moderator);
}

function isMpStaff(member: GuildMember): boolean {
  return isAdmin(member) || member.roles.cache.has(config.roles.main.marketplaceStaff) || member.roles.cache.has(config.roles.staff.marketplaceStaff);
}

function isVerified(member: GuildMember): boolean {
  return member.roles.cache.has(config.roles.main.verified);
}

// ─── COMMAND HANDLER ──────────────────────────────────────────────────────────

export async function handleCommand(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  const member = interaction.member as GuildMember | null;
  const cmd = interaction.commandName;

  // Commands that redirect to DM
  const dmCommands = ['post', 'repost', 'browse', 'apply', 'ticket', 'get-seller', 'analytics', 'saved'];
  if (dmCommands.includes(cmd) && interaction.guild) {
    await interaction.reply({ embeds: [buildInfoEmbed('Check your DMs', "I've sent you a DM to continue.")], ephemeral: true });
    const { routeDmCommand } = await import('../workflows/postWorkflow.js');
    await routeDmCommand(interaction.user, cmd, client);
    return;
  }

  // User commands
  if (cmd === 'mylogs') {
    await handleMyLogs(interaction);
    return;
  }

  // Staff-only commands
  if (!member) { await interaction.reply({ embeds: [buildErrorEmbed('Error', 'This command must be used in a server.')], ephemeral: true }); return; }

  if (['warn', 'mute', 'kick', 'ban', 'note', 'unmute', 'unban', 'mod-logs'].includes(cmd)) {
    if (!isMod(member)) { await interaction.reply({ embeds: [buildErrorEmbed('No Permission', 'This command requires Moderator or above.')], ephemeral: true }); return; }
  }
  if (['mp-notes', 'grant-trusted-seller'].includes(cmd)) {
    if (!isMpStaff(member)) { await interaction.reply({ embeds: [buildErrorEmbed('No Permission', 'This command requires Marketplace Staff or above.')], ephemeral: true }); return; }
  }
  if (cmd === 'audit-log') {
    if (!isAdmin(member)) { await interaction.reply({ embeds: [buildErrorEmbed('No Permission', 'This command requires Admin.')], ephemeral: true }); return; }
  }

  switch (cmd) {
    case 'warn': await handleWarn(interaction); break;
    case 'mute': await handleMute(interaction); break;
    case 'kick': await handleKick(interaction); break;
    case 'ban': await handleBan(interaction); break;
    case 'note': await handleNote(interaction); break;
    case 'unmute': await handleUnmute(interaction); break;
    case 'unban': await handleUnban(interaction); break;
    case 'mod-logs': await handleModLogs(interaction); break;
    case 'mp-notes': await handleMpNotesCommand(interaction); break;
    case 'grant-trusted-seller': await handleGrantTrustedSeller(interaction, client); break;
    case 'audit-log': await handleAuditLog(interaction); break;
  }
}

// ─── INDIVIDUAL COMMAND HANDLERS ──────────────────────────────────────────────

async function handleMpNotesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getUser('user', true);
  const note = interaction.options.getString('note', true);
  await upsertUser(target.id, target.tag);
  await addMpNote(target.id, note, interaction.user.id);
  await interaction.editReply({ embeds: [buildSuccessEmbed('Note Added', `MP note added to <@${target.id}>.`)] });
}

async function handleGrantTrustedSeller(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getMember('user') as GuildMember | null;
  if (!target) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'User not found.')] }); return; }

  const hasSub = target.roles.cache.has(config.roles.main.marketplaceSubscriber);
  const skillIds = [config.roles.main.scripter, config.roles.main.uiDesigner, config.roles.main.builder, config.roles.main.animator, config.roles.main.vfx, config.roles.main.modeller];
  const hasSkill = skillIds.some((id) => target.roles.cache.has(id));

  if (!hasSub) { await interaction.editReply({ embeds: [buildErrorEmbed('Cannot Grant', 'User does not have Marketplace Subscriber.')] }); return; }
  if (!hasSkill) { await interaction.editReply({ embeds: [buildErrorEmbed('Cannot Grant', 'User does not have a Skill Role.')] }); return; }

  await target.roles.add(config.roles.main.trustedSeller);
  try { await target.user.send({ embeds: [buildSuccessEmbed('Trusted Seller', 'You have been granted the Trusted Seller role on DevVault.')] }); } catch { /* DMs off */ }
  await interaction.editReply({ embeds: [buildSuccessEmbed('Done', `Trusted Seller role granted to <@${target.id}>.`)] });
}

async function handleAuditLog(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const { query } = await import('../db/index.js');
  const res = await query(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 20`);
  if (!res.rows.length) { await interaction.editReply({ embeds: [buildInfoEmbed('Audit Log', 'No recent audit entries.')] }); return; }
  const lines = res.rows.map((r: { event_type: string; detail: string; error_code: string; created_at: Date }) =>
    `**${r.event_type}** | <t:${Math.floor(new Date(r.created_at).getTime() / 1000)}:d> | ${r.detail || ''} ${r.error_code ? `(${r.error_code})` : ''}`
  ).join('\n');
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(config.colours.system).setTitle('Audit Log').setDescription(lines.slice(0, 4000)).setFooter({ text: 'DevVault' })] });
}
