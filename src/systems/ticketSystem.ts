// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — TICKET SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
import {
  Client, Message, TextChannel, ButtonInteraction,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  AttachmentBuilder, ChannelType
} from 'discord.js';
import { config } from '../config/index.js';
import {
  createTicket, getTicket, getTicketByChannel, getOpenTicketByUser,
  updateTicket, upsertUser, logTicketMessage, getTicketMessages,
  buildTicketTranscriptHtml
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
      await user.send({ embeds: [buildErrorEmbed('Ticket Already Open', `You already have an open ticket (${existing.ticket_id}). Please wait for it to be resolved before opening a new one.`)] });
    } catch { /* DMs off */ }
    return;
  }

  await upsertUser(userId, '');
  const user  = await ticketClient.users.fetch(userId);

  // Determine which server to create the ticket in.
  // If the request comes from the appeals server, use the staff server ticket system.
  const guild = await ticketClient.guilds.fetch(config.servers.staff);
  const catId = config.channels.ticketCategories[ticketType];

  const ticket = await createTicket(userId, ticketType, 'pending');
  const shortId = ticket.ticket_id.replace('TKT-', '');

  // Channel name: ticket-0001 (no username until claimed)
  const chanName = `ticket-${shortId}`;

  const channel = await guild.channels.create({
    name: chanName,
    type: ChannelType.GuildText,
    parent: catId,
  }) as TextChannel;

  // Update ticket with real channel ID
  await updateTicket(ticket.ticket_id, { channel_id: channel.id } as Parameters<typeof updateTicket>[1]);

  const typeLabel: Record<string, string> = { marketplace: 'Marketplace', moderation: 'Moderation', support: 'Support' };

  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(config.colours.system)
      .setTitle(`${typeLabel[ticketType]} Ticket | ${ticket.ticket_id}`)
      .addFields([
        { name: 'User',   value: `${user.tag} (<@${userId}>)`, inline: true },
        { name: 'Type',   value: typeLabel[ticketType],        inline: true },
        { name: 'Status', value: 'Open',                       inline: true },
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

  await user.send({ embeds: [buildInfoEmbed('Ticket Opened', `Your ${typeLabel[ticketType].toLowerCase()} ticket has been opened. Send your messages here and staff will see them.\n\n-# ${ticket.ticket_id}`)] });
  await logTicket({ action: 'Opened', ticketId: ticket.ticket_id, userId, userTag: user.tag, type: ticketType });
}

// ─── MIRROR: USER DM → STAFF ─────────────────────────────────────────────────

export async function mirrorToStaff(message: Message): Promise<void> {
  if (!ticketClient || message.author.bot) return;
  const ticket = await getOpenTicketByUser(message.author.id);
  if (!ticket || ticket.channel_id === 'pending') return;

  const attachUrls = message.attachments.map(a => a.url);

  // Log to DB
  await logTicketMessage({
    ticketId: ticket.ticket_id,
    senderId: message.author.id,
    senderTag: message.author.tag,
    direction: 'user',
    content: message.content || '',
    attachments: attachUrls,
  });

  try {
    const channel = await ticketClient.channels.fetch(ticket.channel_id) as TextChannel;
    const embed = new EmbedBuilder()
      .setColor(config.colours.system)
      .setDescription(message.content || '[attachment only]')
      .setAuthor({ name: `${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setFooter({ text: ticket.ticket_id })
      .setTimestamp();
    await channel.send({ embeds: [embed], files: attachUrls });
  } catch { /* channel gone */ }
}

// ─── MIRROR: STAFF → USER DM ─────────────────────────────────────────────────

export async function mirrorToUser(message: Message): Promise<void> {
  if (!ticketClient || message.author.bot) return;
  if (!message.guild || message.guild.id !== config.servers.staff) return;
  if (message.content.startsWith('!!')) return; // Internal staff note — not mirrored

  const ticket = await getTicketByChannel(message.channelId);
  if (!ticket || ticket.status !== 'open') return;

  const attachUrls = message.attachments.map(a => a.url);

  // Log to DB
  await logTicketMessage({
    ticketId: ticket.ticket_id,
    senderId: message.author.id,
    senderTag: message.author.tag,
    direction: 'staff',
    content: message.content || '',
    attachments: attachUrls,
  });

  try {
    const user  = await ticketClient.users.fetch(ticket.user_id);
    const embed = new EmbedBuilder()
      .setColor(config.colours.system)
      .setDescription(message.content || '[attachment only]')
      .setAuthor({ name: 'DevVault Staff' })
      .setFooter({ text: ticket.ticket_id })
      .setTimestamp();
    await user.send({ embeds: [embed], files: attachUrls });
  } catch { /* DMs off */ }
}

// ─── CLAIM ────────────────────────────────────────────────────────────────────

export async function handleTicketClaim(interaction: ButtonInteraction, ticketId: string): Promise<void> {
  await interaction.deferUpdate();
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return;

  await updateTicket(ticketId, { claimed_by: interaction.user.id });

  // Rename channel: claimerUsername-0001
  const safeClaimer = interaction.user.username.slice(0, 16).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const shortId = ticketId.replace('TKT-', '');
  try {
    await (interaction.channel as TextChannel).setName(`${safeClaimer}-${shortId}`);
  } catch { /* rate limited */ }

  await (interaction.channel as TextChannel).send({
    embeds: [buildInfoEmbed('Ticket Claimed', `Claimed by <@${interaction.user.id}>.`)]
  });

  await logTicket({ action: 'Claimed', ticketId, userId: ticket.user_id, userTag: ticket.user_id, type: ticket.ticket_type, staffId: interaction.user.id });
}

// ─── CLOSE ────────────────────────────────────────────────────────────────────

export async function handleTicketClose(interaction: ButtonInteraction, ticketId: string): Promise<void> {
  await interaction.deferUpdate();
  if (!ticketClient) return;

  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return;

  await updateTicket(ticketId, { status: 'closed', closed_at: new Date() });

  // Rename channel: closed-0001
  const shortId = ticketId.replace('TKT-', '');
  let userTag = ticket.user_id;
  try {
    const user = await ticketClient.users.fetch(ticket.user_id);
    userTag = user.tag;
    await (interaction.channel as TextChannel).setName(`closed-${shortId}`);
  } catch { /* rate limited */ }

  // Build HTML transcript, send to ticket log channel, post closure notice in channel
  try {
    const messages = await getTicketMessages(ticketId);
    const html = buildTicketTranscriptHtml(ticketId, userTag, ticket.ticket_type, messages);
    const buf = Buffer.from(html, 'utf-8');
    const attachment = new AttachmentBuilder(buf, { name: `transcript-${ticketId}.html` });

    // Post closure notice + transcript in the ticket channel
    await (interaction.channel as TextChannel).send({
      embeds: [buildInfoEmbed('Ticket Closed', `Closed by <@${interaction.user.id}>.`)],
      files: [attachment],
    });

    // Send transcript to ticket log channel
    try {
      const logChannel = await ticketClient.channels.fetch(config.channels.staff.logs.ticket) as TextChannel;
      await logChannel.send({
        embeds: [buildInfoEmbed('Ticket Transcript', `Ticket **${ticketId}** closed by <@${interaction.user.id}>. User: ${userTag}.`)],
        files: [new AttachmentBuilder(buf, { name: `transcript-${ticketId}.html` })],
      });
    } catch { /* log channel error */ }
  } catch { /* DB error, skip transcript */ }

  await logTicket({ action: 'Closed', ticketId, userId: ticket.user_id, userTag, type: ticket.ticket_type, staffId: interaction.user.id });

  // DM user to let them know the ticket was closed
  try {
    const closedUser = await ticketClient.users.fetch(ticket.user_id);
    await closedUser.send({ embeds: [buildInfoEmbed('Ticket Closed', `Your ticket (${ticketId}) has been closed.`)] });
  } catch { /* DMs off */ }

  // Delete channel after 10 seconds
  setTimeout(async () => {
    try { await interaction.channel?.delete(); } catch { /* already gone */ }
  }, 10_000);
}

// ─── ESCALATE ─────────────────────────────────────────────────────────────────

export async function handleTicketEscalate(interaction: ButtonInteraction, ticketId: string): Promise<void> {
  await interaction.deferUpdate();
  const ticket = await getTicketByChannel(interaction.channelId);
  if (!ticket) return;

  // Ping the staff server admin role so they see this immediately
  await (interaction.channel as TextChannel).send({
    content: `<@&${config.roles.staff.admin}>`,
    embeds: [buildInfoEmbed('Escalated', `Escalated by <@${interaction.user.id}>. This ticket requires Admin attention.`)],
  });

  await logTicket({ action: 'Escalated', ticketId, userId: ticket.user_id, userTag: ticket.user_id, type: ticket.ticket_type, staffId: interaction.user.id });
}
