import { Client, Interaction, ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction } from 'discord.js';
import {
  handleReviewApprove, handleReviewDeny, handleReviewProofOwnership,
  handleReviewProofFunds, handleReviewModerate,
  handleDenyReasonsSelect, handleDenyOtherModal, handleDenyCustomModal,
  handleModerateModal, handleModerateReasonSelect,
  handleProofSubmission, handleProofApprove, handleProofDeny,
  handleProofDm, handleEvidenceMessage
} from '../systems/reviewSystem.js';
import {
  handleBuyAsset, handleSubmitPurchaseProof,
  handlePurchaseApprove, handlePurchaseDeny, handleSellerConfirm, handleSellerMissing,
  handlePurchaseProofDm
} from '../systems/purchaseSystem.js';
import {
  handleTicketClaim, handleTicketClose, handleTicketEscalate
} from '../systems/ticketSystem.js';
import {
  handleWarnModal, handleMuteModal, handleKickModal, handleBanModal,
  handleNoteModal, handleUnmuteModal, handleUnbanModal
} from '../systems/moderationSystem.js';
import {
  handleGetSellerButton, handleGetSellerModal, handleGrantSeller, handleDenySeller
} from '../systems/sellerSystem.js';
import {
  handlePostCategorySelect, handlePostSelectMenu, handlePostConfirm,
  handlePostCancel, handlePostEdit, handleAssetOwnershipConfirm,
  handleApplySkillSelect, handleTicketTypeSelect, handleDmMessage
} from '../workflows/postWorkflow.js';
import {
  handleEmbedChannelSelect, handleEmbedContent, getEmbedSession
} from '../commands/index.js';
import {
  handleBrowseTypeSelect, handleBrowseNav, handleBrowseSave,
  handleSavedNav, handleSavedRemove
} from '../workflows/browseWorkflow.js';
import {
  handleRepostSelect, handleRepostConfirm, handleRepostCancel
} from '../workflows/repostWorkflow.js';
import { buildErrorEmbed, buildSuccessEmbed } from '../utils/embeds.js';

// ─── MAIN INTERACTION ROUTER ──────────────────────────────────────────────────

export async function routeInteraction(interaction: Interaction, client: Client): Promise<void> {
  try {
    if (interaction.isButton()) {
      await routeButton(interaction, client);
    } else if (interaction.isStringSelectMenu()) {
      await routeSelectMenu(interaction, client);
    } else if (interaction.isModalSubmit()) {
      await routeModal(interaction, client);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ROUTER] Error:', msg);
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [buildErrorEmbed('Error', 'Something went wrong. Please try again.')], ephemeral: true });
      }
    } catch { /* ignore */ }
  }
}

// ─── BUTTON ROUTER ────────────────────────────────────────────────────────────

