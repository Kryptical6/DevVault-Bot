// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — EMBED BUILDERS
// ─────────────────────────────────────────────────────────────────────────────
import {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} from 'discord.js';
import { config } from '../config/index.js';
import type { Post, Application } from '../types/index.js';

const FOOTER = 'DevVault';

function base(colour: number): EmbedBuilder {
  return new EmbedBuilder().setColor(colour).setFooter({ text: FOOTER }).setTimestamp();
}

// A horizontal divider using a blank field — breaks up long DM embeds
function divider(): { name: string; value: string; inline: boolean } {
  return { name: '\u200b', value: '\u200b', inline: false };
}

// ─── PUBLIC LISTING EMBEDS ────────────────────────────────────────────────────

export function buildFhEmbed(post: Post, sellerTag: string): EmbedBuilder {
  const e = base(config.colours.fh)
    .setTitle(post.title)
    .addFields([
      { name: 'Role',    value: post.category,             inline: true },
      { name: 'Rates',   value: post.rates || 'N/A',       inline: true },
      { name: 'Payment', value: post.payment_type || 'N/A', inline: true },
    ]);
  if (post.description)     e.setDescription(post.description);
  if (post.portfolio_link)  e.addFields([{ name: 'Portfolio',    value: `[View](${post.portfolio_link})`, inline: true }]);
  if (post.payment_methods) e.addFields([{ name: 'USD Methods',  value: post.payment_methods,              inline: true }]);
  if (post.availability)    e.addFields([{ name: 'Availability', value: post.availability,                 inline: true }]);
  if (post.specialities)    e.addFields([{ name: 'Specialities', value: post.specialities,                 inline: false }]);
  if (post.tags)            e.addFields([{ name: 'Tags',         value: post.tags,                         inline: false }]);
  e.addFields([{ name: 'Seller', value: sellerTag, inline: true }]);
  if (post.showcase_image_url) e.setImage(post.showcase_image_url);
  e.setFooter({ text: `${FOOTER} | ${post.post_id}` });
  return e;
}

export function buildLfdEmbed(post: Post, posterTag: string): EmbedBuilder {
  const e = base(config.colours.lfd)
    .setTitle(post.title)
    .addFields([
      { name: 'Role Needed', value: post.category,                                                    inline: true },
      { name: 'Budget',      value: `${post.price || 'N/A'} (${post.payment_type || 'N/A'})`,         inline: true },
      { name: 'Deadline',    value: post.availability || 'N/A',                                        inline: true },
    ]);
  if (post.description)     e.addFields([{ name: 'Task',           value: post.description,                inline: false }]);
  if (post.payment_methods) e.addFields([{ name: 'Payment Method', value: post.payment_methods,            inline: true  }]);
  if (post.portfolio_link)  e.addFields([{ name: 'Portfolio',      value: `[View](${post.portfolio_link})`, inline: true  }]);
  if (post.tags)            e.addFields([{ name: 'Tags',           value: post.tags,                       inline: false }]);
  e.addFields([{ name: 'Posted by', value: posterTag, inline: true }]);
  e.setFooter({ text: `${FOOTER} | ${post.post_id}` });
  return e;
}

export function buildAssetEmbed(post: Post, sellerTag: string): EmbedBuilder {
  const saleLabel = post.sale_mode === 'single' ? 'Single Sale' : 'Unlimited Sales';
  const e = base(config.colours.assets)
    .setTitle(post.title)
    .addFields([
      { name: 'Category',  value: post.category,                                             inline: true },
      { name: 'Price',     value: `${post.price || 'N/A'} (${post.payment_type || 'N/A'})`, inline: true },
      { name: 'Sale Type', value: saleLabel,                                                 inline: true },
    ]);
  if (post.description)     e.addFields([{ name: 'Description', value: post.description,    inline: false }]);
  if (post.payment_methods) e.addFields([{ name: 'USD Methods', value: post.payment_methods, inline: true  }]);
  if (post.tags)            e.addFields([{ name: 'Tags',        value: post.tags,            inline: false }]);
  e.addFields([{ name: 'Seller', value: sellerTag, inline: true }]);
  if (post.showcase_image_url) e.setImage(post.showcase_image_url);
  e.setFooter({ text: `${FOOTER} | ${post.post_id}` });
  return e;
}

// ─── REVIEW EMBEDS (STAFF) ────────────────────────────────────────────────────

export interface ReviewMeta {
  accountAge:  string;
  postHistory: string;
  activeFlags: string;
  mpNotes:     string;
}

