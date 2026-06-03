// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — REVIEW SYSTEM
// ─────────────────────────────────────────────────────────────────────────────
import {
  Client, TextChannel, ButtonInteraction, ModalSubmitInteraction,
  StringSelectMenuInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalActionRowComponentBuilder,
  EmbedBuilder
} from 'discord.js';
import {
  config, skillRoleMap, assetCategoryMap,
  getDenialReasons, formatDenialReasons, MODERATION_REASONS
} from '../config/index.js';
import {
  getPost, updatePostStatus, getUserPostHistory,
  getMpNotes, createModEntry, updateUserMpMute, updateUserBan,
  createProofRequest, getProofRequest, updateProofRequest,
  addToFeaturedQueue, getNextFeatured, getActiveFeatured,
  setFeaturedActive, markFeaturedDone, getActiveModEntries, upsertUser
} from '../db/helpers.js';
import {
  buildFhReviewEmbed, buildLfdReviewEmbed, buildAssetReviewEmbed,
  buildApplicationReviewEmbed, buildReviewButtons,
  buildInfoEmbed, buildSuccessEmbed, buildErrorEmbed, buildDenialEmbed,
  buildProofRequestEmbed, buildModerationHoldEmbed,
  buildFhEmbed, buildLfdEmbed, buildAssetEmbed,
  buildFHLFDButtons, buildListingButtons, buildAppealButton, ReviewMeta
} from '../utils/embeds.js';
import { logPost, logMod } from '../utils/logger.js';
import {
  getApplication, updateApplicationStatus, getUserApplicationHistory
} from '../db/helpers.js';
import { scheduleBanExpiry } from './moderationSystem.js';
import { query } from '../db/index.js';
import type { Post, Application } from '../types/index.js';

let reviewClient: Client | null = null;
export function setReviewClient(c: Client): void { reviewClient = c; }

// ─── BUILD REVIEW META ────────────────────────────────────────────────────────

