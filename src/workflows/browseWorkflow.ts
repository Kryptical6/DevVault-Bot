import {
  Client, User, DMChannel,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder
} from 'discord.js';
import { config, skillRoleMap, assetCategoryMap } from '../config/index.js';
import { getLivePosts, saveListing, removeSavedListing, getSavedListings, incrementPostAnalytic } from '../db/helpers.js';
import { buildFhEmbed, buildLfdEmbed, buildAssetEmbed, buildInfoEmbed, buildErrorEmbed } from '../utils/embeds.js';
import { Post } from '../types/index.js';

let browseClient: Client | null = null;
export function setBrowseClient(client: Client): void { browseClient = client; }

// In-memory browse sessions: userId -> { posts, index }
const browseSessions = new Map<string, { posts: Post[]; index: number }>();

// ─── START BROWSE ─────────────────────────────────────────────────────────────

export async function startBrowse(user: User, client: Client): Promise<void> {
  browseClient = client;
  const dm = await user.createDM();

  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId('browse_type')
    .setPlaceholder('What are you looking for?')
    .addOptions([
      new StringSelectMenuOptionBuilder().setLabel('All Listings').setValue('ALL'),
      new StringSelectMenuOptionBuilder().setLabel('For Hire').setValue('FH'),
      new StringSelectMenuOptionBuilder().setLabel('Looking For Developers').setValue('LFD'),
      new StringSelectMenuOptionBuilder().setLabel('Assets').setValue('ASSET'),
    ]);

  await dm.send({
    embeds: [buildInfoEmbed('Browse Listings', 'What type of listings would you like to browse?')],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(typeSelect)],
  });
}

export async function handleBrowseTypeSelect(userId: string, type: string): Promise<void> {
  if (!browseClient) return;
  const user = await browseClient.users.fetch(userId);
  const dm = await user.createDM();

  let posts: Post[];
  if (type === 'ALL') {
    posts = await getLivePosts(100);
  } else {
    const all = await getLivePosts(100);
    posts = all.filter((p) => p.post_type === type);
  }

  if (!posts.length) {
    await dm.send({ embeds: [buildInfoEmbed('No Listings', 'There are no active listings right now. Check back soon.')] });
    return;
  }

  browseSessions.set(userId, { posts, index: 0 });
  await sendBrowsePage(user, dm, posts, 0);
}

async function sendBrowsePage(user: User, dm: DMChannel, posts: Post[], index: number): Promise<void> {
  if (!browseClient) return;
  const post = posts[index];
  await incrementPostAnalytic(post.post_id, 'impressions');

  const guild = await browseClient.guilds.fetch(config.servers.main);
  let sellerTag = `<@${post.user_id}>`;
  try {
    const member = await guild.members.fetch(post.user_id);
    sellerTag = `${member.user.tag} (<@${post.user_id}>)`;
  } catch { /* ignore */ }

  let embed: EmbedBuilder;
  if (post.post_type === 'FH') embed = buildFhEmbed(post, sellerTag);
  else if (post.post_type === 'LFD') embed = buildLfdEmbed(post, sellerTag);
  else embed = buildAssetEmbed(post, sellerTag);

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`browse_prev_${post.post_id}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
    new ButtonBuilder().setCustomId(`browse_next_${post.post_id}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(index >= posts.length - 1),
    new ButtonBuilder().setCustomId(`browse_save_${post.post_id}`).setLabel('Save').setStyle(ButtonStyle.Primary),
  );

  const count = new EmbedBuilder()
    .setColor(config.colours.system)
    .setDescription(`-# Listing ${index + 1} of ${posts.length}`)
    .setFooter({ text: 'DevVault' });

  await dm.send({ embeds: [count, embed], components: [nav] });
}

