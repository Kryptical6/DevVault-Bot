// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — POST / APPLY / TICKET WORKFLOWS (DM-based)
// ─────────────────────────────────────────────────────────────────────────────
import {
  Client, User, DMChannel, Message,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ButtonInteraction, StringSelectMenuInteraction, EmbedBuilder
} from 'discord.js';
import { config, skillRoleMap, assetCategoryMap } from '../config/index.js';
import {
  upsertUser, createPost, getSession, saveSession, updateSession,
  clearSession, hasActiveSession, isMarketplaceMuted,
  createApplication, getUserAnalyticsData, getOpenTicketByUser
} from '../db/helpers.js';
import {
  buildInfoEmbed, buildSuccessEmbed, buildErrorEmbed,
  buildFhEmbed, buildLfdEmbed, buildAssetEmbed
} from '../utils/embeds.js';
import { submitPostForReview, submitApplicationForReview } from '../systems/reviewSystem.js';
import { assessLFDRisk } from '../systems/riskScoring.js';
import { logPost } from '../utils/logger.js';
import { handleCreateTicket } from '../systems/ticketSystem.js';
import type { Post } from '../types/index.js';

let wfClient: Client | null = null;
export function setPostWorkflowClient(c: Client): void { wfClient = c; }

// ─── ROUTE DM COMMANDS ────────────────────────────────────────────────────────

export async function routeDmCommand(user: User, cmd: string, client: Client): Promise<void> {
  wfClient = client;
  const dm = await user.createDM();
  switch (cmd) {
    case 'post':       await startPost(user, dm);     break;
    case 'apply':      await startApply(user, dm);    break;
    case 'ticket':     await startTicket(user, dm);   break;
    case 'analytics':  await showAnalytics(user, dm); break;
    case 'saved':      { const { startSavedBrowse } = await import('./browseWorkflow.js'); await startSavedBrowse(user, client); break; }
    case 'browse':     { const { startBrowse }      = await import('./browseWorkflow.js'); await startBrowse(user, client);      break; }
    case 'repost':     { const { startRepost }      = await import('./repostWorkflow.js'); await startRepost(user, client);      break; }
    case 'get-seller': { const { handleGetSeller }  = await import('../systems/sellerSystem.js'); await handleGetSeller(user.id); break; }
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

async function startPost(user: User, dm: DMChannel): Promise<void> {
  if (!wfClient) return;
  const guild  = await wfClient.guilds.fetch(config.servers.main);
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member?.roles.cache.has(config.roles.main.verified)) {
    await dm.send({ embeds: [buildErrorEmbed('Not Verified', 'You need to verify your Roblox account with Bloxlink before posting.')] }); return;
  }
  if (await isMarketplaceMuted(user.id)) {
    await dm.send({ embeds: [buildErrorEmbed('Marketplace Restricted', 'You are currently restricted from using marketplace features.')] }); return;
  }
  if (await hasActiveSession(user.id)) {
    await dm.send({ embeds: [buildInfoEmbed('Workflow Active', 'You already have an active workflow. Continue in the messages below, or type **cancel** to start over.')] }); return;
  }
  await upsertUser(user.id, user.tag);
  await saveSession(user.id, 'post', 0, {});
  await dm.send({
    embeds: [buildInfoEmbed('Create a Listing', "Hey! Let's get your listing set up. What type of post would you like to create?")],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId('post_category_select').setPlaceholder('Select post type')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('For Hire').setValue('FH').setDescription('Advertise your development services'),
          new StringSelectMenuOptionBuilder().setLabel('Looking For Developers').setValue('LFD').setDescription('Hire a developer for your project'),
          new StringSelectMenuOptionBuilder().setLabel('Assets').setValue('ASSET').setDescription('Sell templates, systems, models and more'),
        )
    )],
  });
}