async function buildMeta(userId: string, isApp = false): Promise<ReviewMeta> {
  let accountAge = 'Unknown';
  try {
    if (reviewClient) {
      const user = await reviewClient.users.fetch(userId);
      const ageDays = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);
      accountAge = `Created ${ageDays}d ago`;
      try {
        const guild  = await reviewClient.guilds.fetch(config.servers.main);
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member?.joinedTimestamp) {
          const joinDays = Math.floor((Date.now() - member.joinedTimestamp) / 86_400_000);
      accountAge += `, joined ${joinDays}d ago`;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  const postHistory = isApp
    ? await getUserApplicationHistory(userId)
    : await getUserPostHistory(userId);

  const notes = await getMpNotes(userId);
  const mpNotes = notes.map(n => `<@${n.added_by}>: ${n.note_text}`).join('\n');

  const flags: string[] = [];
  const modEntries = await getActiveModEntries(userId);
  for (const e of modEntries) {
    if (e.action_type === 'warn')             flags.push('Warned');
    if (e.action_type === 'mute')             flags.push('Muted');
    if (e.action_type === 'marketplace_mute') flags.push('MP Muted');
  }

  return { accountAge, postHistory, activeFlags: flags.join(', ') || 'None', mpNotes };
}

// ─── SUBMIT POST FOR REVIEW ───────────────────────────────────────────────────

export async function submitPostForReview(post: Post, sellerTag: string): Promise<void> {
  if (!reviewClient) return;
  const meta = await buildMeta(post.user_id);

  let staffChannelId: string;
  let embed: EmbedBuilder;
  const typeKey = post.post_type as 'FH' | 'LFD' | 'ASSET';

  if (post.post_type === 'FH') {
    const skill = Object.values(skillRoleMap).find(s => s.label === post.category);
    staffChannelId = skill?.staffFH ?? config.channels.staff.fh.scripter;
    embed = buildFhReviewEmbed(post, sellerTag, meta);
  } else if (post.post_type === 'LFD') {
    const skill = Object.values(skillRoleMap).find(s => s.label === post.category);
    staffChannelId = skill?.staffLFD ?? config.channels.staff.lfd.scripter;
    embed = buildLfdReviewEmbed(post, sellerTag, meta);
  } else {
    const cat = Object.values(assetCategoryMap).find(c => c.label === post.category);
    staffChannelId = cat?.staffChannel ?? config.channels.staff.assets.systems;
    embed = buildAssetReviewEmbed(post, sellerTag, meta);
  }

  const ch  = await reviewClient.channels.fetch(staffChannelId) as TextChannel;
  const msg = await ch.send({ embeds: [embed], components: [buildReviewButtons(typeKey, post.post_id)] });
  await updatePostStatus(post.post_id, 'pending', { staff_message_id: msg.id });
  await logPost({ action: 'Submitted for Review', postId: post.post_id, userId: post.user_id, username: sellerTag });
}

// ─── SUBMIT APPLICATION FOR REVIEW ───────────────────────────────────────────

export async function submitApplicationForReview(app: Application, userTag: string): Promise<void> {
  if (!reviewClient) return;
  const meta = await buildMeta(app.user_id, true);
  const embed = buildApplicationReviewEmbed(app, userTag, meta);
  const ch  = await reviewClient.channels.fetch(config.channels.staff.applications) as TextChannel;
  const msg = await ch.send({ embeds: [embed], components: [buildReviewButtons('APP', app.application_id)] });
  await updateApplicationStatus(app.application_id, 'pending', { staff_message_id: msg.id });
  await logPost({ action: 'Application Submitted', postId: app.application_id, userId: app.user_id, username: userTag });
}

// ─── APPROVE ─────────────────────────────────────────────────────────────────

export async function handleReviewApprove(interaction: ButtonInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!reviewClient) return;

  if (targetId.startsWith('APP-')) {
    await approveApplication(interaction, targetId); return;
  }

  const post = await getPost(targetId);
  if (!post) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Post not found.')] }); return; }

  const guild = await reviewClient.guilds.fetch(config.servers.main);
  let sellerTag = `<@${post.user_id}>`;
  try { const m = await guild.members.fetch(post.user_id); sellerTag = `${m.user.tag} (<@${post.user_id}>)`; } catch { /* ignore */ }

  let publicChannelId: string;
  let embed: EmbedBuilder;
  let buttons: ActionRowBuilder<ButtonBuilder>;

  if (post.post_type === 'FH') {
    const skill = Object.values(skillRoleMap).find(s => s.label === post.category);
    publicChannelId = skill?.mainFH ?? config.channels.main.fh.scripter;
    embed = buildFhEmbed(post, sellerTag); buttons = buildFHLFDButtons(post.post_id);
  } else if (post.post_type === 'LFD') {
    const skill = Object.values(skillRoleMap).find(s => s.label === post.category);
    publicChannelId = skill?.mainLFD ?? config.channels.main.lfd.scripter;
    embed = buildLfdEmbed(post, sellerTag); buttons = buildFHLFDButtons(post.post_id);
  } else {
    const cat = Object.values(assetCategoryMap).find(c => c.label === post.category);
    publicChannelId = cat?.mainChannel ?? config.channels.main.assets.systems;
    embed = buildAssetEmbed(post, sellerTag); buttons = buildListingButtons(post.post_id);
  }

  const pubCh  = await reviewClient.channels.fetch(publicChannelId) as TextChannel;
  const pubMsg = await pubCh.send({ embeds: [embed], components: [buttons] });

  const now     = new Date();
  const member  = await guild.members.fetch(post.user_id).catch(() => null);
  const isTrusted = member?.roles.cache.has(config.roles.main.trustedSeller) ?? false;
  const isSub     = member?.roles.cache.has(config.roles.main.marketplaceSubscriber) ?? false;
  const cooldownMs = isTrusted ? config.cooldowns.trustedSeller
                   : isSub    ? config.cooldowns.marketplaceSubscriber
                               : config.cooldowns.verified;

  await updatePostStatus(post.post_id, 'live', {
    discord_message_id: pubMsg.id,
    approved_at: now,
    expires_at: new Date(now.getTime() + config.postExpiry),
    repost_available_until: new Date(now.getTime() + config.postExpiry + config.postDeletion),
    cooldown_expires_at: new Date(now.getTime() + cooldownMs),
  });

  schedulePostExpiry(post.post_id, post.user_id, pubMsg.id, publicChannelId, config.postExpiry);

  if (post.post_type === 'ASSET') {
    await addToFeaturedQueue(post.post_id, isTrusted ? 'trusted' : 'standard');
  }

  await interaction.message.delete().catch(() => null);

  // Delete any proof thread attached to this review message
  try {
    const threads = interaction.message.thread;
    if (threads) await threads.delete();
  } catch { /* no thread or already gone */ }

  try {
    const user = await reviewClient.users.fetch(post.user_id);
    await user.send({
      embeds: [buildSuccessEmbed('Post Approved', `Your post is now live in the DevVault marketplace.\n\n-# ${post.post_id}`)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('View Post').setStyle(ButtonStyle.Link).setURL(pubMsg.url))],
    });
  } catch { /* DMs off */ }

  await logPost({ action: 'Approved', postId: post.post_id, userId: post.user_id, username: sellerTag, actionedBy: interaction.user.id });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Approved', `${post.post_id} is now live.`)] });
}

