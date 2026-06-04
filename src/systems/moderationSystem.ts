// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — MODERATION SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
import {
  Client, Guild, GuildMember, TextChannel,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalActionRowComponentBuilder,
  ChatInputCommandInteraction, ModalSubmitInteraction,
  ButtonInteraction, EmbedBuilder
} from 'discord.js';
import { config } from '../config/index.js';
import {
  upsertUser, createModEntry, getModHistory, getActiveModEntries,
  deactivateModEntry, updateUserMpMute, updateUserBan, incrementWarnCount
} from '../db/helpers.js';
import { buildInfoEmbed, buildSuccessEmbed, buildErrorEmbed, buildAppealButton, buildBanServerButton } from '../utils/embeds.js';
import { logMod } from '../utils/logger.js';

let modClient: Client | null = null;
export function setModClient(c: Client): void { modClient = c; }

// ─── PENDING BAN CONFIRMATIONS ────────────────────────────────────────────────
// userId -> ban data awaiting a second staff member's confirmation
interface PendingBan {
  targetId: string;
  reason: string;
  label: string;
  isPerm: boolean;
  durationMs: number | null;
  isAppealable: boolean;
  issuerId: string;
  issuerTag: string;
}
const pendingBans = new Map<string, PendingBan>();

// ─── BAN EXPIRY ───────────────────────────────────────────────────────────────

export function scheduleBanExpiry(userId: string, expiresAt: Date): void {
  const delay = expiresAt.getTime() - Date.now();
  if (delay <= 0) { void handleBanExpiry(userId); return; }
  setTimeout(() => void handleBanExpiry(userId), delay);
}

async function handleBanExpiry(userId: string): Promise<void> {
  if (!modClient) return;
  try {
    await updateUserBan(userId, false);
    const user = await modClient.users.fetch(userId);
    const embed = buildSuccessEmbed('Ban Expired', "Your ban from DevVault has expired. You're welcome to rejoin.");
    await user.send({
      embeds: [embed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Rejoin DevVault').setStyle(ButtonStyle.Link).setURL(config.serverInvite || config.banServerInvite)
      )],
    });
  } catch { /* DMs off */ }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

function durationDays(ms: number | null): number | undefined {
  return ms ? Math.ceil(ms / 86_400_000) : undefined;
}

// ─── /warn ────────────────────────────────────────────────────────────────────

export async function handleWarn(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getMember('user') as GuildMember | null;
  if (!target) { await interaction.reply({ embeds: [buildErrorEmbed('Error', 'User not found.')], ephemeral: true }); return; }
  await interaction.showModal(
    new ModalBuilder().setCustomId(`warn_modal_${target.id}`).setTitle('Issue Warning').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
      )
    )
  );
}

export async function handleWarnModal(interaction: ModalSubmitInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue('reason');
  await upsertUser(targetId, '');
  await incrementWarnCount(targetId);
  await createModEntry({ userId: targetId, actionType: 'warn', reason, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag });

  // DM user — no server link for warns
  try {
    const user = await interaction.client.users.fetch(targetId);
    await user.send({
      embeds: [buildInfoEmbed('Warning Issued', `You have received a warning in DevVault.\n\n**Reason:** ${reason}`)],
    });
  } catch { /* DMs off */ }

  await logMod({ action: 'Warn', targetId, targetTag: targetId, moderatorId: interaction.user.id, reason });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Warning Issued', `Warning issued to <@${targetId}>.`)] });
}

// ─── /mute ────────────────────────────────────────────────────────────────────

export async function handleMute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getMember('user') as GuildMember | null;
  if (!target) { await interaction.reply({ embeds: [buildErrorEmbed('Error', 'User not found.')], ephemeral: true }); return; }
  await interaction.showModal(
    new ModalBuilder().setCustomId(`mute_modal_${target.id}`).setTitle('Mute User').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('duration').setLabel('Duration (e.g. 1h, 12h, 3d)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
      ),
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
      )
    )
  );
}

export async function handleMuteModal(interaction: ModalSubmitInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const durationStr = interaction.fields.getTextInputValue('duration');
  const reason      = interaction.fields.getTextInputValue('reason');
  const durationMs  = parseDuration(durationStr);
  if (!durationMs) { await interaction.editReply({ embeds: [buildErrorEmbed('Invalid Duration', 'Use formats like 1h, 12h, 3d, 7d.')] }); return; }
  const member = await (interaction.guild as Guild).members.fetch(targetId).catch(() => null);
  if (!member) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Member not found.')] }); return; }

  // DM before action — no server link for mutes
  try {
    await member.user.send({
      embeds: [buildInfoEmbed('Muted', `You have been muted in DevVault.\n\n**Reason:** ${reason}\n**Duration:** ${durationStr}`)],
    });
  } catch { /* DMs off */ }

  await member.timeout(durationMs, reason);
  await upsertUser(targetId, member.user.tag);
  const expiresAt = new Date(Date.now() + durationMs);
  await createModEntry({ userId: targetId, actionType: 'mute', reason, durationDays: durationDays(durationMs), moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, expiresAt });
  await logMod({ action: 'Mute', targetId, targetTag: member.user.tag, moderatorId: interaction.user.id, reason, duration: durationStr });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Muted', `<@${targetId}> muted for ${durationStr}.`)] });
}

