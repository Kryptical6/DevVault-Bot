// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — PURCHASE SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
import {
  Client, ButtonInteraction, Message, TextChannel,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} from 'discord.js';
import { config, assetCategoryMap } from '../config/index.js';
import {
  getPost, updatePostStatus, createPurchase, getPurchase,
  updatePurchase, upsertUser, createTicket
} from '../db/helpers.js';
import { buildInfoEmbed, buildSuccessEmbed, buildErrorEmbed } from '../utils/embeds.js';
import { logPost } from '../utils/logger.js';

let purchaseClient: Client | null = null;
export function setPurchaseClient(c: Client): void { purchaseClient = c; }

// userId -> purchaseId (awaiting proof DM)
const awaitingProof = new Map<string, string>();

// ─── BUY ASSET ────────────────────────────────────────────────────────────────

export async function handleBuyAsset(interaction: ButtonInteraction, postId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!purchaseClient) return;

  const post = await getPost(postId);
  if (!post || post.status !== 'live') {
    await interaction.editReply({ embeds: [buildErrorEmbed('Not Available', 'This listing is no longer available.')] }); return;
  }
  if (interaction.user.id === post.user_id) {
    await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'You cannot purchase your own listing.')] }); return;
  }

  await upsertUser(interaction.user.id, interaction.user.tag);
  const purchase = await createPurchase(postId, interaction.user.id, post.user_id);
  awaitingProof.set(interaction.user.id, purchase.purchase_id);

  const paymentLine = post.payment_link ? `\n\n**Payment Link:** ${post.payment_link}` : '';
  await interaction.editReply({
    embeds: [buildInfoEmbed('Purchase Initiated', `Purchase initiated for **${post.title}**.${paymentLine}\n\nOnce you have paid, click below to submit your proof.`)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`submit_purchase_proof_${postId}`).setLabel('Submit Proof of Payment').setStyle(ButtonStyle.Primary)
    )],
  });
  await logPost({ action: 'Purchase Initiated', postId, userId: interaction.user.id, username: interaction.user.tag });
}

// ─── SUBMIT PURCHASE PROOF (button) ──────────────────────────────────────────

export async function handleSubmitPurchaseProof(interaction: ButtonInteraction, postId: string): Promise<void> {
  // Instead of a modal, ask the user to send a DM with their proof
  await interaction.reply({
    embeds: [buildInfoEmbed(
      'Submit Payment Proof',
      'Please send your proof of payment as your next DM to this bot.\n\nYou can:\n- **Upload a file** (screenshot, screen recording)\n- **Paste a direct link** (e.g. a CDN or video URL)\n\nSend your message now.'
    )],
    ephemeral: true,
  });
}

// Called from routeDMMessage when a user has an awaiting purchase proof
export async function handlePurchaseProofDm(message: Message): Promise<boolean> {
  if (!purchaseClient) return false;
  const purchaseId = awaitingProof.get(message.author.id);
  if (!purchaseId) return false;

  // Resolve proof: attachment CDN URL takes priority, then message content as a link
  const attachment = message.attachments.first();
  const proofRef   = attachment?.url ?? message.content.trim();

  if (!proofRef) {
    await message.reply({ embeds: [buildErrorEmbed('No Proof Detected', 'Please send a file attachment or a valid link.')] });
    return true;
  }

  awaitingProof.delete(message.author.id);

  const purchase = await getPurchase(purchaseId);
  if (!purchase) {
    await message.reply({ embeds: [buildErrorEmbed('Error', 'Purchase session expired. Please use Buy Asset again.')] });
    return true;
  }

  await updatePurchase(purchaseId, { status: 'proof_submitted', proof_ref: proofRef });

  const post = await getPost(purchase.post_id);
  if (!post) return true;

  const cat            = Object.values(assetCategoryMap).find(c => c.label === post.category);
  const staffChannelId = cat?.staffChannel ?? config.channels.staff.assets.systems;
  const staffChannel   = await purchaseClient.channels.fetch(staffChannelId) as TextChannel;

  const proofDisplay = attachment
    ? `[Attachment](${proofRef})`
    : proofRef;

  await staffChannel.send({
    embeds: [buildInfoEmbed(
      `Purchase Proof | ${post.post_id}`,
      `**Asset:** ${post.title}\n**Buyer:** <@${purchase.buyer_id}>\n**Seller:** <@${purchase.seller_id}>\n**Proof:** ${proofDisplay}\n\n-# Purchase ID: ${purchaseId}`
    )],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`purchase_approve_${purchaseId}`).setLabel('Approve Payment').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`purchase_deny_${purchaseId}`).setLabel('Deny Payment').setStyle(ButtonStyle.Danger),
    )],
  });

  await message.reply({ embeds: [buildSuccessEmbed('Proof Submitted', 'Your payment proof has been submitted and is being reviewed.')] });
  await logPost({ action: 'Purchase Proof Submitted', postId: post.post_id, userId: message.author.id, username: message.author.tag, extra: `Link: ${proofRef}` });
  return true;
}

// ─── APPROVE PAYMENT ─────────────────────────────────────────────────────────

