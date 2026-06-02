// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — SELLER SYSTEM (/get-seller + featured rotation re-export)
// ─────────────────────────────────────────────────────────────────────────────
import {
  Client, ButtonInteraction, ModalSubmitInteraction, TextChannel,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalActionRowComponentBuilder
} from 'discord.js';
import { config } from '../config/index.js';
import { upsertUser } from '../db/helpers.js';
import { buildInfoEmbed, buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';
import { runFeaturedRotation } from './reviewSystem.js';

export { runFeaturedRotation };

let sellerClient: Client | null = null;
export function setApplyClient(c: Client): void { sellerClient = c; }

// ─── /get-seller INITIATION ───────────────────────────────────────────────────

export async function handleGetSeller(userId: string): Promise<void> {
  if (!sellerClient) return;
  const user = await sellerClient.users.fetch(userId);

  try {
    const guild  = await sellerClient.guilds.fetch(config.servers.main);
    const member = await guild.members.fetch(userId);
    if (member.roles.cache.has(config.roles.main.marketplaceSubscriber)) {
      await user.send({ embeds: [buildInfoEmbed('Already Active', 'You already have marketplace access.')] }); return;
    }
  } catch { /* ignore */ }

  await user.send({
    embeds: [buildInfoEmbed('Marketplace Access Request', "If your Patreon subscription didn't assign your role automatically, click below to submit a request. Staff will verify your transaction and assign your role.")],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`get_seller_submit_${userId}`).setLabel('Submit Request').setStyle(ButtonStyle.Primary)
    )],
  });
}

export async function handleGetSellerButton(interaction: ButtonInteraction, userId: string): Promise<void> {
  await interaction.showModal(
    new ModalBuilder().setCustomId(`get_seller_modal_${userId}`).setTitle('Marketplace Access Request').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('transaction_id').setLabel('Patreon Transaction / Order ID').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('e.g. charge_abc123')
      )
    )
  );
}

export async function handleGetSellerModal(interaction: ModalSubmitInteraction, userId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!sellerClient) return;

  const transactionId = interaction.fields.getTextInputValue('transaction_id');
  await upsertUser(userId, interaction.user.tag);

  const staffChannel = await sellerClient.channels.fetch(config.channels.staff.getSellerRequests) as TextChannel;
  await staffChannel.send({
    embeds: [buildInfoEmbed(
      'Get-Seller Request',
      `**User:** ${interaction.user.tag} (<@${userId}>)\n**Transaction ID:** \`${transactionId}\`\n\nVerify against Patreon dashboard before granting.`
    )],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`grant_seller_${userId}`).setLabel('Grant Access').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`deny_seller_${userId}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
    )],
  });

  await interaction.editReply({ embeds: [buildSuccessEmbed('Request Submitted', 'Your request has been submitted. Staff will verify your subscription and assign your role.')] });
}

export async function handleGrantSeller(interaction: ButtonInteraction, userId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!sellerClient) return;
  try {
    const guild  = await sellerClient.guilds.fetch(config.servers.main);
    const member = await guild.members.fetch(userId);
    await member.roles.add(config.roles.main.marketplaceSubscriber);
    await member.user.send({ embeds: [buildSuccessEmbed('Access Granted', 'You now have access to the DevVault marketplace.')] });
  } catch {
    await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Could not assign role. User may have left the server.')] }); return;
  }
  await interaction.message.delete().catch(() => null);
  await interaction.editReply({ embeds: [buildSuccessEmbed('Done', `Marketplace access granted to <@${userId}>.`)] });
}

export async function handleDenySeller(interaction: ButtonInteraction, userId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!sellerClient) return;
  try { await (await sellerClient.users.fetch(userId)).send({ embeds: [buildErrorEmbed('Request Denied', 'Your marketplace access request could not be verified. Please ensure you have an active Patreon subscription.')] }); }
  catch { /* DMs off */ }
  await interaction.message.delete().catch(() => null);
  await interaction.editReply({ embeds: [buildSuccessEmbed('Denied', `Request denied for <@${userId}>.`)] });
}