// ─── /kick ────────────────────────────────────────────────────────────────────

export async function handleKick(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getMember('user') as GuildMember | null;
  if (!target) { await interaction.reply({ embeds: [buildErrorEmbed('Error', 'User not found.')], ephemeral: true }); return; }
  await interaction.showModal(
    new ModalBuilder().setCustomId(`kick_modal_${target.id}`).setTitle('Kick User').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
      )
    )
  );
}

export async function handleKickModal(interaction: ModalSubmitInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue('reason');
  const member = await (interaction.guild as Guild).members.fetch(targetId).catch(() => null);
  if (!member) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Member not found.')] }); return; }

  // DM before action — include appeals server link
  try {
    await member.user.send({
      embeds: [buildInfoEmbed('Kicked', `You have been kicked from DevVault.\n\n**Reason:** ${reason}\n\nYou are welcome to rejoin. If you believe this was in error, you can appeal.`)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Rejoin / Appeal').setStyle(ButtonStyle.Link).setURL(config.banServerInvite)
      )],
    });
  } catch { /* DMs off */ }

  await member.kick(reason);
  await upsertUser(targetId, member.user.tag);
  await createModEntry({ userId: targetId, actionType: 'kick', reason, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag });
  await logMod({ action: 'Kick', targetId, targetTag: member.user.tag, moderatorId: interaction.user.id, reason });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Kicked', `<@${targetId}> kicked.`)] });
}

// ─── /ban ─────────────────────────────────────────────────────────────────────

export async function handleBan(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getMember('user') as GuildMember | null;
  if (!target) { await interaction.reply({ embeds: [buildErrorEmbed('Error', 'User not found.')], ephemeral: true }); return; }
  await interaction.showModal(
    new ModalBuilder().setCustomId(`ban_modal_${target.id}`).setTitle('Ban User').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('duration').setLabel('Duration (e.g. 7d, 30d, or 0 for permanent)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)
      ),
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
      ),
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('appealable').setLabel('Appealable? (yes / no)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue('yes')
      )
    )
  );
}

export async function handleBanModal(interaction: ModalSubmitInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const durationStr  = interaction.fields.getTextInputValue('duration');
  const reason       = interaction.fields.getTextInputValue('reason');
  const appealInput  = interaction.fields.getTextInputValue('appealable').trim().toLowerCase();
  const isAppealable = appealInput !== 'no';
  const isPerm       = durationStr === '0' || durationStr.toLowerCase() === 'perm';
  const durationMs   = isPerm ? null : parseDuration(durationStr);
  const label        = isPerm ? 'Permanent' : durationStr;
  const days         = durationMs ? Math.ceil(durationMs / 86_400_000) : 0;

  if (!isPerm && !durationMs) {
    await interaction.editReply({ embeds: [buildErrorEmbed('Invalid Duration', 'Use formats like 7d, 30d, or 0 for permanent.')] });
    return;
  }

  // Gate: bans over 30 days or permanent require a second staff member to confirm
  if (isPerm || days > 30) {
    const pendingId = `${interaction.user.id}_${targetId}_${Date.now()}`;
    pendingBans.set(pendingId, {
      targetId, reason, label, isPerm, durationMs, isAppealable,
      issuerId: interaction.user.id, issuerTag: interaction.user.tag,
    });

    const confirmEmbed = new EmbedBuilder()
      .setColor(config.colours.moderation)
      .setTitle('Ban Confirmation Required')
      .setDescription(`A ban of **${label}** has been requested for <@${targetId}>.\n\nThis requires confirmation from a second staff member before executing.`)
      .addFields(
        { name: 'Reason',     value: reason,                         inline: false },
        { name: 'Duration',   value: label,                          inline: true  },
        { name: 'Appealable', value: isAppealable ? 'Yes' : 'No',    inline: true  },
        { name: 'Issued by',  value: `<@${interaction.user.id}>`,    inline: true  },
      )
      .setFooter({ text: `DevVault | Pending ID: ${pendingId}` })
      .setTimestamp();

    const logCh = await interaction.client.channels.fetch(config.channels.staff.logs.mod) as TextChannel;
    await logCh.send({
      content: `<@&${config.roles.staff.admin}> <@&${config.roles.main.admin}> A ban confirmation is required.`,
      embeds: [confirmEmbed],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ban_confirm_${pendingId}`).setLabel('Confirm and Execute').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`ban_cancel_${pendingId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      )],
    });

    await interaction.editReply({ embeds: [buildInfoEmbed('Confirmation Requested', `This ban requires a second staff member to confirm. A request has been posted in the mod log channel.\n\n-# Pending ID: ${pendingId}`)] });
    return;
  }

  // Under 30 days — execute immediately
  await executeBan(interaction.client, targetId, reason, label, isPerm, durationMs, isAppealable, interaction.user.id, interaction.user.tag);
  await interaction.editReply({ embeds: [buildSuccessEmbed('Banned', `<@${targetId}> banned for ${label}.`)] });
}