export function buildFhReviewEmbed(post: Post, sellerTag: string, meta: ReviewMeta): EmbedBuilder {
  const e = base(config.colours.fh)
    .setTitle(`FH Review | ${post.title}`)
    .addFields([
      { name: 'Post ID',  value: post.post_id,  inline: true },
      { name: 'Role',     value: post.category, inline: true },
      { name: 'Seller',   value: sellerTag,     inline: true },
      divider(),
      { name: 'About',        value: post.description || 'N/A',                                         inline: false },
      { name: 'Portfolio',    value: post.portfolio_link ? `[Link](${post.portfolio_link})` : 'None',    inline: true  },
      { name: 'Rates',        value: post.rates || 'N/A',                                                inline: true  },
      { name: 'Payment',      value: post.payment_type || 'N/A',                                         inline: true  },
      { name: 'Availability', value: post.availability || 'N/A',                                         inline: true  },
      { name: 'Tags',         value: post.tags || 'None',                                                inline: false },
      divider(),
      { name: 'Account Age',  value: meta.accountAge,  inline: true },
      { name: 'Post History', value: meta.postHistory, inline: true },
      { name: 'Active Flags', value: meta.activeFlags, inline: true },
    ]);
  if (meta.mpNotes)            e.addFields([{ name: 'MP Notes', value: meta.mpNotes, inline: false }]);
  if (post.showcase_image_url) e.setImage(post.showcase_image_url);
  e.setFooter({ text: `${FOOTER} | ${post.post_id}` });
  return e;
}

export function buildLfdReviewEmbed(post: Post, posterTag: string, meta: ReviewMeta): EmbedBuilder {
  const e = base(config.colours.lfd)
    .setTitle(`LFD Review | ${post.title}`)
    .addFields([
      { name: 'Post ID',     value: post.post_id,  inline: true },
      { name: 'Role Needed', value: post.category, inline: true },
      { name: 'Posted by',   value: posterTag,     inline: true },
      divider(),
      { name: 'Task',     value: post.description || 'N/A',                                         inline: false },
      { name: 'Budget',   value: `${post.price || 'N/A'} (${post.payment_type || 'N/A'})`,          inline: true  },
      { name: 'Deadline', value: post.availability || 'N/A',                                        inline: true  },
      { name: 'Tags',     value: post.tags || 'None',                                               inline: false },
      divider(),
      { name: 'Account Age',  value: meta.accountAge,  inline: true },
      { name: 'Post History', value: meta.postHistory, inline: true },
      { name: 'Active Flags', value: meta.activeFlags, inline: true },
    ]);
  if (meta.mpNotes) e.addFields([{ name: 'MP Notes', value: meta.mpNotes, inline: false }]);
  e.setFooter({ text: `${FOOTER} | ${post.post_id}` });
  return e;
}

export function buildAssetReviewEmbed(post: Post, sellerTag: string, meta: ReviewMeta): EmbedBuilder {
  const e = base(config.colours.assets)
    .setTitle(`Asset Review | ${post.title}`)
    .addFields([
      { name: 'Post ID',   value: post.post_id,  inline: true },
      { name: 'Category',  value: post.category, inline: true },
      { name: 'Seller',    value: sellerTag,     inline: true },
      divider(),
      { name: 'Description',  value: post.description || 'N/A',                                             inline: false },
      { name: 'Price',        value: `${post.price || 'N/A'} (${post.payment_type || 'N/A'})`,              inline: true  },
      { name: 'Sale Type',    value: post.sale_mode === 'single' ? 'Single Sale' : 'Unlimited Sales',       inline: true  },
      { name: 'Payment Link', value: post.payment_link ? `[Link](${post.payment_link})` : 'N/A',           inline: true  },
      { name: 'Tags',         value: post.tags || 'None',                                                   inline: false },
      divider(),
      { name: 'Account Age',  value: meta.accountAge,  inline: true },
      { name: 'Post History', value: meta.postHistory, inline: true },
      { name: 'Active Flags', value: meta.activeFlags, inline: true },
    ]);
  if (meta.mpNotes)            e.addFields([{ name: 'MP Notes', value: meta.mpNotes, inline: false }]);
  if (post.showcase_image_url) e.setImage(post.showcase_image_url);
  e.setFooter({ text: `${FOOTER} | ${post.post_id}` });
  return e;
}

