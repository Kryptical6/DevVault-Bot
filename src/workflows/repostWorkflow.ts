import {
  Client, User,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder
} from 'discord.js';
import { config, skillRoleMap, assetCategoryMap } from '../config/index.js';
import { getUserPosts, getPost, updatePostStatus, setRepostCooldown, isMarketplaceMuted } from '../db/helpers.js';
import { buildFhEmbed, buildLfdEmbed, buildAssetEmbed, buildInfoEmbed, buildErrorEmbed, buildSuccessEmbed } from '../utils/embeds.js';
import { submitPostForReview } from '../systems/reviewSystem.js';
import { logPost } from '../utils/logger.js';

let repostClient: Client | null = null;
export function setRepostClient(client: Client): void { repostClient = client; }

// In-memory: userId -> selectedPostId
const repostSelections = new Map<string, string>();

export async function startRepost(user: User, client: Client): Promise<void> {
  repostClient = client;
  const dm = await user.createDM();

  const guild = await client.guilds.fetch(config.servers.main);
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member || !member.roles.cache.has(config.roles.main.verified)) {
    await dm.send({ embeds: [buildErrorEmbed('Not Verified', 'You need to verify your Roblox account before reposting.')] });
    return;
  }

  if (await isMarketplaceMuted(user.id)) {
    await dm.send({ embeds: [buildErrorEmbed('Marketplace Restricted', 'You are currently restricted from using marketplace features.')] });
    return;
  }

  const archivedPosts = await getUserPosts(user.id, 'archived');
  if (!archivedPosts.length) {
    await dm.send({ embeds: [buildInfoEmbed('No Archived Posts', 'You have no archived posts available to repost.')] });
    return;
  }

  const eligible = archivedPosts.filter((p) => {
    if (!p.cooldown_expires_at) return true;
    return new Date(p.cooldown_expires_at) <= new Date();
  });

  if (!eligible.length) {
    const soonest = archivedPosts.reduce((a, b) => {
      const aTime = a.cooldown_expires_at ? new Date(a.cooldown_expires_at).getTime() : 0;
      const bTime = b.cooldown_expires_at ? new Date(b.cooldown_expires_at).getTime() : 0;
      return aTime < bTime ? a : b;
    });
    const expiryTs = soonest.cooldown_expires_at ? Math.floor(new Date(soonest.cooldown_expires_at).getTime() / 1000) : 0;
    await dm.send({ embeds: [buildInfoEmbed('Cooldown Active', `Your posts are still on cooldown. The earliest you can repost is <t:${expiryTs}:R>.`)] });
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('repost_select')
    .setPlaceholder('Select a post to repost')
    .addOptions(
      eligible.slice(0, 25).map((p) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(p.title.slice(0, 100))
          .setValue(p.post_id)
          .setDescription(`${p.post_type} | ${p.category} | ${p.post_id}`)
      )
    );

  await dm.send({
    embeds: [buildInfoEmbed('Repost', `You have ${eligible.length} post(s) available to repost. Select one below.`)],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}

export async function handleRepostSelect(userId: string, postId: string, interaction: import('discord.js').StringSelectMenuInteraction): Promise<void> {
  if (!repostClient) return;
  const post = await getPost(postId);
  if (!post) { await interaction.reply({ embeds: [buildErrorEmbed('Error', 'Post not found.')], ephemeral: true }); return; }

  repostSelections.set(userId, postId);

  const guild = await repostClient.guilds.fetch(config.servers.main);
  let sellerTag = `<@${userId}>`;
  try {
    const member = await guild.members.fetch(userId);
    sellerTag = `${member.user.tag} (<@${userId}>)`;
  } catch { /* ignore */ }

  let embed: EmbedBuilder;
  if (post.post_type === 'FH') embed = buildFhEmbed(post, sellerTag);
  else if (post.post_type === 'LFD') embed = buildLfdEmbed(post, sellerTag);
  else embed = buildAssetEmbed(post, sellerTag);

  await interaction.update({
    embeds: [buildInfoEmbed('Confirm Repost', "Here's your post. It will go live immediately without going through review again."), embed],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`repost_confirm_${postId}`).setLabel('Confirm Repost').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('repost_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger),
      )
    ],
  });
}