export async function handlePostCategorySelect(userId: string, category: 'FH' | 'LFD' | 'ASSET'): Promise<void> {
  if (!wfClient) return;
  const user   = await wfClient.users.fetch(userId);
  const dm     = await user.createDM();
  const guild  = await wfClient.guilds.fetch(config.servers.main);
  const member = await guild.members.fetch(userId).catch(() => null);

  if (category === 'FH') {
    const hasSkill = member && Object.values(skillRoleMap).some(s => member.roles.cache.has(s.roleId));
    if (!hasSkill) { await clearSession(userId); await dm.send({ embeds: [buildErrorEmbed('Skill Role Required', 'You need a skill role to post For Hire listings. Use `/apply` to apply for one.')] }); return; }
    await updateSession(userId, 1, { type: 'FH' });
    await sendPrompt(dm, 'Specialisation', 'What is your main specialisation?', skillMenuFH());
  } else if (category === 'LFD') {
    await updateSession(userId, 1, { type: 'LFD' });
    await sendPrompt(dm, 'Role Needed', 'What type of developer are you looking for?', skillMenuLFD());
  } else {
    if (!member?.roles.cache.has(config.roles.main.marketplaceSubscriber)) {
      await clearSession(userId); await dm.send({ embeds: [buildErrorEmbed('Subscription Required', 'You need an active Patreon subscription to sell assets. Use `/get-seller` if your role was not assigned.')] }); return;
    }
    await updateSession(userId, 1, { type: 'ASSET' });
    await sendPrompt(dm, 'Asset Category', 'What type of asset are you selling?', assetCatMenu());
  }
}

// ─── DM MESSAGE HANDLER ───────────────────────────────────────────────────────

export async function handleDmMessage(message: Message): Promise<void> {
  if (!wfClient) return;
  const session = await getSession(message.author.id);
  if (!session) return;
  const dm      = message.channel as DMChannel;
  const content = message.content.trim();

  if (content.toLowerCase() === 'cancel') {
    await clearSession(message.author.id);
    await dm.send({ embeds: [buildInfoEmbed('Cancelled', 'Workflow cancelled. You can start again anytime.')] }); return;
  }

  const data = session.data as Record<string, unknown>;
  if (session.workflow_type === 'post')  await handlePostStep(message.author.id, content, message, dm, session.step, data);
  if (session.workflow_type === 'apply') await handleApplyStep(message.author.id, content, dm, session.step, data);
}

// ─── POST STEP ROUTER ─────────────────────────────────────────────────────────

async function handlePostStep(
  userId: string, content: string, message: Message,
  dm: DMChannel, step: number, data: Record<string, unknown>
): Promise<void> {
  const type = data.type as string;
  const skip = content.toLowerCase() === 'skip';

  if (type === 'FH') {
    switch (step) {
      case 2:  data.title     = content.slice(0, 70); await next(userId, 3, data); await ask(dm, 'About Me', 'Write a short about me — your experience and what you offer. (max 200 characters)'); break;
      case 3:  data.aboutMe   = content.slice(0, 200); await next(userId, 4, data); await ask(dm, 'Portfolio Link', 'Drop your portfolio link.'); break;
      case 4:  data.portfolio = content; await next(userId, 5, data); await ask(dm, 'Showcase Image', 'Upload a showcase image of your best work. (type **skip** to skip)'); break;
      case 5:  data.image     = message.attachments.size > 0 ? message.attachments.first()!.url : null; await next(userId, 6, data); await ask(dm, 'Rates', 'What are your rates? Include your pricing structure (hourly / per task / fixed).'); break;
      case 6:  data.rates     = content; await next(userId, 7, data); await sendPrompt(dm, 'Payment Types', 'Which payment types do you accept?', paymentTypeMenu('fh_payment_type')); break;
      case 8:  data.avail     = content; await next(userId, 9, data); await ask(dm, 'Specialities', 'Any specialities? List them comma-separated. (type **skip** to skip)'); break;
      case 9:  data.spec      = skip ? null : content; await next(userId, 10, data); await ask(dm, 'Tags', 'Add some tags (comma-separated, e.g. scripting, ui, roblox).'); break;
      case 10: data.tags      = content; await next(userId, 11, data); await showFhPreview(userId, dm, data); break;
    }
  } else if (type === 'LFD') {
    switch (step) {
      case 2:  data.title       = content.slice(0, 70); await next(userId, 3, data); await sendPrompt(dm, 'Payment Type', 'What currency are you paying in?', paymentTypeMenu('lfd_payment_type')); break;
      case 4:  data.amount      = content; await next(userId, 5, data); await ask(dm, 'Deadline', "What's your deadline? (e.g. \"2 weeks\", \"ASAP\")"); break;
      case 5:  data.deadline    = content; await next(userId, 6, data); await ask(dm, 'Task Description', 'Describe the task — what needs to be done and the scope of work. (max 200 characters)'); break;
      case 6:  data.task        = content.slice(0, 200); await next(userId, 7, data); await ask(dm, 'Portfolio / Game Link', 'Do you have a portfolio or game link? (type **skip** to skip)'); break;
      case 7:  data.portfolio   = skip ? null : content; await next(userId, 8, data); await ask(dm, 'Tags', 'Add some tags (comma-separated, e.g. scripting, ui, paid).'); break;
      case 8:  data.tags        = content; await next(userId, 9, data); await showLfdPreview(userId, dm, data); break;
    }
  } else if (type === 'ASSET') {
    switch (step) {
      case 2:  data.title       = content.slice(0, 70); await next(userId, 3, data); await sendPrompt(dm, 'Sale Type', 'How would you like to sell this asset?', saleModeMenu()); break;
      case 4:  data.price       = content; await next(userId, 5, data); await sendPrompt(dm, 'Payment Type', 'What currency are you pricing this in?', paymentTypeMenu('asset_payment_type')); break;
      case 7:  data.delivery    = message.attachments.size > 0 ? message.attachments.first()!.url : content; await next(userId, 8, data); await ask(dm, 'Payment Link', 'Share your payment link (gamepass, product page, or external link).'); break;
      case 8:  data.paymentLink = content; await next(userId, 9, data); await ask(dm, 'Showcase Image', 'Upload a showcase image for your asset.'); break;
      case 9:  data.image       = message.attachments.size > 0 ? message.attachments.first()!.url : null; await next(userId, 10, data); await ask(dm, 'Description', 'Describe your asset — what it includes and what it does. (max 200 characters)'); break;
      case 10: data.desc        = content.slice(0, 200); await next(userId, 11, data); await ask(dm, 'Tags', 'Add some tags (comma-separated, e.g. ui, system, template).'); break;
      case 11: data.tags        = content; await next(userId, 12, data); await askOwnership(dm); break;
    }
  }
}