export async function handleBrowseNav(userId: string, postId: string, direction: 'prev' | 'next', interaction: import('discord.js').ButtonInteraction): Promise<void> {
  const session = browseSessions.get(userId);
  if (!session) { await interaction.reply({ embeds: [buildErrorEmbed('Session Expired', 'Your browse session expired. Use `/browse` to start again.')], ephemeral: true }); return; }

  const newIndex = direction === 'next' ? session.index + 1 : session.index - 1;
  if (newIndex < 0 || newIndex >= session.posts.length) { await interaction.deferUpdate(); return; }

  session.index = newIndex;
  browseSessions.set(userId, session);

  if (!browseClient) return;
  const user = await browseClient.users.fetch(userId);
  const dm = await user.createDM();
  await interaction.deferUpdate();
  await sendBrowsePage(user, dm, session.posts, newIndex);
}

export async function handleBrowseSave(userId: string, postId: string, interaction: import('discord.js').ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  await saveListing(userId, postId);
  await incrementPostAnalytic(postId, 'saves');
  await interaction.editReply({ embeds: [buildInfoEmbed('Saved', 'Listing saved. View your saved listings with `/saved`.')] });
}

// ─── SAVED LISTINGS ───────────────────────────────────────────────────────────

export async function startSavedBrowse(user: User, client: Client): Promise<void> {
  browseClient = client;
  const dm = await user.createDM();
  const posts = await getSavedListings(user.id);

  if (!posts.length) {
    await dm.send({ embeds: [buildInfoEmbed('Saved Listings', "You have no saved listings. Browse with `/browse` and save listings you're interested in.")] });
    return;
  }

  browseSessions.set(user.id, { posts, index: 0 });
  await sendSavedPage(user, dm, posts, 0);
}

async function sendSavedPage(user: User, dm: DMChannel, posts: Post[], index: number): Promise<void> {
  if (!browseClient) return;
  const post = posts[index];

  const guild = await browseClient.guilds.fetch(config.servers.main);
  let sellerTag = `<@${post.user_id}>`;
  try {
    const member = await guild.members.fetch(post.user_id);
    sellerTag = `${member.user.tag} (<@${post.user_id}>)`;
  } catch { /* ignore */ }

  let embed: EmbedBuilder;
  if (post.post_type === 'FH') embed = buildFhEmbed(post, sellerTag);
  else if (post.post_type === 'LFD') embed = buildLfdEmbed(post, sellerTag);
  else embed = buildAssetEmbed(post, sellerTag);

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`saved_prev_${post.post_id}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(index === 0),
    new ButtonBuilder().setCustomId(`saved_next_${post.post_id}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(index >= posts.length - 1),
    new ButtonBuilder().setCustomId(`saved_remove_${post.post_id}`).setLabel('Remove').setStyle(ButtonStyle.Danger),
  );

  const count = new EmbedBuilder()
    .setColor(config.colours.system)
    .setDescription(`-# Saved listing ${index + 1} of ${posts.length}`)
    .setFooter({ text: 'DevVault' });

  await dm.send({ embeds: [count, embed], components: [nav] });
}

export async function handleSavedNav(userId: string, postId: string, direction: 'prev' | 'next', interaction: import('discord.js').ButtonInteraction): Promise<void> {
  const session = browseSessions.get(userId);
  if (!session) { await interaction.reply({ embeds: [buildErrorEmbed('Session Expired', 'Use `/saved` to start again.')], ephemeral: true }); return; }

  const newIndex = direction === 'next' ? session.index + 1 : session.index - 1;
  if (newIndex < 0 || newIndex >= session.posts.length) { await interaction.deferUpdate(); return; }

  session.index = newIndex;
  browseSessions.set(userId, session);

  if (!browseClient) return;
  const user = await browseClient.users.fetch(userId);
  const dm = await user.createDM();
  await interaction.deferUpdate();
  await sendSavedPage(user, dm, session.posts, newIndex);
}

export async function handleSavedRemove(userId: string, postId: string, interaction: import('discord.js').ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  await removeSavedListing(userId, postId);

  const session = browseSessions.get(userId);
  if (session) {
    session.posts = session.posts.filter((p) => p.post_id !== postId);
    if (session.index >= session.posts.length) session.index = Math.max(0, session.posts.length - 1);
    browseSessions.set(userId, session);
  }

  await interaction.editReply({ embeds: [buildInfoEmbed('Removed', 'Listing removed from your saved list.')] });
}