async function approveApplication(interaction: ButtonInteraction, appId: string): Promise<void> {
  if (!reviewClient) return;
  const app = await getApplication(appId);
  if (!app) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Application not found.')] }); return; }

  const skillEntry = Object.values(skillRoleMap).find(s => s.label === app.skill_type);
  if (skillEntry) {
    try {
      const guild  = await reviewClient.guilds.fetch(config.servers.main);
      const member = await guild.members.fetch(app.user_id);
      await member.roles.add(skillEntry.roleId);
    } catch { /* ignore */ }
  }

  await updateApplicationStatus(appId, 'approved', { actioned_by: interaction.user.id, actioned_at: new Date() });
  try {
    const user = await reviewClient.users.fetch(app.user_id);
    await user.send({ embeds: [buildSuccessEmbed('Application Approved', `Your application has been approved. You have been granted the **${app.skill_type}** role.`)] });
  } catch { /* DMs off */ }
  await interaction.message.delete().catch(() => null);
  await logPost({ action: 'Application Approved', postId: appId, userId: app.user_id, username: app.user_id, actionedBy: interaction.user.id });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Approved', `${appId} approved. ${app.skill_type} role granted.`)] });
}

// ─── DENY ─────────────────────────────────────────────────────────────────────

export async function handleReviewDeny(interaction: ButtonInteraction, targetId: string): Promise<void> {
  const type = resolveType(targetId);
  const reasons = getDenialReasons(type).filter(r => r.id !== 'other');

  const select = new StringSelectMenuBuilder()
    .setCustomId(`deny_reasons_${targetId}`)
    .setPlaceholder('Select denial reasons')
    .setMinValues(1).setMaxValues(Math.min(reasons.length, 5))
    .addOptions(reasons.map(r => new StringSelectMenuOptionBuilder().setLabel(r.label).setValue(r.id)));

  await interaction.reply({
    embeds: [buildInfoEmbed('Select Denial Reasons', 'Pick one or more reasons. Use "Other" for a custom note.')],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`deny_other_${targetId}`).setLabel('Other (custom)').setStyle(ButtonStyle.Secondary)
      ),
    ],
    ephemeral: true,
  });
}

export async function handleDenyReasonsSelect(interaction: StringSelectMenuInteraction, targetId: string): Promise<void> {
  const type      = resolveType(targetId);
  const formatted = formatDenialReasons(interaction.values, null, type);
  await executeDeny(interaction as unknown as ButtonInteraction, targetId, formatted, type);
}

export async function handleDenyOtherModal(interaction: ButtonInteraction, targetId: string): Promise<void> {
  await interaction.showModal(
    new ModalBuilder().setCustomId(`deny_custom_modal_${targetId}`).setTitle('Custom Denial Reason').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
      )
    )
  );
}

export async function handleDenyCustomModal(interaction: ModalSubmitInteraction, targetId: string): Promise<void> {
  const custom    = interaction.fields.getTextInputValue('reason');
  const type      = resolveType(targetId);
  const formatted = `- ${custom}`;
  await executeDeny(interaction as unknown as ButtonInteraction, targetId, formatted, type);
}