// ─── SELECT MENU HANDLERS ─────────────────────────────────────────────────────

export async function handlePostSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!wfClient) return;
  const session = await getSession(interaction.user.id);
  if (!session) return;
  const data = session.data as Record<string, unknown>;
  const dm   = await interaction.user.createDM();
  await interaction.deferUpdate();
  const id   = interaction.customId;
  const val  = interaction.values[0];
  const vals = interaction.values;

  if (id === 'post_category_select') { await handlePostCategorySelect(interaction.user.id, val as 'FH' | 'LFD' | 'ASSET'); return; }
  if (id === 'apply_skill_select')   { await handleApplySkillSelect(interaction); return; }
  if (id === 'ticket_type_select')   { await handleTicketTypeSelect(interaction); return; }

  if (id === 'fh_specialisation') { data.specialisation = val; await next(interaction.user.id, 2, data); await ask(dm, 'Title', "What's the title of your listing? (max 70 characters)"); }
  if (id === 'fh_payment_type') {
    data.paymentType = vals;
    if (vals.includes('USD')) {
      await next(interaction.user.id, 7.5 as never, data);
      await sendPrompt(dm, 'USD Methods', 'Which USD payment methods do you accept?', usdMethodMenu('fh_usd_methods'));
    } else {
      await next(interaction.user.id, 8, data); await ask(dm, 'Availability', "What's your availability and timezone? (e.g. GMT+0, evenings)");
    }
  }
  if (id === 'fh_usd_methods')    { data.usdMethods = vals.join(', '); await next(interaction.user.id, 8, data); await ask(dm, 'Availability', "What's your availability and timezone? (e.g. GMT+0, evenings)"); }
  if (id === 'lfd_role_needed')   { data.role = val; await next(interaction.user.id, 2, data); await ask(dm, 'Title', "What's the title of your listing? (max 70 characters)"); }
  if (id === 'lfd_payment_type') {
    data.paymentType = val;
    if (val === 'USD') {
      await sendPrompt(dm, 'USD Method', 'Which USD payment method will you use?', usdMethodMenuSingle('lfd_usd_method'));
    } else {
      await next(interaction.user.id, 4, data); await ask(dm, 'Payment Amount', 'How much are you paying? Enter the amount (numbers only).');
    }
  }
  if (id === 'lfd_usd_method')    { data.usdMethod = val; await next(interaction.user.id, 4, data); await ask(dm, 'Payment Amount', 'How much are you paying? Enter the amount (numbers only).'); }
  if (id === 'asset_category')    { data.category = val; await next(interaction.user.id, 2, data); await ask(dm, 'Title', "What's the title of your listing? (max 70 characters)"); }
  if (id === 'asset_sale_type')   { data.saleType = val; await next(interaction.user.id, 4, data); await ask(dm, 'Price', "What's the price? Enter the amount (numbers only)."); }
  if (id === 'asset_payment_type') {
    data.paymentType = val;
    if (val === 'USD') {
      await sendPrompt(dm, 'USD Methods', 'Which USD payment methods do you accept?', usdMethodMenu('asset_usd_methods'));
    } else {
      await next(interaction.user.id, 7, data); await ask(dm, 'Asset Delivery', 'Upload the asset file or paste a secure delivery link.');
    }
  }
  if (id === 'asset_usd_methods') { data.usdMethods = vals.join(', '); await next(interaction.user.id, 7, data); await ask(dm, 'Asset Delivery', 'Upload the asset file or paste a secure delivery link.'); }
}