export async function handleRepostConfirm(userId: string, postId: string, interaction: import('discord.js').ButtonInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });
  if (!repostClient) return;

  const post = await getPost(postId);
  if (!post || post.status !== 'archived') {
    await interaction.editReply({ embeds: [buildErrorEmbed('Error', 'This post is no longer available to repost.')] });
    return;
  }

  const guild = await repostClient.guilds.fetch(config.servers.main);
  const member = await guild.members.fetch(userId).catch(() => null);
  const isTrusted = member?.roles.cache.has(config.roles.main.trustedSeller);
  const isSub = member?.roles.cache.has(config.roles.main.marketplaceSubscriber);
  const cooldownMs = isTrusted ? config.cooldowns.trustedSeller : isSub ? config.cooldowns.marketplaceSubscriber : config.cooldowns.verified;
  const cooldownExpires = new Date(Date.now() + cooldownMs);

  const user = await repostClient.users.fetch(userId);
  const sellerTag = `${user.tag} (<@${userId}>)`;

  let publicChannelId: string;
  let embed: EmbedBuilder;
  let buttons: ActionRowBuilder<ButtonBuilder>;

  const { buildFHLFDButtons, buildListingButtons } = await import('../utils/embeds.js');

  if (post.post_type === 'FH') {
    const skill = Object.values(skillRoleMap).find((s) => s.label === post.category);
    publicChannelId = skill?.mainFH || config.channels.main.fh.scripter;
    embed = buildFhEmbed(post, sellerTag);
    buttons = buildFHLFDButtons(post.post_id);
  } else if (post.post_type === 'LFD') {
    const skill = Object.values(skillRoleMap).find((s) => s.label === post.category);
    publicChannelId = skill?.mainLFD || config.channels.main.lfd.scripter;
    embed = buildLfdEmbed(post, sellerTag);
    buttons = buildFHLFDButtons(post.post_id);
  } else {
    const cat = Object.values(assetCategoryMap).find((c) => c.label === post.category);
    publicChannelId = cat?.mainChannel || config.channels.main.assets.systems;
    embed = buildAssetEmbed(post, sellerTag);
    buttons = buildListingButtons(post.post_id);
  }

  const publicChannel = await repostClient.channels.fetch(publicChannelId) as import('discord.js').TextChannel;
  const publicMsg = await publicChannel.send({ embeds: [embed], components: [buttons] });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.postExpiry);

  await updatePostStatus(postId, 'live', {
    discord_message_id: publicMsg.id,
    approved_at: now,
    expires_at: expiresAt,
    repost_available_until: new Date(expiresAt.getTime() + config.postDeletion),
    cooldown_expires_at: cooldownExpires,
  });

  const { schedulePostExpiry } = await import('../systems/reviewSystem.js');
  schedulePostExpiry(postId, userId, publicMsg.id, publicChannelId, config.postExpiry);

  if (post.post_type === 'ASSET') {
    const { addToFeaturedQueue } = await import('../db/helpers.js');
    await addToFeaturedQueue(postId, isTrusted ? 'trusted' : 'standard');
  }

  repostSelections.delete(userId);

  await user.send({ embeds: [buildSuccessEmbed('Post Restored', `Your post is now live again.\n\n-# ${postId}`)] }).catch(() => null);
  await logPost({ action: 'Reposted', postId, userId, username: user.tag });
  await interaction.editReply({ embeds: [buildSuccessEmbed('Reposted', `Your post is now live.`)] });
}

export async function handleRepostCancel(interaction: import('discord.js').ButtonInteraction): Promise<void> {
  repostSelections.delete(interaction.user.id);
  await interaction.update({ embeds: [buildInfoEmbed('Cancelled', 'Repost cancelled.')], components: [] });
}