async function routeButton(interaction: ButtonInteraction, client: Client): Promise<void> {
  const id = interaction.customId;

  // Review actions
  if (id.startsWith('review_approve_')) return handleReviewApprove(interaction, id.replace('review_approve_', ''));
  if (id.startsWith('review_deny_')) return handleReviewDeny(interaction, id.replace('review_deny_', ''));
  if (id.startsWith('review_proof_ownership_')) return handleReviewProofOwnership(interaction, id.replace('review_proof_ownership_', ''));
  if (id.startsWith('review_proof_funds_')) return handleReviewProofFunds(interaction, id.replace('review_proof_funds_', ''));
  if (id.startsWith('review_moderate_')) return handleReviewModerate(interaction, id.replace('review_moderate_', ''));
  if (id.startsWith('deny_other_')) return handleDenyOtherModal(interaction, id.replace('deny_other_', ''));

  // Proof submission
  if (id.startsWith('submit_proof_funds_')) return handleProofSubmission(interaction, id.replace('submit_proof_funds_', ''), 'funds');
  if (id.startsWith('submit_proof_')) return handleProofSubmission(interaction, id.replace('submit_proof_', ''), 'ownership');
  if (id.startsWith('proof_approve_')) return handleProofApprove(interaction, id.replace('proof_approve_', ''));
  if (id.startsWith('proof_deny_')) return handleProofDeny(interaction, id.replace('proof_deny_', ''));

  // Purchase flow
  if (id.startsWith('buy_asset_')) return handleBuyAsset(interaction, id.replace('buy_asset_', ''));
  if (id.startsWith('submit_purchase_proof_')) return handleSubmitPurchaseProof(interaction, id.replace('submit_purchase_proof_', ''));
  if (id.startsWith('purchase_approve_')) return handlePurchaseApprove(interaction, id.replace('purchase_approve_', ''));
  if (id.startsWith('purchase_deny_')) return handlePurchaseDeny(interaction, id.replace('purchase_deny_', ''));
  if (id.startsWith('seller_confirm_')) return handleSellerConfirm(interaction, id.replace('seller_confirm_', ''));
  if (id.startsWith('seller_missing_')) return handleSellerMissing(interaction, id.replace('seller_missing_', ''));

  // Ticket actions
  if (id.startsWith('ticket_claim_')) return handleTicketClaim(interaction, id.replace('ticket_claim_', ''));
  if (id.startsWith('ticket_close_')) return handleTicketClose(interaction, id.replace('ticket_close_', ''));
  if (id.startsWith('ticket_escalate_')) return handleTicketEscalate(interaction, id.replace('ticket_escalate_', ''));

  // Get-seller flow
  if (id.startsWith('get_seller_submit_')) return handleGetSellerButton(interaction, id.replace('get_seller_submit_', ''));
  if (id.startsWith('grant_seller_')) return handleGrantSeller(interaction, id.replace('grant_seller_', ''));
  if (id.startsWith('deny_seller_')) return handleDenySeller(interaction, id.replace('deny_seller_', ''));

  // Post workflow
  if (id === 'post_confirm') return handlePostConfirm(interaction);
  if (id === 'post_cancel') return handlePostCancel(interaction);
  if (id === 'post_edit') return handlePostEdit(interaction);
  if (id === 'asset_ownership_yes') return handleAssetOwnershipConfirm(interaction, true);
  if (id === 'asset_ownership_no') return handleAssetOwnershipConfirm(interaction, false);

  // Browse navigation
  if (id.startsWith('browse_prev_')) return handleBrowseNav(interaction.user.id, id.replace('browse_prev_', ''), 'prev', interaction);
  if (id.startsWith('browse_next_')) return handleBrowseNav(interaction.user.id, id.replace('browse_next_', ''), 'next', interaction);
  if (id.startsWith('browse_save_')) return handleBrowseSave(interaction.user.id, id.replace('browse_save_', ''), interaction);

  // Saved navigation
  if (id.startsWith('saved_prev_')) return handleSavedNav(interaction.user.id, id.replace('saved_prev_', ''), 'prev', interaction);
  if (id.startsWith('saved_next_')) return handleSavedNav(interaction.user.id, id.replace('saved_next_', ''), 'next', interaction);
  if (id.startsWith('saved_remove_')) return handleSavedRemove(interaction.user.id, id.replace('saved_remove_', ''), interaction);

  // Repost workflow
  if (id.startsWith('repost_confirm_')) return handleRepostConfirm(interaction.user.id, id.replace('repost_confirm_', ''), interaction);
  if (id === 'repost_cancel') return handleRepostCancel(interaction);

  // Appeals
  if (id === 'appeal_punishment') {
    const { handleCreateTicket } = await import('../systems/ticketSystem.js');
    return handleCreateTicket(interaction.user.id, 'moderation');
  }

  // Report button on listing
  if (id.startsWith('report_post_')) {
    const { handleCreateTicket } = await import('../systems/ticketSystem.js');
    await interaction.reply({ embeds: [buildErrorEmbed('Report', 'A moderation ticket has been opened for you to submit your report.')], ephemeral: true });
    return handleCreateTicket(interaction.user.id, 'moderation');
  }

  // Save post from listing embed
  if (id.startsWith('save_post_')) return handleBrowseSave(interaction.user.id, id.replace('save_post_', ''), interaction);
}

// ─── SELECT MENU ROUTER ───────────────────────────────────────────────────────