// ─── BAN CONFIRMATION BUTTONS ─────────────────────────────────────────────────

export async function handleBanConfirm(interaction: ButtonInteraction, pendingId: string): Promise<void> {
  if (interaction.user.id === pendingBans.get(pendingId)?.issuerId) {
    await interaction.reply({ embeds: [buildErrorEmbed('Cannot Confirm', 'You cannot confirm your own ban request. A different staff member must confirm.')], ephemeral: true });
    return;
  }
  const data = pendingBans.get(pendingId);
  if (!data) { await interaction.reply({ embeds: [buildErrorEmbed('Expired', 'This ban request has already been actioned or expired.')], ephemeral: true }); return; }
  pendingBans.delete(pendingId);

  await interaction.deferUpdate();
  await executeBan(interaction.client, data.targetId, data.reason, data.label, data.isPerm, data.durationMs, data.isAppealable, data.issuerId, data.issuerTag);

  await interaction.editReply({
    embeds: [buildSuccessEmbed('Ban Executed', `<@${data.targetId}> has been banned.\n\n**Duration:** ${data.label}\n**Confirmed by:** <@${interaction.user.id}>`)],
    components: [],
  });
}

export async function handleBanCancel(interaction: ButtonInteraction, pendingId: string): Promise<void> {
  const data = pendingBans.get(pendingId);
  if (!data) { await interaction.reply({ embeds: [buildErrorEmbed('Expired', 'This ban request has already been actioned or expired.')], ephemeral: true }); return; }
  pendingBans.delete(pendingId);
  await interaction.update({
    embeds: [buildInfoEmbed('Ban Cancelled', `The ban request for <@${data.targetId}> was cancelled by <@${interaction.user.id}>.`)],
    components: [],
  });
}

async function executeBan(
  client: import('discord.js').Client,
  targetId: string,
  reason: string,
  label: string,
  isPerm: boolean,
  durationMs: number | null,
  isAppealable: boolean,
  issuerId: string,
  issuerTag: string,
): Promise<void> {
  const expiresAt = durationMs ? new Date(Date.now() + durationMs) : undefined;

  // DM before banning so it always lands
  try {
    const user = await client.users.fetch(targetId);
    if (isAppealable) {
      await user.send({
        embeds: [buildInfoEmbed('Banned', `You have been banned from DevVault.\n\n**Reason:** ${reason}\n**Duration:** ${label}\n\nYou can join the appeals server to contest this decision.`)],
        components: [buildBanServerButton()],
      });
    } else {
      await user.send({
        embeds: [buildErrorEmbed('Banned', `You have been banned from DevVault.\n\n**Reason:** ${reason}\n**Duration:** ${label}\n\nThis ban is permanent and cannot be appealed.`)],
      });
    }
  } catch { /* DMs off */ }

  // Execute the ban
  const mainGuild = await client.guilds.fetch(config.servers.main);
  const member    = await mainGuild.members.fetch(targetId).catch(() => null);
  if (member) await member.ban({ reason });
  else await mainGuild.bans.create(targetId, { reason });

  await upsertUser(targetId, '');
  await updateUserBan(targetId, true, expiresAt);
  await createModEntry({ userId: targetId, actionType: 'ban', reason, durationDays: durationDays(durationMs), moderatorId: issuerId, moderatorTag: issuerTag, expiresAt });
  if (expiresAt) scheduleBanExpiry(targetId, expiresAt);
  await logMod({ action: isPerm ? (isAppealable ? 'Ban (Permanent, Appealable)' : 'Ban (Permanent, Unappealable)') : `Ban (${label})`, targetId, targetTag: targetId, moderatorId: issuerId, reason, duration: label });
}

// ─── /note ────────────────────────────────────────────────────────────────────

export async function handleNote(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getMember('user') as GuildMember | null;
  if (!target) { await interaction.reply({ embeds: [buildErrorEmbed('Error', 'User not found.')], ephemeral: true }); return; }
  await interaction.showModal(
    new ModalBuilder().setCustomId(`note_modal_${target.id}`).setTitle('Add Note').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
      )
    )
  );
}