async function executeDeny(
  interaction: ButtonInteraction,
  targetId: string,
  formatted: string,
  type: 'FH' | 'LFD' | 'ASSET' | 'APP'
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  const isApp = type === 'APP';
  let userId = '';

  if (isApp) {
    const app = await getApplication(targetId);
    if (!app) return;
    userId = app.user_id;
    await updateApplicationStatus(targetId, 'denied', { actioned_by: interaction.user.id, actioned_at: new Date() });
  } else {
    const post = await getPost(targetId);
    if (!post) return;
    userId = post.user_id;
    await updatePostStatus(targetId, 'denied');
  }

  if (reviewClient && userId) {
    try { await (await reviewClient.users.fetch(userId)).send({ embeds: [buildDenialEmbed(targetId, formatted)] }); }
    catch { /* DMs off */ }
  }

  await interaction.message?.delete().catch(() => null);

  // Delete any proof thread attached to this review message
  try {
    const thread = interaction.message?.thread;
    if (thread) await thread.delete();
  } catch { /* no thread or already gone */ }

  await logPost({ action: `${isApp ? 'Application ' : ''}Denied`, postId: targetId, userId, username: userId, actionedBy: interaction.user.id, reason: formatted });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Denied', `${targetId} denied.`)] }).catch(() => null);
}

// ─── REQUEST PROOF ────────────────────────────────────────────────────────────

export async function handleReviewProofOwnership(interaction: ButtonInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!reviewClient) return;

  const req = await createProofRequest({ targetId, targetType: targetId.startsWith('APP-') ? 'application' : 'post', proofType: 'ownership', requestedBy: interaction.user.id, reviewMessageId: interaction.message.id });

  try {
    const thread = await interaction.message.startThread({ name: `Proof: ${targetId}`, autoArchiveDuration: 1440 });
    await thread.setLocked(true);
    await thread.send({ embeds: [buildInfoEmbed('Ownership Proof Requested', `Proof requested. Deadline: <t:${Math.floor((Date.now() + config.proofDeadline) / 1000)}:R>`)] });
    await updateProofRequest(req.proof_id, { proof_ref: thread.id });
  } catch { /* ignore */ }

  const userId = targetId.startsWith('APP-')
    ? (await getApplication(targetId))?.user_id
    : (await getPost(targetId))?.user_id;

  if (userId) {
    try {
      await (await reviewClient.users.fetch(userId)).send({
        embeds: [buildProofRequestEmbed(targetId, 'ownership')],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`submit_proof_${targetId}`).setLabel('Submit Proof').setStyle(ButtonStyle.Primary))],
      });
    } catch { /* DMs off */ }
    await logPost({ action: 'Proof of Ownership Requested', postId: targetId, userId, username: userId, actionedBy: interaction.user.id });
    setTimeout(() => void handleProofDeadlineExpiry(targetId), config.proofDeadline);
  }

  await interaction.editReply({ embeds: [buildSuccessEmbed('Proof Requested', `Ownership proof requested. User has 48h to respond.`)] });
}

export async function handleReviewProofFunds(interaction: ButtonInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!reviewClient) return;

  const req = await createProofRequest({ targetId, targetType: 'post', proofType: 'funds', requestedBy: interaction.user.id, reviewMessageId: interaction.message.id });

  try {
    const thread = await interaction.message.startThread({ name: `Funds Proof: ${targetId}`, autoArchiveDuration: 1440 });
    await thread.setLocked(true);
    await thread.send({ embeds: [buildInfoEmbed('Funds Proof Requested', `Deadline: <t:${Math.floor((Date.now() + config.proofDeadline) / 1000)}:R>`)] });
    await updateProofRequest(req.proof_id, { proof_ref: thread.id });
  } catch { /* ignore */ }

  const post = await getPost(targetId);
  if (post) {
    try {
      await (await reviewClient.users.fetch(post.user_id)).send({
        embeds: [buildProofRequestEmbed(targetId, 'funds')],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`submit_proof_funds_${targetId}`).setLabel('Submit Proof of Funds').setStyle(ButtonStyle.Primary))],
      });
    } catch { /* DMs off */ }
    await logPost({ action: 'Proof of Funds Requested', postId: targetId, userId: post.user_id, username: post.user_id, actionedBy: interaction.user.id });
    setTimeout(() => void handleProofDeadlineExpiry(targetId), config.proofDeadline);
  }

  await interaction.editReply({ embeds: [buildSuccessEmbed('Proof Requested', `Funds proof requested. User has 48h to respond.`)] });
}