// ─── CONFIRM / CANCEL ─────────────────────────────────────────────────────────

export async function handlePostConfirm(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!wfClient) return;
  const session = await getSession(interaction.user.id);
  if (!session) { await interaction.editReply({ embeds: [buildErrorEmbed('Session Expired', 'Please use `/post` to start again.')] }); return; }

  const data = session.data as Record<string, unknown>;
  const type = data.type as 'FH' | 'LFD' | 'ASSET';
  const user = interaction.user;
  await clearSession(user.id);

  let post;
  if (type === 'FH') {
    post = await createPost({
      user_id: user.id, post_type: 'FH',
      category: data.specialisation as string,
      title: data.title as string,
      description: data.aboutMe as string ?? undefined,
      portfolio_link: data.portfolio as string ?? undefined,
      showcase_image_url: data.image as string ?? undefined,
      rates: data.rates as string ?? undefined,
      payment_type: Array.isArray(data.paymentType) ? (data.paymentType as string[]).join(', ') : data.paymentType as string ?? undefined,
      payment_methods: data.usdMethods as string ?? undefined,
      availability: data.avail as string ?? undefined,
      specialities: data.spec as string ?? undefined,
      tags: data.tags as string ?? undefined,
    });
  } else if (type === 'LFD') {
    post = await createPost({
      user_id: user.id, post_type: 'LFD',
      category: data.role as string,
      title: data.title as string,
      description: data.task as string ?? undefined,
      price: data.amount as string ?? undefined,
      payment_type: data.paymentType as string ?? undefined,
      payment_methods: data.usdMethod as string ?? undefined,
      availability: data.deadline as string ?? undefined,
      portfolio_link: data.portfolio as string ?? undefined,
      tags: data.tags as string ?? undefined,
    });
  } else {
    post = await createPost({
      user_id: user.id, post_type: 'ASSET',
      category: data.category as string,
      title: data.title as string,
      description: data.desc as string ?? undefined,
      price: data.price as string ?? undefined,
      payment_type: data.paymentType as string ?? undefined,
      payment_methods: data.usdMethods as string ?? undefined,
      sale_mode: data.saleType as 'single' | 'unlimited' ?? undefined,
      asset_delivery: data.delivery as string ?? undefined,
      payment_link: data.paymentLink as string ?? undefined,
      showcase_image_url: data.image as string ?? undefined,
      tags: data.tags as string ?? undefined,
    });
  }

  if (type === 'LFD' && assessLFDRisk(data.paymentType as string, data.amount as string)) {
    const dm = await user.createDM();
    await dm.send({
      embeds: [buildInfoEmbed('Verification Required', `Your listing requires funds verification due to the payment amount.\n\n-# ${post.post_id}`)],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`submit_proof_funds_${post.post_id}`).setLabel('Submit Proof of Funds').setStyle(ButtonStyle.Primary)
      )],
    });
  } else {
    await submitPostForReview(post, `${user.tag} (<@${user.id}>)`);
    const dm = await user.createDM();
    await dm.send({ embeds: [buildSuccessEmbed('Post Submitted', `Your post has been successfully submitted.\n\n-# ${post.post_id}\n\nYou will be notified once there is an update.`)] });
  }

  await logPost({ action: 'Created', postId: post.post_id, userId: user.id, username: user.tag });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Done', 'Your post has been submitted.')] });
}