export async function handleNoteModal(interaction: ModalSubmitInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const note = interaction.fields.getTextInputValue('note');
  await upsertUser(targetId, '');
  await createModEntry({ userId: targetId, actionType: 'note', reason: note, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag });
  await logMod({ action: 'Note Added', targetId, targetTag: targetId, moderatorId: interaction.user.id, reason: note });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Note Added', `Note added to <@${targetId}>.`)] });
}

// ─── /unmute ──────────────────────────────────────────────────────────────────

export async function handleUnmute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getMember('user') as GuildMember | null;
  if (!target) { await interaction.reply({ embeds: [buildErrorEmbed('Error', 'User not found.')], ephemeral: true }); return; }
  await interaction.showModal(
    new ModalBuilder().setCustomId(`unmute_modal_${target.id}`).setTitle('Remove Mute').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
      )
    )
  );
}

export async function handleUnmuteModal(interaction: ModalSubmitInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue('reason');
  const member = await (interaction.guild as Guild).members.fetch(targetId).catch(() => null);
  if (!member) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Member not found.')] }); return; }
  await member.timeout(null, reason);
  const entries = await getActiveModEntries(targetId);
  const mute = entries.find(e => e.action_type === 'mute');
  if (mute) await deactivateModEntry(mute.entry_id, interaction.user.id, reason);
  try {
    await member.user.send({ embeds: [buildSuccessEmbed('Mute Removed', 'Your mute in DevVault has been removed.')] });
  } catch { /* DMs off */ }
  await logMod({ action: 'Unmute (Early)', targetId, targetTag: member.user.tag, moderatorId: interaction.user.id, reason });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Unmuted', `<@${targetId}> unmuted.`)] });
}

// ─── /unban ───────────────────────────────────────────────────────────────────

export async function handleUnban(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.options.getString('user_id', true);
  await interaction.showModal(
    new ModalBuilder().setCustomId(`unban_modal_${userId}`).setTitle('Remove Ban').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
      )
    )
  );
}

export async function handleUnbanModal(interaction: ModalSubmitInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const reason = interaction.fields.getTextInputValue('reason');
  const guild  = interaction.guild as Guild;
  try { await guild.bans.remove(targetId, reason); }
  catch { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Could not remove ban. User may not be banned.')] }); return; }
  await updateUserBan(targetId, false);
  const entries = await getActiveModEntries(targetId);
  const ban = entries.find(e => e.action_type === 'ban');
  if (ban) await deactivateModEntry(ban.entry_id, interaction.user.id, reason);
  try {
    const user = await interaction.client.users.fetch(targetId);
    await user.send({
      embeds: [buildSuccessEmbed('Ban Removed', 'Your ban from DevVault has been removed. You are welcome to rejoin.')],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel('Rejoin DevVault').setStyle(ButtonStyle.Link).setURL(config.serverInvite || config.banServerInvite)
      )],
    });
  } catch { /* DMs off */ }
  await logMod({ action: 'Unban (Early)', targetId, targetTag: targetId, moderatorId: interaction.user.id, reason });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Unbanned', `<@${targetId}> unbanned.`)] });
}

// ─── /mod-logs ────────────────────────────────────────────────────────────────

export async function handleModLogs(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const target  = interaction.options.getUser('user', true);
  const entries = await getModHistory(target.id);
  if (!entries.length) { await interaction.editReply({ embeds: [buildInfoEmbed('Mod Logs', `No history found for <@${target.id}>.`)] }); return; }
  const lines = entries.map(e => {
    const dur = e.duration_days ? ` | ${e.duration_days}d` : '';
    return `**${e.action_type.toUpperCase()}** <t:${Math.floor(new Date(e.created_at).getTime() / 1000)}:d>${dur} | <@${e.moderator_id}> | ${e.reason}`;
  }).join('\n');
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(config.colours.system).setTitle(`Mod Logs: ${target.tag}`).setDescription(lines.slice(0, 4000)).setFooter({ text: 'DevVault' })],
  });
}

// ─── /mylogs ──────────────────────────────────────────────────────────────────

export async function handleMyLogs(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const entries = await getModHistory(interaction.user.id);
  if (!entries.length) { await interaction.editReply({ embeds: [buildInfoEmbed('Your Logs', 'You have no moderation history.')] }); return; }
  const lines = entries.map(e => {
    const dur = e.duration_days ? ` | ${e.duration_days}d` : '';
    return `**${e.action_type.toUpperCase()}** <t:${Math.floor(new Date(e.created_at).getTime() / 1000)}:d>${dur} | ${e.reason}`;
  }).join('\n');
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(config.colours.system).setTitle('Your Moderation History').setDescription(lines.slice(0, 4000)).setFooter({ text: 'DevVault' })],
  });
}