// ─── PROOF SUBMISSION ─────────────────────────────────────────────────────────

export async function handleProofSubmission(interaction: ButtonInteraction, targetId: string, proofType: 'ownership' | 'funds'): Promise<void> {
  await interaction.showModal(
    new ModalBuilder().setCustomId(`proof_submit_modal_${proofType}_${targetId}`).setTitle('Submit Proof').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('proof_link').setLabel('Proof link (video/recording URL)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)
      )
    )
  );
}

export async function handleProofSubmitModal(interaction: ModalSubmitInteraction, proofType: 'ownership' | 'funds', targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const proofLink = interaction.fields.getTextInputValue('proof_link');
  const req = await getProofRequest(targetId);
  if (!req) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'No active proof request found.')] }); return; }

  await updateProofRequest(req.proof_id, { submitted_at: new Date(), proof_ref: proofLink });

  if (req.proof_ref && reviewClient) {
    try {
      const { ThreadChannel } = await import('discord.js');
      const thread = await reviewClient.channels.fetch(req.proof_ref);
      if (thread && 'setLocked' in thread) {
        await (thread as import('discord.js').ThreadChannel).setLocked(false);
        await (thread as import('discord.js').ThreadChannel).send({
          embeds: [new EmbedBuilder().setColor(config.colours.proofRequest).setTitle('Proof Submitted').setDescription(`Submitted by <@${interaction.user.id}>\n\n**Link:** ${proofLink}`).setFooter({ text: `DevVault | ${targetId}` }).setTimestamp()],
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`proof_approve_${targetId}`).setLabel('Approve Proof').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`proof_deny_${targetId}`).setLabel('Deny Proof').setStyle(ButtonStyle.Danger),
          )],
        });
        await (thread as import('discord.js').ThreadChannel).setLocked(true);
        await (thread as import('discord.js').ThreadChannel).send(`<@${req.requested_by}> Proof submitted for **${targetId}**.`);
      }
    } catch { /* ignore */ }
  }

  await logPost({ action: `Proof ${proofType} Submitted`, postId: targetId, userId: interaction.user.id, username: interaction.user.tag, extra: `Link: ${proofLink}` });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Proof Submitted', 'Your proof has been submitted and is under review.')] });
}

export async function handleProofApprove(interaction: ButtonInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const req = await getProofRequest(targetId);
  if (req) await updateProofRequest(req.proof_id, { status: 'approved' });

  const isApp = targetId.startsWith('APP-');
  let userId  = '';
  if (isApp) { const app = await getApplication(targetId); if (app) { await updateApplicationStatus(targetId, 'pending'); userId = app.user_id; } }
  else       { const post = await getPost(targetId);        if (post) { await updatePostStatus(targetId, 'pending'); userId = post.user_id; } }

  if (userId && reviewClient) {
    try { await (await reviewClient.users.fetch(userId)).send({ embeds: [buildSuccessEmbed('Verification Approved', 'Verification has been approved. Your submission will now continue normally.')] }); }
    catch { /* DMs off */ }
  }
  await logPost({ action: 'Proof Approved', postId: targetId, userId, username: userId, actionedBy: interaction.user.id });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Approved', `Proof approved for ${targetId}.`)] });
}

export async function handleProofDeny(interaction: ButtonInteraction, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  const req = await getProofRequest(targetId);
  if (req) await updateProofRequest(req.proof_id, { status: 'denied' });

  const formatted = '- Additional verification requirements have not been satisfied.';
  const isApp = targetId.startsWith('APP-');
  let userId  = '';
  if (isApp) { const app = await getApplication(targetId); if (app) { await updateApplicationStatus(targetId, 'denied', { denial_reasons: ['verification_not_met'] }); userId = app.user_id; } }
  else       { const post = await getPost(targetId);        if (post) { await updatePostStatus(targetId, 'denied'); userId = post.user_id; } }

  if (userId && reviewClient) {
    try { await (await reviewClient.users.fetch(userId)).send({ embeds: [buildDenialEmbed(targetId, formatted)] }); }
    catch { /* DMs off */ }
  }
  await interaction.message.delete().catch(() => null);
  await logPost({ action: 'Proof Denied', postId: targetId, userId, username: userId, actionedBy: interaction.user.id });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Denied', `Proof denied for ${targetId}.`)] });
}

