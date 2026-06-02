// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — LOGGER
// ─────────────────────────────────────────────────────────────────────────────
import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { config } from '../config/index.js';
import { query } from '../db/index.js';

let logClient: Client | null = null;
export function setLogClient(c: Client): void { logClient = c; }

async function send(channelId: string, embed: EmbedBuilder): Promise<void> {
  if (!logClient) return;
  try {
    const ch = await logClient.channels.fetch(channelId) as TextChannel | null;
    if (ch?.isTextBased()) await ch.send({ embeds: [embed] });
  } catch (e) {
    console.error(`[LOGGER] Failed to send to ${channelId}:`, (e as Error).message);
  }
}

function ts(): string { return `<t:${Math.floor(Date.now() / 1000)}:F>`; }

function base(colour: number, title: string): EmbedBuilder {
  return new EmbedBuilder().setColor(colour).setTitle(title).setTimestamp().setFooter({ text: 'DevVault' });
}

// Post Logs
export async function logPost(opts: {
  action: string; postId: string; userId: string; username: string;
  actionedBy?: string; reason?: string; extra?: string;
}): Promise<void> {
  const e = base(config.colours.system, `Post: ${opts.action}`).addFields([
    { name: 'Post ID', value: opts.postId, inline: true },
    { name: 'User',    value: `${opts.username} (<@${opts.userId}>)`, inline: true },
    { name: 'Time',    value: ts(), inline: true },
  ]);
  if (opts.actionedBy) e.addFields([{ name: 'Actioned By', value: `<@${opts.actionedBy}>`, inline: true }]);
  if (opts.reason)     e.addFields([{ name: 'Reason',      value: opts.reason,              inline: false }]);
  if (opts.extra)      e.addFields([{ name: 'Details',     value: opts.extra,               inline: false }]);
  await send(config.channels.staff.logs.post, e);
}

// Mod Logs
export async function logMod(opts: {
  action: string; targetId: string; targetTag: string;
  moderatorId: string; reason: string; duration?: string; evidence?: string;
}): Promise<void> {
  const e = base(config.colours.moderation, `Mod: ${opts.action}`).addFields([
    { name: 'User',      value: `${opts.targetTag} (<@${opts.targetId}>)`, inline: true },
    { name: 'Moderator', value: `<@${opts.moderatorId}>`,                  inline: true },
    { name: 'Time',      value: ts(),                                       inline: true },
    { name: 'Reason',    value: opts.reason,                                inline: false },
  ]);
  if (opts.duration) e.addFields([{ name: 'Duration', value: opts.duration, inline: true }]);
  if (opts.evidence) e.addFields([{ name: 'Evidence', value: opts.evidence, inline: false }]);
  await send(config.channels.staff.logs.mod, e);
}

// Ticket Logs
export async function logTicket(opts: {
  action: string; ticketId: string; userId: string;
  userTag: string; type: string; staffId?: string; extra?: string;
}): Promise<void> {
  const e = base(config.colours.system, `Ticket: ${opts.action}`).addFields([
    { name: 'Ticket ID', value: opts.ticketId, inline: true },
    { name: 'Type',      value: opts.type,     inline: true },
    { name: 'User',      value: `${opts.userTag} (<@${opts.userId}>)`, inline: true },
    { name: 'Time',      value: ts(), inline: true },
  ]);
  if (opts.staffId) e.addFields([{ name: 'Staff',   value: `<@${opts.staffId}>`, inline: true }]);
  if (opts.extra)   e.addFields([{ name: 'Details', value: opts.extra,           inline: false }]);
  await send(config.channels.staff.logs.ticket, e);
}

// Misc / System Logs
export async function logMisc(eventType: string, detail: string, errorCode?: string): Promise<void> {
  const e = base(0xFF4444, `System: ${eventType}`).addFields([
    { name: 'Detail', value: detail.slice(0, 1000), inline: false },
    { name: 'Time',   value: ts(), inline: true },
  ]);
  if (errorCode) e.addFields([{ name: 'Error Code', value: errorCode, inline: true }]);
  await send(config.channels.staff.logs.misc, e);
  try {
    await query(
      `INSERT INTO audit_log (event_type,detail,error_code) VALUES ($1,$2,$3)`,
      [eventType, detail, errorCode ?? null]
    );
  } catch { /* silent */ }
}