export async function handlePostCancel(interaction: ButtonInteraction): Promise<void> {
  await clearSession(interaction.user.id);
  await interaction.update({ embeds: [buildInfoEmbed('Cancelled', 'Post cancelled.')], components: [] });
}

export async function handlePostEdit(interaction: ButtonInteraction): Promise<void> {
  await clearSession(interaction.user.id);
  await interaction.update({ embeds: [buildInfoEmbed('Restarting', 'Use `/post` to start a new listing.')], components: [] });
}

export async function handleAssetOwnershipConfirm(interaction: ButtonInteraction, confirmed: boolean): Promise<void> {
  if (!confirmed) { await clearSession(interaction.user.id); await interaction.update({ embeds: [buildInfoEmbed('Cancelled', 'Asset listing cancelled.')], components: [] }); return; }
  const session = await getSession(interaction.user.id);
  if (!session) return;
  const data = session.data as Record<string, unknown>;
  data.owned = true;
  await updateSession(interaction.user.id, 13, data);
  await interaction.update({ embeds: [buildInfoEmbed('Confirmed', 'Ownership confirmed.')], components: [] });
  const dm = await interaction.user.createDM();
  await showAssetPreview(interaction.user.id, dm, data);
}

// ─── PREVIEW BUILDERS ─────────────────────────────────────────────────────────

async function showFhPreview(userId: string, dm: DMChannel, data: Record<string, unknown>): Promise<void> {
  if (!wfClient) return;
  const mock = mockPost(userId, 'FH', data) as Post;
  const guild = await wfClient.guilds.fetch(config.servers.main);
  let tag = `<@${userId}>`;
  try { const m = await guild.members.fetch(userId); tag = `${m.user.tag} (<@${userId}>)`; } catch { /* ignore */ }
  await dm.send({ embeds: [buildInfoEmbed('Preview', "Here's how your listing will look. Everything look good?"), buildFhEmbed(mock, tag)], components: [confirmRow()] });
}

async function showLfdPreview(userId: string, dm: DMChannel, data: Record<string, unknown>): Promise<void> {
  if (!wfClient) return;
  const mock = mockPost(userId, 'LFD', data) as Post;
  const guild = await wfClient.guilds.fetch(config.servers.main);
  let tag = `<@${userId}>`;
  try { const m = await guild.members.fetch(userId); tag = `${m.user.tag} (<@${userId}>)`; } catch { /* ignore */ }
  await dm.send({ embeds: [buildInfoEmbed('Preview', "Here's how your listing will look. Everything look good?"), buildLfdEmbed(mock, tag)], components: [confirmRow()] });
}

async function showAssetPreview(userId: string, dm: DMChannel, data: Record<string, unknown>): Promise<void> {
  if (!wfClient) return;
  const mock = mockPost(userId, 'ASSET', data) as Post;
  const guild = await wfClient.guilds.fetch(config.servers.main);
  let tag = `<@${userId}>`;
  try { const m = await guild.members.fetch(userId); tag = `${m.user.tag} (<@${userId}>)`; } catch { /* ignore */ }
  await dm.send({ embeds: [buildInfoEmbed('Preview', "Here's how your listing will look. Everything look good?"), buildAssetEmbed(mock, tag)], components: [confirmRow()] });
}

// ─── APPLY WORKFLOW ───────────────────────────────────────────────────────────

async function startApply(user: User, dm: DMChannel): Promise<void> {
  if (await hasActiveSession(user.id)) {
    await dm.send({ embeds: [buildInfoEmbed('Workflow Active', 'You already have an active workflow. Type to continue or type **cancel** to restart.')] }); return;
  }
  await upsertUser(user.id, user.tag);
  await saveSession(user.id, 'apply', 1, {});
  await sendPrompt(dm, 'Skill Role Application', 'Which skill are you applying for?',
    new StringSelectMenuBuilder().setCustomId('apply_skill_select').setPlaceholder('Select a skill')
      .addOptions(Object.values(skillRoleMap).map(s => new StringSelectMenuOptionBuilder().setLabel(s.label).setValue(s.label)))
  );
}