// ─── PROOF DEADLINE EXPIRY ────────────────────────────────────────────────────

async function handleProofDeadlineExpiry(targetId: string): Promise<void> {
  const req = await getProofRequest(targetId);
  if (!req || req.status !== 'pending') return;
  await updateProofRequest(req.proof_id, { status: 'expired' });

  const formatted = '- Additional verification requirements have not been satisfied.';
  const isApp = targetId.startsWith('APP-');
  let userId  = '';
  if (isApp) { const app = await getApplication(targetId); if (app) { await updateApplicationStatus(targetId, 'denied', { denial_reasons: ['verification_not_met'] }); userId = app.user_id; } }
  else       { const post = await getPost(targetId);        if (post) { await updatePostStatus(targetId, 'denied'); userId = post.user_id; } }

  if (userId && reviewClient) {
    try { await (await reviewClient.users.fetch(userId)).send({ embeds: [buildDenialEmbed(targetId, formatted)] }); }
    catch { /* DMs off */ }
  }
  await logPost({ action: 'Proof Expired (Auto-Denied)', postId: targetId, userId, username: userId });
}

// ─── MODERATE PIPELINE ────────────────────────────────────────────────────────

export async function handleReviewModerate(interaction: ButtonInteraction, targetId: string): Promise<void> {
  // Step 1: show a dropdown to select the moderation reason category
  const select = new StringSelectMenuBuilder()
    .setCustomId(`moderate_reason_select_${targetId}`)
    .setPlaceholder('Select the issue type')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('AI Generated Content').setValue('AI Generated Content').setDescription('Suspected use of AI in work samples or portfolio'),
      new StringSelectMenuOptionBuilder().setLabel('Stolen / Plagiarised Content').setValue('Stolen or Plagiarised Content').setDescription('Content appears to be taken from another creator'),
      new StringSelectMenuOptionBuilder().setLabel('Ownership Dispute').setValue('Ownership Dispute').setDescription('Ownership of the submitted work is in question'),
      new StringSelectMenuOptionBuilder().setLabel('Fraud or Misrepresentation').setValue('Fraud or Misrepresentation').setDescription('Work, pricing, or identity appears to be misrepresented'),
      new StringSelectMenuOptionBuilder().setLabel('Repeated Policy Violations').setValue('Repeated Policy Violations').setDescription('User has a pattern of breaking marketplace rules'),
      new StringSelectMenuOptionBuilder().setLabel('Circumvention Attempt').setValue('Circumvention Attempt').setDescription('Appears to be bypassing marketplace requirements'),
      new StringSelectMenuOptionBuilder().setLabel('Other').setValue('Other').setDescription('Issue does not fit the above categories'),
    );

  await interaction.reply({
    embeds: [buildInfoEmbed('Select Issue Type', 'Choose the category that best describes the problem with this submission.')],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    ephemeral: true,
  });
}

export async function handleModerateReasonSelect(interaction: StringSelectMenuInteraction, targetId: string): Promise<void> {
  // Step 2: after selecting reason, show modal for explanation + evidence
  const reason = interaction.values[0];
  await interaction.showModal(
    new ModalBuilder().setCustomId(`moderate_modal_${targetId}__${encodeURIComponent(reason)}`).setTitle('Moderation Details').addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('explanation').setLabel('Explanation').setStyle(TextInputStyle.Paragraph)
          .setRequired(true).setMaxLength(1000)
          .setPlaceholder('Describe what was found and why this is an issue.')
      ),
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        new TextInputBuilder().setCustomId('evidence').setLabel('Evidence (links, screenshots)').setStyle(TextInputStyle.Paragraph)
          .setRequired(false).setMaxLength(500)
          .setPlaceholder('Optional: paste links to evidence.')
      )
    )
  );
}