async function routeSelectMenu(interaction: StringSelectMenuInteraction, client: Client): Promise<void> {
  const id = interaction.customId;

  // Browse
  if (id === 'browse_type') {
    await interaction.deferUpdate();
    return handleBrowseTypeSelect(interaction.user.id, interaction.values[0]);
  }

  // Repost
  if (id === 'repost_select') return handleRepostSelect(interaction.user.id, interaction.values[0], interaction);

  // Moderate reason select
  if (id.startsWith('moderate_reason_select_')) return handleModerateReasonSelect(interaction, id.replace('moderate_reason_select_', ''));

  // Deny reasons
  if (id.startsWith('deny_reasons_')) return handleDenyReasonsSelect(interaction, id.replace('deny_reasons_', ''));

  // Staff delete post picker
  if (id.startsWith('staff_delete_post_')) {
    await interaction.deferReply({ ephemeral: true });
    const postId = interaction.values[0];
    const { getPost, updatePostStatus, getUserPosts } = await import('../db/helpers.js');
    const { logPost } = await import('../utils/logger.js');
    const post = await getPost(postId);
    if (!post) { await interaction.editReply({ embeds: [buildErrorEmbed('Not Found', 'Post not found.')] }); return; }
    if (post.discord_message_id && post.status === 'live') {
      try {
        const { skillRoleMap, assetCategoryMap } = await import('../config/index.js');
        let channelId = '';
        if (post.post_type === 'FH')       channelId = Object.values(skillRoleMap).find((s: { label: string }) => s.label === post.category)?.mainFH ?? '';
        else if (post.post_type === 'LFD') channelId = Object.values(skillRoleMap).find((s: { label: string }) => s.label === post.category)?.mainLFD ?? '';
        else                               channelId = Object.values(assetCategoryMap).find((c: { label: string }) => c.label === post.category)?.mainChannel ?? '';
        if (channelId) {
          const ch  = await client.channels.fetch(channelId) as import('discord.js').TextChannel;
          const msg = await ch.messages.fetch(post.discord_message_id);
          await msg.delete();
        }
      } catch { /* already gone */ }
    }
    await updatePostStatus(postId, 'deleted');
    try { await (await client.users.fetch(post.user_id)).send({ embeds: [buildErrorEmbed('Post Removed', `Your post has been removed by Marketplace Staff.\n\n-# ${post.post_id}`)] }); } catch { /* DMs off */ }
    await logPost({ action: 'Deleted by Staff', postId: post.post_id, userId: post.user_id, username: post.user_id, actionedBy: interaction.user.id });
    await interaction.editReply({ embeds: [buildSuccessEmbed('Deleted', `Post ${postId} has been removed.`)] });
    return;
  }

  // Embed channel select
  if (id === 'embed_channel_select') return handleEmbedChannelSelect(interaction, client);

  // Post workflow selects
  if (
    id === 'post_category_select' || id.startsWith('fh_') || id.startsWith('lfd_') ||
    id.startsWith('asset_') || id === 'ticket_type_select' || id === 'apply_skill_select'
  ) {
    if (id === 'apply_skill_select') return handleApplySkillSelect(interaction);
    if (id === 'ticket_type_select') return handleTicketTypeSelect(interaction);
    return handlePostSelectMenu(interaction);
  }
}

// ─── MODAL ROUTER ─────────────────────────────────────────────────────────────

async function routeModal(interaction: ModalSubmitInteraction, client: Client): Promise<void> {
  const id = interaction.customId;

  // Moderation modals
  if (id.startsWith('warn_modal_')) return handleWarnModal(interaction, id.replace('warn_modal_', ''));
  if (id.startsWith('mute_modal_')) return handleMuteModal(interaction, id.replace('mute_modal_', ''));
  if (id.startsWith('kick_modal_')) return handleKickModal(interaction, id.replace('kick_modal_', ''));
  if (id.startsWith('ban_modal_')) return handleBanModal(interaction, id.replace('ban_modal_', ''));
  if (id.startsWith('note_modal_')) return handleNoteModal(interaction, id.replace('note_modal_', ''));
  if (id.startsWith('unmute_modal_')) return handleUnmuteModal(interaction, id.replace('unmute_modal_', ''));
  if (id.startsWith('unban_modal_')) return handleUnbanModal(interaction, id.replace('unban_modal_', ''));

  // Review deny modals
  if (id.startsWith('deny_custom_modal_')) return handleDenyCustomModal(interaction, id.replace('deny_custom_modal_', ''));

  // Moderate modal — ID format: moderate_modal_TARGETID__ENCODEDREASON
  if (id.startsWith('moderate_modal_')) {
    const rest = id.replace('moderate_modal_', '');
    const sep  = rest.indexOf('__');
    if (sep === -1) return; // malformed
    const targetId      = rest.slice(0, sep);
    const encodedReason = rest.slice(sep + 2);
    return handleModerateModal(interaction, targetId, encodedReason);
  }

  // Purchase proof modal
  if (id.startsWith('purchase_proof_modal_')) return handlePurchaseProofModal(interaction, id.replace('purchase_proof_modal_', ''));

  // Get-seller modal
  if (id.startsWith('get_seller_modal_')) return handleGetSellerModal(interaction, id.replace('get_seller_modal_', ''));
}

// ─── DM MESSAGE ROUTER ────────────────────────────────────────────────────────

export async function routeDMMessage(message: import('discord.js').Message, client: Client): Promise<void> {
  const { mirrorToStaff } = await import('../systems/ticketSystem.js');
  await mirrorToStaff(message);

  // Check proof submissions first (they take priority over workflow steps)
  const proofHandled    = await handleProofDm(message);
  if (proofHandled) return;
  const purchaseHandled = await handlePurchaseProofDm(message);
  if (purchaseHandled) return;

  await handleDmMessage(message);
}

// ─── SERVER MESSAGE ROUTER (for /embed content) ───────────────────────────────

export async function routeServerMessage(message: import('discord.js').Message, client: Client): Promise<void> {
  if (getEmbedSession(message.author.id)) {
    await handleEmbedContent(message, client);
  }
}
