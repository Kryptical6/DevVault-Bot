// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — TICKET SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
import {
  Client, Message, TextChannel, ButtonInteraction,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder
} from 'discord.js';
import { config } from '../config/index.js';
import {
  createTicket, getTicketByChannel, getOpenTicketByUser,
  updateTicket, upsertUser
} from '../db/helpers.js';
import { buildInfoEmbed, buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';
import { logTicket } from '../utils/logger.js';

let ticketClient: Client | null = null;
export function setTicketClient(c: Client): void { ticketClient = c; }

// ─── CREATE TICKET ────────────────────────────────────────────────────────────

export async function handleCreateTicket(
  userId: string,
  ticketType: 'marketplace' | 'moderation' | 'support'
): Promise<void> {
  if (!ticketClient) return;

  const existing = await getOpenTicketByUser(userId);
  if (existing) {
    try {
      const user = await ticketClient.users.fetch(userId);
      await user.send({ embeds: [buildErrorEmbed('Ticket Already Open', 'You already have an open ticket. Please wait for it to be resolved before opening a new one.')] });
    } catch { /* DMs off */ }
    return;
  }

  await upsertUser(userId, '');
  const user     = await ticketClient.users.fetch(userId);
  const guild    = await ticketClient.guilds.fetch(config.servers.staff);
  const catId    = config.channels.ticketCategories[ticketType];
  const safeName = user.username.slice(0, 10).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'user';
  const chanName = `ticket-${ticketType}-${safeName}-${Date.now().toString(36)}`;

  const channel = await guild.channels.create({ name: chanName, parent: catId }) as TextChannel;
  const ticket  = await createTicket(userId, ticketType, channel.id);

  const typeLabel: Record<string, string> = { marketplace: 'Marketplace', moderation: 'Moderation', support: 'Support' };

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(config.colours.system)
      .setTitle(`${typeLabel[ticketType]} Ticket`)
      .addFields([
        { name: 'User',      value: `${user.tag} (<@${userId}>)`, inline: true },
        { name: 'Ticket ID', value: ticket.ticket_id,             inline: true },
        { name: 'Type',      value: typeLabel[ticketType],        inline: true },
      ])
      .setFooter({ text: 'DevVault' })
      .setTimestamp()
    ],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket_claim_${ticket.ticket_id}`).setLabel('Claim').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket_close_${ticket.ticket_id}`).setLabel('Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket_escalate_${ticket.ticket_id}`).setLabel('Escalate').setStyle(ButtonStyle.Secondary),
    )],
  });

  await user.send({ embeds: [buildInfoEmbed('Ticket Created', `Your ${typeLabel[ticketType].toLowerCase()} ticket has been opened. Type your message here and staff will see it.\n\n-# ${ticket.ticket_id}`)] });
  await logTicket({ action: 'Opened', ticketId: ticket.ticket_id, userId, userTag: user.tag, type: ticketType });
}

// ─── MIRROR: USER DM -> STAFF ─────────────────────────────────────────────────

export async function mirrorToStaff(message: Message): Promise<void> {
  if (!ticketClient || message.author.bot) return;
  const ticket = await getOpenTicketByUser(message.author.id);
  if (!ticket) return;
  try {
    const channel = await ticketClient.channels.fetch(ticket.channel_id) as TextChannel;
    const embed   = new EmbedBuilder()
      .setColor(config.colours.system)
      .setDescription(message.content || '[attachment]')
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();
    await channel.send({ embeds: [embed], files: message.attachments.map(a => a.url) });
  } catch { /* channel gone */ }
}

// ─── MIRROR: STAFF -> USER DM ─────────────────────────────────────────────────

export async function mirrorToUser(message: Message): Promise<void> {
  if (!ticketClient || message.author.bot) return;
  if (!message.guild || message.guild.id !== config.servers.staff) return;
  if (message.content.startsWith('!!')) return;           // Staff-only prefix, not mirrored

  const ticket = await getTicketByChannel(message.channelId);
  if (!ticket || ticket.status !== 'open') return;

  try {
    const user  = await ticketClient.users.fetch(ticket.user_id);
    const embed = new EmbedBuilder()
      .setColor(config.colours.system)
      .setDescription(message.content || '[attachment]')
      .setAuthor({ name: 'DevVault Staff' })
      .setTimestamp();
    await user.send({ embeds: [embed], files: message.attachments.map(a => a.url) });
  } catch { /* DMs off */ }
}

// ─── TICKET ACTIONS ───────────────────────────────────────────────────────────

export async function handleTicketClaim(interaction: ButtonInteraction, ticketId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Ticket not found.')] }); return; }
  await updateTicket(ticketId, { claimed_by: interaction.user.id });
  await (interaction.channel as TextChannel | null)?.send({ embeds: [buildInfoEmbed('Ticket Claimed', `Claimed by <@${interaction.user.id}>.`)] });
  await logTicket({ action: 'Claimed', ticketId, userId: ticket.user_id, userTag: ticket.user_id, type: ticket.ticket_type, staffId: interaction.user.id });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Claimed', 'You have claimed this ticket.')] });
}

export async function handleTicketClose(interaction: ButtonInteraction, ticketId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!ticketClient) return;
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Ticket not found.')] }); return; }
  await updateTicket(ticketId, { status: 'closed', closed_at: new Date() });
  try { await (await ticketClient.users.fetch(ticket.user_id)).send({ embeds: [buildInfoEmbed('Ticket Closed', `Your ticket (${ticketId}) has been closed.`)] }); } catch { /* DMs off */ }
  await logTicket({ action: 'Closed', ticketId, userId: ticket.user_id, userTag: ticket.user_id, type: ticket.ticket_type, staffId: interaction.user.id });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Closed', 'Ticket closed.')] });
  setTimeout(async () => { try { await interaction.channel?.delete(); } catch { /* gone */ } }, 5_000);
}

export async function handleTicketEscalate(interaction: ButtonInteraction, ticketId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return;
  await (interaction.channel as TextChannel | null)?.send({ embeds: [buildInfoEmbed('Escalated', `Escalated by <@${interaction.user.id}>.`)] });
  await logTicket({ action: 'Escalated', ticketId, userId: ticket.user_id, userTag: ticket.user_id, type: ticket.ticket_type, staffId: interaction.user.id });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Escalated', 'Ticket escalated.')] });
}