export async function handleModerateModal(interaction: ModalSubmitInteraction, targetId: string, encodedReason: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!reviewClient) return;

  const reason      = decodeURIComponent(encodedReason);
  const explanation = interaction.fields.getTextInputValue('explanation');
  const evidence    = interaction.fields.getTextInputValue('evidence') || '';
  const isApp       = targetId.startsWith('APP-');
  let userId        = '';

  if (isApp) { const app = await getApplication(targetId); if (app) { await updateApplicationStatus(targetId, 'moderated'); userId = app.user_id; } }
  else       { const post = await getPost(targetId);        if (post) { await updatePostStatus(targetId, 'moderated'); userId = post.user_id; } }

  await query(
    `INSERT INTO suspensions (target_id,target_type,suspended_by,moderation_reason,evidence,explanation)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [targetId, isApp ? 'application' : 'post', interaction.user.id, reason, evidence, explanation]
  );

  let threadId: string | null = null;
  try {
    const thread = await interaction.message?.startThread({ name: `Moderate: ${targetId}`, autoArchiveDuration: 4320 });
    if (thread) {
      await thread.setLocked(true);
      await thread.send({
        embeds: [new EmbedBuilder().setColor(config.colours.moderation).setTitle('Moderation Case Opened').addFields([
          { name: 'Reason',      value: reason,             inline: false },
          { name: 'Explanation', value: explanation,        inline: false },
          { name: 'Evidence',    value: evidence || 'None', inline: false },
          { name: 'Opened by',   value: `<@${interaction.user.id}>`, inline: true },
        ]).setFooter({ text: `DevVault | ${targetId}` }).setTimestamp()],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...config.moderationPunishments.map(p =>
            new ButtonBuilder().setCustomId(`mod_punish_${p.id}_${targetId}`).setLabel(p.label).setStyle(ButtonStyle.Danger)
          )
        )],
      });
      threadId = thread.id;
    }
  } catch { /* ignore */ }

  if (userId) {
    try { await (await reviewClient.users.fetch(userId)).send({ embeds: [buildModerationHoldEmbed(targetId)] }); }
    catch { /* DMs off */ }

    const req = await createProofRequest({ targetId, targetType: isApp ? 'application' : 'post', proofType: 'ownership', requestedBy: interaction.user.id, threadId: threadId ?? undefined });
    try {
      await (await reviewClient.users.fetch(userId)).send({
        embeds: [buildProofRequestEmbed(targetId, 'ownership')],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`submit_proof_${targetId}`).setLabel('Submit Proof').setStyle(ButtonStyle.Primary))],
      });
    } catch { /* DMs off */ }
    setTimeout(() => void handleProofDeadlineExpiry(targetId), config.proofDeadline);
  }

  await logPost({ action: 'Moderated', postId: targetId, userId, username: userId, actionedBy: interaction.user.id, reason, extra: explanation });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Case Opened', `Moderation case opened for ${targetId}.`)] });
}

export async function handleModeratePunish(interaction: ButtonInteraction, punishId: string, targetId: string): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!reviewClient) return;

  const tier = config.moderationPunishments.find(p => p.id === punishId);
  if (!tier) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Unknown punishment tier.')] }); return; }

  const isApp = targetId.startsWith('APP-');
  const userId = isApp ? (await getApplication(targetId))?.user_id : (await getPost(targetId))?.user_id;
  if (!userId) { await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'Target not found.')] }); return; }

  await upsertUser(userId, '');

  if (tier.action === 'marketplace_mute') {
    const expiresAt = tier.durationDays > 0 ? new Date(Date.now() + tier.durationDays * 86_400_000) : undefined;
    await updateUserMpMute(userId, true, expiresAt);
    await createModEntry({ userId, actionType: 'marketplace_mute', reason: `Moderation outcome: ${tier.label}`, durationDays: tier.durationDays || undefined, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, expiresAt });
  } else if (tier.action === 'ban') {
    const expiresAt = tier.durationDays > 0 ? new Date(Date.now() + tier.durationDays * 86_400_000) : undefined;
    const guild = await reviewClient.guilds.fetch(config.servers.main);
    await guild.bans.create(userId, { reason: `Moderation outcome: ${tier.label}` }).catch(() => null);
    await updateUserBan(userId, true, expiresAt);
    await createModEntry({ userId, actionType: 'ban', reason: `Moderation outcome: ${tier.label}`, durationDays: tier.durationDays || undefined, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag, expiresAt });
    if (expiresAt) scheduleBanExpiry(userId, expiresAt);
  } else if (tier.action === 'warn') {
    await createModEntry({ userId, actionType: 'warn', reason: `Moderation outcome: ${tier.label}`, moderatorId: interaction.user.id, moderatorTag: interaction.user.tag });
  }

  const susRes = await query(`SELECT evidence, explanation FROM suspensions WHERE target_id=$1 ORDER BY created_at DESC LIMIT 1`, [targetId]);
  const evidence = susRes.rows[0]?.evidence || '';

  try {
    await (await reviewClient.users.fetch(userId)).send({
      embeds: [buildErrorEmbed('Action Taken', `A moderation action has been taken on your account.\n\n**Action:** ${tier.label}\n**Evidence:** ${evidence || 'On file'}`)],
      components: [buildAppealButton()],
    });
  } catch { /* DMs off */ }

  await logMod({ action: `Moderation Outcome: ${tier.label}`, targetId: userId, targetTag: userId, moderatorId: interaction.user.id, reason: `Target: ${targetId}`, evidence });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Punishment Applied', `${tier.label} applied to <@${userId}>.`)] });
}

// ─── POST EXPIRY SCHEDULER ────────────────────────────────────────────────────

export function schedulePostExpiry(postId: string, userId: string, messageId: string, channelId: string, delayMs: number): void {
  setTimeout(async () => {
    const post = await getPost(postId);
    if (!post || post.status !== 'live') return;

    const archiveAt = new Date();
    const deleteAt  = new Date(archiveAt.getTime() + config.postDeletion);
    await updatePostStatus(postId, 'archived', { archived_at: archiveAt, repost_available_until: deleteAt });

    try {
      if (reviewClient) {
        const ch  = await reviewClient.channels.fetch(channelId) as TextChannel;
        const msg = await ch.messages.fetch(messageId);
        await msg.delete();
      }
    } catch { /* already gone */ }

    await logPost({ action: 'Archived (Expired)', postId, userId, username: userId });

    setTimeout(async () => {
      const p = await getPost(postId);
      if (!p || p.status !== 'archived') return;
      await updatePostStatus(postId, 'deleted');
      await logPost({ action: 'Deleted (Permanent)', postId, userId, username: userId });
    }, config.postDeletion);

  }, delayMs);
}

// ─── FEATURED ROTATION ────────────────────────────────────────────────────────

export async function runFeaturedRotation(client: Client): Promise<void> {
  const active = await getActiveFeatured();
  if (active && new Date(active.expires_at) > new Date()) return;

  if (active) {
    try {
      const ch  = await client.channels.fetch(config.channels.main.featured) as TextChannel;
      const msg = await ch.messages.fetch(active.featured_message_id);
      await msg.delete();
    } catch { /* already gone */ }
    await markFeaturedDone(active.id);
  }

  const next = await getNextFeatured();
  if (!next) return;

  const post = await getPost(next.post_id);
  if (!post || post.status !== 'live') { await markFeaturedDone(next.id); return; }

  const guild = await client.guilds.fetch(config.servers.main);
  let sellerTag = `<@${post.user_id}>`;
  try { const m = await guild.members.fetch(post.user_id); sellerTag = `${m.user.tag} (<@${post.user_id}>)`; } catch { /* ignore */ }

  const embed   = buildAssetEmbed(post, sellerTag);
  const buttons = buildListingButtons(post.post_id);
  const ch      = await client.channels.fetch(config.channels.main.featured) as TextChannel;
  const msg     = await ch.send({ embeds: [embed], components: [buttons] });

  const slotMs    = next.seller_tier === 'trusted' ? config.featured.trustedSeller : config.featured.standard;
  const expiresAt = new Date(Date.now() + slotMs);
  await setFeaturedActive(next.id, msg.id, expiresAt);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function resolveType(targetId: string): 'FH' | 'LFD' | 'ASSET' | 'APP' {
  if (targetId.startsWith('APP-'))   return 'APP';
  if (targetId.startsWith('FH-'))    return 'FH';
  if (targetId.startsWith('LFD-'))   return 'LFD';
  return 'ASSET';
}