export async function handleApplySkillSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const session = await getSession(interaction.user.id);
  if (!session) return;
  const data = session.data as Record<string, unknown>;
  data.skillType = interaction.values[0];
  await updateSession(interaction.user.id, 2, data);
  await interaction.update({ embeds: [buildInfoEmbed('Portfolio Link', "Drop your portfolio link. Make sure it's accessible.")], components: [] });
}

async function handleApplyStep(userId: string, content: string, dm: DMChannel, step: number, data: Record<string, unknown>): Promise<void> {
  if (step !== 2) return;
  data.portfolio = content;
  await clearSession(userId);
  if (!wfClient) return;
  const user = await wfClient.users.fetch(userId);
  const app  = await createApplication(userId, data.skillType as string, content);
  await submitApplicationForReview(app, `${user.tag} (<@${userId}>)`);
  await dm.send({ embeds: [buildSuccessEmbed('Application Submitted', `Your application has been received.\n\n-# ${app.application_id}\n\nStatus updates will be sent here.`)] });
}

// ─── TICKET WORKFLOW ──────────────────────────────────────────────────────────

async function startTicket(user: User, dm: DMChannel): Promise<void> {
  const existing = await getOpenTicketByUser(user.id);
  if (existing) { await dm.send({ embeds: [buildErrorEmbed('Ticket Already Open', 'You already have an open ticket. Please wait for it to be resolved.')] }); return; }
  await sendPrompt(dm, 'Open a Ticket', 'What type of ticket would you like to open?',
    new StringSelectMenuBuilder().setCustomId('ticket_type_select').setPlaceholder('Select ticket type')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('Marketplace').setValue('marketplace').setDescription('Issues with listings, purchases, or assets'),
        new StringSelectMenuOptionBuilder().setLabel('Moderation').setValue('moderation').setDescription('Appeals, reports, or moderation questions'),
        new StringSelectMenuOptionBuilder().setLabel('Support').setValue('support').setDescription('General help or platform questions'),
      )
  );
}

export async function handleTicketTypeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();
  const type = interaction.values[0] as 'marketplace' | 'moderation' | 'support';
  await handleCreateTicket(interaction.user.id, type);
  await interaction.editReply({ embeds: [buildSuccessEmbed('Ticket Created', 'Your ticket has been opened. Type here to send messages to staff.')], components: [] });
}

// ─── ANALYTICS ────────────────────────────────────────────────────────────────

async function showAnalytics(user: User, dm: DMChannel): Promise<void> {
  if (!wfClient) return;
  const guild  = await wfClient.guilds.fetch(config.servers.main);
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member?.roles.cache.has(config.roles.main.marketplaceSubscriber)) {
    await dm.send({ embeds: [buildErrorEmbed('No Access', 'Analytics are available for Marketplace Subscribers only.')] }); return;
  }
  const rows = await getUserAnalyticsData(user.id);
  if (!rows.length) { await dm.send({ embeds: [buildInfoEmbed('Analytics', 'You have no post analytics yet.')] }); return; }

  const embed = new EmbedBuilder().setColor(config.colours.system).setTitle('Your Post Analytics').setFooter({ text: 'DevVault' }).setTimestamp();
  for (const r of rows.slice(0, 10)) {
    embed.addFields([{ name: `${r.title} (${r.post_id})`, value: `Views: ${r.impressions} | Clicks: ${r.clicks} | Saves: ${r.saves} | Purchases: ${r.purchases}`, inline: false }]);
  }
  await dm.send({ embeds: [embed] });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function next(userId: string, step: number, data: Record<string, unknown>): Promise<void> {
  await updateSession(userId, step, data);
}

async function ask(dm: DMChannel, title: string, text: string): Promise<void> {
  await dm.send({ embeds: [buildInfoEmbed(title, text)] });
}

async function sendPrompt(dm: DMChannel, title: string, text: string, menu: StringSelectMenuBuilder): Promise<void> {
  await dm.send({ embeds: [buildInfoEmbed(title, text)], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
}

async function askOwnership(dm: DMChannel): Promise<void> {
  await dm.send({
    embeds: [buildInfoEmbed('Ownership Confirmation', 'By confirming, you verify that you own full rights to this asset and it is your original work.')],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('asset_ownership_yes').setLabel('I confirm ownership').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('asset_ownership_no').setLabel('Cancel').setStyle(ButtonStyle.Danger),
    )],
  });
}

function confirmRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('post_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('post_edit').setLabel('Start Over').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('post_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
  );
}

function skillMenuFH(): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder().setCustomId('fh_specialisation').setPlaceholder('Select your specialisation')
    .addOptions(Object.values(skillRoleMap).map(s => new StringSelectMenuOptionBuilder().setLabel(s.label).setValue(s.label)));
}

function skillMenuLFD(): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder().setCustomId('lfd_role_needed').setPlaceholder('Select the role you need')
    .addOptions(Object.values(skillRoleMap).map(s => new StringSelectMenuOptionBuilder().setLabel(s.label).setValue(s.label)));
}

function assetCatMenu(): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder().setCustomId('asset_category').setPlaceholder('Select asset category')
    .addOptions(Object.values(assetCategoryMap).map(c => new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(c.label)));
}

function paymentTypeMenu(customId: string): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Payment type').setMinValues(1).setMaxValues(2)
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Robux').setValue('Robux'),
      new StringSelectMenuOptionBuilder().setLabel('USD').setValue('USD'),
    );
}

function saleModeMenu(): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder().setCustomId('asset_sale_type').setPlaceholder('Sale type')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Single Sale').setValue('single').setDescription('Sold once, then archived'),
      new StringSelectMenuOptionBuilder().setLabel('Unlimited Sales').setValue('unlimited').setDescription('Can be purchased multiple times'),
    );
}

function usdMethodMenu(customId: string): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('USD payment methods').setMinValues(1).setMaxValues(3)
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('PayPal').setValue('PayPal'),
      new StringSelectMenuOptionBuilder().setLabel('CashApp').setValue('CashApp'),
      new StringSelectMenuOptionBuilder().setLabel('Bank Transfer').setValue('Bank Transfer'),
    );
}

function usdMethodMenuSingle(customId: string): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('USD payment method')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('PayPal').setValue('PayPal'),
      new StringSelectMenuOptionBuilder().setLabel('CashApp').setValue('CashApp'),
      new StringSelectMenuOptionBuilder().setLabel('Bank Transfer').setValue('Bank Transfer'),
    );
}

function mockPost(userId: string, type: 'FH' | 'LFD' | 'ASSET', data: Record<string, unknown>): Partial<Post> {
  const base: Partial<Post> = {
    post_id: `${type}-XXXX`, user_id: userId, post_type: type,
    status: 'pending', discord_message_id: null, staff_message_id: null,
    created_at: new Date(), approved_at: null, archived_at: null,
    expires_at: null, repost_available_until: null, cooldown_expires_at: null,
    repost_count: 0, impressions: 0, clicks: 0, saves: 0,
    sale_mode: null, asset_delivery: null, rates: null, availability: null,
    specialities: null, portfolio_link: null, showcase_image_url: null,
    payment_methods: null, payment_link: null, price: null, payment_type: null,
    description: null, tags: null,
  };
  if (type === 'FH') {
    return { ...base, category: data.specialisation as string, title: data.title as string, description: data.aboutMe as string ?? null,
      portfolio_link: data.portfolio as string ?? null, showcase_image_url: data.image as string ?? null,
      rates: data.rates as string ?? null, payment_type: Array.isArray(data.paymentType) ? (data.paymentType as string[]).join(', ') : data.paymentType as string ?? null,
      payment_methods: data.usdMethods as string ?? null, availability: data.avail as string ?? null,
      specialities: data.spec as string ?? null, tags: data.tags as string ?? null };
  } else if (type === 'LFD') {
    return { ...base, category: data.role as string, title: data.title as string, description: data.task as string ?? null,
      price: data.amount as string ?? null, payment_type: data.paymentType as string ?? null,
      payment_methods: data.usdMethod as string ?? null, availability: data.deadline as string ?? null,
      portfolio_link: data.portfolio as string ?? null, tags: data.tags as string ?? null };
  } else {
    return { ...base, category: data.category as string, title: data.title as string, description: data.desc as string ?? null,
      price: data.price as string ?? null, payment_type: data.paymentType as string ?? null,
      payment_methods: data.usdMethods as string ?? null, sale_mode: data.saleType as 'single' | 'unlimited' ?? null,
      asset_delivery: data.delivery as string ?? null, payment_link: data.paymentLink as string ?? null,
      showcase_image_url: data.image as string ?? null, tags: data.tags as string ?? null };
  }
}