export function buildApplicationReviewEmbed(app: Application, userTag: string, meta: ReviewMeta): EmbedBuilder {
  const e = base(config.colours.applications)
    .setTitle(`Application | ${app.skill_type}`)
    .addFields([
      { name: 'Application ID', value: app.application_id, inline: true },
      { name: 'Applicant',      value: userTag,            inline: true },
      { name: 'Skill Type',     value: app.skill_type,     inline: true },
      divider(),
      { name: 'Portfolio',   value: `[View](${app.portfolio_link})`, inline: false },
      divider(),
      { name: 'Account Age',  value: meta.accountAge,  inline: true },
      { name: 'App History',  value: meta.postHistory, inline: true },
      { name: 'Active Flags', value: meta.activeFlags, inline: true },
    ]);
  if (meta.mpNotes) e.addFields([{ name: 'MP Notes', value: meta.mpNotes, inline: false }]);
  e.setFooter({ text: `${FOOTER} | ${app.application_id}` });
  return e;
}

// ─── SYSTEM / DM EMBEDS ───────────────────────────────────────────────────────
// These use a cleaner layout with an icon prefix in the title so consecutive
// DM messages are visually distinct and easy to scan.

export function buildInfoEmbed(title: string, description: string): EmbedBuilder {
  return base(config.colours.system).setTitle(`${title}`).setDescription(description);
}

export function buildSuccessEmbed(title: string, description: string): EmbedBuilder {
  return base(config.colours.approval).setTitle(`${title}`).setDescription(description);
}

export function buildErrorEmbed(title: string, description: string): EmbedBuilder {
  return base(config.colours.denial).setTitle(`${title}`).setDescription(description);
}

export function buildDenialEmbed(refId: string, reasons: string): EmbedBuilder {
  return base(config.colours.denial)
    .setTitle('Submission Not Approved')
    .setDescription(`Your submission could not be approved at this time.\n\n**Reasons:**\n${reasons}\n\nIf you believe this was an error, you can open a ticket.`)
    .setFooter({ text: `${FOOTER} | ${refId}` });
}

export function buildProofRequestEmbed(refId: string, type: 'ownership' | 'funds'): EmbedBuilder {
  const desc = type === 'ownership'
    ? [
        '**Ownership verification is required** before your submission can proceed.',
        '',
        'Please submit a short screen recording showing your project files, creation process, and any relevant source files.',
        '',
        `Reference: \`${refId}\``,
      ].join('\n')
    : [
        '**Funds verification is required** before your submission can proceed.',
        '',
        'Please submit a screen recording showing your available balance and a page refresh to confirm the funds.',
        '',
        `Reference: \`${refId}\``,
      ].join('\n');
  return base(config.colours.proofRequest)
    .setTitle('Verification Required')
    .setDescription(desc)
    .setFooter({ text: `${FOOTER} | ${refId}` });
}

export function buildModerationHoldEmbed(refId: string): EmbedBuilder {
  return base(config.colours.moderation)
    .setTitle('Post Under Review')
    .setDescription('Your post has been flagged for additional review. You will be contacted if further information is required.\n\nNo action is needed from you right now.')
    .setFooter({ text: `${FOOTER} | ${refId}` });
}

// ─── ACTION ROW BUILDERS ──────────────────────────────────────────────────────

export function buildReviewButtons(
  postType: 'FH' | 'LFD' | 'ASSET' | 'APP',
  targetId: string
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`review_approve_${targetId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`review_deny_${targetId}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
  );
  if (postType === 'LFD') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`review_proof_funds_${targetId}`).setLabel('Request Proof of Funds').setStyle(ButtonStyle.Primary),
    );
  } else {
    row.addComponents(
      new ButtonBuilder().setCustomId(`review_proof_ownership_${targetId}`).setLabel('Request Proof').setStyle(ButtonStyle.Primary),
    );
  }
  if (postType !== 'ASSET') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`review_moderate_${targetId}`).setLabel('Moderate').setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

export function buildListingButtons(postId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`buy_asset_${postId}`).setLabel('Buy Asset').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`save_post_${postId}`).setLabel('Save').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`report_post_${postId}`).setLabel('Report').setStyle(ButtonStyle.Danger),
  );
}

export function buildFHLFDButtons(postId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`contact_seller_${postId}`).setLabel('Contact').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`save_post_${postId}`).setLabel('Save').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`report_post_${postId}`).setLabel('Report').setStyle(ButtonStyle.Danger),
  );
}

export function buildAppealButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('appeal_punishment').setLabel('Appeal').setStyle(ButtonStyle.Secondary),
  );
}

export function buildBanServerButton(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('Ban Appeals Server').setStyle(ButtonStyle.Link).setURL(config.banServerInvite),
  );
}