export async function handlePurchaseApprove(interaction: ButtonInteraction, purchaseId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!purchaseClient) return;

  const purchase = await getPurchase(purchaseId);
  if (!purchase) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Purchase not found.')] }); return; }

  await updatePurchase(purchaseId, { status: 'staff_approved' });

  try {
    const seller = await purchaseClient.users.fetch(purchase.seller_id);
    const post   = await getPost(purchase.post_id);
    await seller.send({
      embeds: [buildInfoEmbed('Payment Confirmation Required', `A buyer has submitted payment for **${post?.title ?? purchase.post_id}**.\n\nPlease confirm whether you received the payment.`)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`seller_confirm_${purchaseId}`).setLabel('Payment Received').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`seller_missing_${purchaseId}`).setLabel('Payment Missing').setStyle(ButtonStyle.Danger),
      )],
    });
  } catch { /* DMs off */ }

  await interaction.message.delete().catch(() => null);
  await interaction.editReply({ embeds: [buildSuccessEmbed('Approved', 'Payment approved. Awaiting seller confirmation.')] });
  await logPost({ action: 'Purchase Proof Approved', postId: purchase.post_id, userId: purchase.buyer_id, username: purchase.buyer_id, actionedBy: interaction.user.id });
}

// ─── DENY PAYMENT ────────────────────────────────────────────────────────────

export async function handlePurchaseDeny(interaction: ButtonInteraction, purchaseId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!purchaseClient) return;

  const purchase = await getPurchase(purchaseId);
  if (!purchase) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Purchase not found.')] }); return; }

  await updatePurchase(purchaseId, { status: 'cancelled' });
  try { await (await purchaseClient.users.fetch(purchase.buyer_id)).send({ embeds: [buildErrorEmbed('Payment Not Verified', 'Your payment proof could not be verified. No delivery will be made. If you believe this is an error, please open a ticket.')] }); }
  catch { /* DMs off */ }

  await interaction.message.delete().catch(() => null);
  await interaction.editReply({ embeds: [buildSuccessEmbed('Denied', 'Purchase denied.')] });
  await logPost({ action: 'Purchase Proof Denied', postId: purchase.post_id, userId: purchase.buyer_id, username: purchase.buyer_id, actionedBy: interaction.user.id });
}

// ─── SELLER CONFIRM ───────────────────────────────────────────────────────────

export async function handleSellerConfirm(interaction: ButtonInteraction, purchaseId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!purchaseClient) return;

  const purchase = await getPurchase(purchaseId);
  if (!purchase) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Purchase not found.')] }); return; }

  const post = await getPost(purchase.post_id);
  await updatePurchase(purchaseId, { status: 'delivered', delivered_at: new Date() });

  try {
    const buyer = await purchaseClient.users.fetch(purchase.buyer_id);
    if (post?.asset_delivery?.startsWith('http')) {
      await buyer.send({
        embeds: [buildSuccessEmbed('Asset Delivered', 'Your asset has been delivered.')],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Download / View').setStyle(ButtonStyle.Link).setURL(post.asset_delivery))],
      });
    } else if (post?.asset_delivery) {
      await buyer.send({ embeds: [buildSuccessEmbed('Asset Delivered', `Your asset has been delivered.\n\n**Reference:** ${post.asset_delivery}`)] });
    } else {
      await buyer.send({ embeds: [buildSuccessEmbed('Payment Confirmed', 'Payment confirmed. Your asset is being delivered.')] });
    }
  } catch { /* DMs off */ }

  if (post?.sale_mode === 'single') {
    try {
      if (post.discord_message_id) {
        const cat = Object.values(assetCategoryMap).find(c => c.label === post.category);
        if (cat) {
          const ch  = await purchaseClient.channels.fetch(cat.mainChannel) as TextChannel;
          const msg = await ch.messages.fetch(post.discord_message_id);
          await msg.delete();
        }
      }
    } catch { /* already gone */ }
    await updatePostStatus(purchase.post_id, 'archived', { archived_at: new Date() });
  }

  await interaction.update({ embeds: [buildSuccessEmbed('Confirmed', 'Payment confirmed. Asset delivered to buyer.')], components: [] });
  await logPost({ action: 'Asset Delivered', postId: purchase.post_id, userId: purchase.buyer_id, username: purchase.buyer_id });
}

// ─── SELLER MISSING ───────────────────────────────────────────────────────────

export async function handleSellerMissing(interaction: ButtonInteraction, purchaseId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!purchaseClient) return;

  const purchase = await getPurchase(purchaseId);
  if (!purchase) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Purchase not found.')] }); return; }

  await updatePurchase(purchaseId, { status: 'disputed' });

  const post = await getPost(purchase.post_id);
  try {
    const guild   = await purchaseClient.guilds.fetch(config.servers.staff);
    const channel = await guild.channels.create({
      name: `dispute-${purchaseId.slice(0, 8)}`,
      parent: config.channels.ticketCategories.support,
    }) as TextChannel;
    await createTicket(purchase.buyer_id, 'support', channel.id);
    await channel.send({
      embeds: [buildInfoEmbed(
        'Payment Dispute',
        `**Seller:** <@${purchase.seller_id}>\n**Buyer:** <@${purchase.buyer_id}>\n**Asset:** ${post?.title ?? purchase.post_id}\n\nSeller reported payment not received. Staff investigation required.\n\nAdmin+ can use \`/get-delivery\` to access the asset delivery link if the seller is found to be acting in bad faith.`
      )],
    });
  } catch { /* ignore */ }

  await interaction.update({ embeds: [buildInfoEmbed('Dispute Created', 'A support ticket has been created for staff to investigate.')], components: [] });
  await logPost({ action: 'Purchase Disputed', postId: purchase.post_id, userId: purchase.seller_id, username: purchase.seller_id, extra: `Purchase ID: ${purchaseId}` });
}
