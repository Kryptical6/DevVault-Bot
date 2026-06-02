// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — DATABASE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
import { query, nextPostId, nextTicketId } from './index.js';
import type { Post, Application, DbUser, Ticket, ModEntry, WorkflowSession, MpNote, Purchase, ProofRequest } from '../types/index.js';
import { config } from '../config/index.js';

// ─── USERS ────────────────────────────────────────────────────────────────────

export async function upsertUser(userId: string, username: string): Promise<void> {
  await query(
    `INSERT INTO users (user_id, username) VALUES ($1,$2)
     ON CONFLICT (user_id) DO UPDATE SET username = $2`,
    [userId, username]
  );
}

export async function getUser(userId: string): Promise<DbUser | null> {
  const r = await query(`SELECT * FROM users WHERE user_id = $1`, [userId]);
  return r.rows[0] ?? null;
}

export async function updateUserMpMute(userId: string, muted: boolean, expiresAt?: Date): Promise<void> {
  await query(
    `UPDATE users SET marketplace_muted = $2, marketplace_mute_expires_at = $3 WHERE user_id = $1`,
    [userId, muted, expiresAt ?? null]
  );
}

export async function updateUserBan(userId: string, banned: boolean, expiresAt?: Date): Promise<void> {
  await query(
    `UPDATE users SET active_ban = $2, ban_expires_at = $3 WHERE user_id = $1`,
    [userId, banned, expiresAt ?? null]
  );
}

export async function incrementWarnCount(userId: string): Promise<void> {
  await query(`UPDATE users SET warn_count = warn_count + 1 WHERE user_id = $1`, [userId]);
}

export async function isMarketplaceMuted(userId: string): Promise<boolean> {
  const r = await query(
    `SELECT marketplace_muted, marketplace_mute_expires_at FROM users WHERE user_id = $1`,
    [userId]
  );
  if (!r.rows[0]) return false;
  const { marketplace_muted, marketplace_mute_expires_at } = r.rows[0];
  if (!marketplace_muted) return false;
  if (marketplace_mute_expires_at && new Date(marketplace_mute_expires_at) < new Date()) {
    await updateUserMpMute(userId, false);
    return false;
  }
  return true;
}

// ─── POSTS ────────────────────────────────────────────────────────────────────

export interface CreatePostData {
  user_id: string;
  post_type: 'FH' | 'LFD' | 'ASSET';
  category: string;
  title: string;
  description?: string;
  price?: string;
  payment_type?: string;
  payment_methods?: string;
  portfolio_link?: string;
  showcase_image_url?: string;
  tags?: string;
  sale_mode?: 'single' | 'unlimited';
  asset_delivery?: string;
  payment_link?: string;
  rates?: string;
  availability?: string;
  specialities?: string;
}

export async function createPost(data: CreatePostData): Promise<Post> {
  const postId = await nextPostId(data.post_type);
  const r = await query(
    `INSERT INTO posts (
       post_id,user_id,post_type,category,title,description,price,
       payment_type,payment_methods,portfolio_link,showcase_image_url,tags,
       sale_mode,asset_delivery,payment_link,rates,availability,specialities,
       status,created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending',NOW())
     RETURNING *`,
    [
      postId, data.user_id, data.post_type, data.category, data.title,
      data.description ?? null, data.price ?? null, data.payment_type ?? null,
      data.payment_methods ?? null, data.portfolio_link ?? null,
      data.showcase_image_url ?? null, data.tags ?? null,
      data.sale_mode ?? null, data.asset_delivery ?? null,
      data.payment_link ?? null, data.rates ?? null,
      data.availability ?? null, data.specialities ?? null,
    ]
  );
  return r.rows[0];
}

export async function getPost(postId: string): Promise<Post | null> {
  const r = await query(`SELECT * FROM posts WHERE post_id = $1`, [postId]);
  return r.rows[0] ?? null;
}

export interface UpdatePostExtras {
  discord_message_id?: string;
  staff_message_id?: string;
  approved_at?: Date;
  archived_at?: Date;
  expires_at?: Date;
  repost_available_until?: Date;
  cooldown_expires_at?: Date;
}

export async function updatePostStatus(postId: string, status: string, extra?: UpdatePostExtras): Promise<void> {
  let sql = `UPDATE posts SET status = $2`;
  const params: unknown[] = [postId, status];
  let i = 3;
  if (extra?.discord_message_id)    { sql += `, discord_message_id = $${i++}`;    params.push(extra.discord_message_id); }
  if (extra?.staff_message_id)      { sql += `, staff_message_id = $${i++}`;      params.push(extra.staff_message_id); }
  if (extra?.approved_at)           { sql += `, approved_at = $${i++}`;           params.push(extra.approved_at); }
  if (extra?.archived_at)           { sql += `, archived_at = $${i++}`;           params.push(extra.archived_at); }
  if (extra?.expires_at)            { sql += `, expires_at = $${i++}`;            params.push(extra.expires_at); }
  if (extra?.repost_available_until){ sql += `, repost_available_until = $${i++}`; params.push(extra.repost_available_until); }
  if (extra?.cooldown_expires_at)   { sql += `, cooldown_expires_at = $${i++}`;   params.push(extra.cooldown_expires_at); }
  sql += ` WHERE post_id = $1`;
  await query(sql, params);
}

export async function getUserPosts(userId: string, status?: string): Promise<Post[]> {
  if (status) {
    const r = await query(`SELECT * FROM posts WHERE user_id=$1 AND status=$2 ORDER BY created_at DESC`, [userId, status]);
    return r.rows;
  }
  const r = await query(`SELECT * FROM posts WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
  return r.rows;
}

export async function getLivePosts(limit = 50): Promise<Post[]> {
  const r = await query(`SELECT * FROM posts WHERE status='live' ORDER BY approved_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

export async function getUserPostHistory(userId: string): Promise<string> {
  const r = await query(
    `SELECT post_type, status, COUNT(*) cnt FROM posts WHERE user_id=$1 GROUP BY post_type,status`,
    [userId]
  );
  if (!r.rows.length) return 'No previous posts';
  return r.rows.map((row: { post_type: string; status: string; cnt: string }) => `${row.post_type} ${row.status}: ${row.cnt}`).join(', ');
}

export async function incrementPostAnalytic(postId: string, field: 'impressions' | 'clicks' | 'saves'): Promise<void> {
  await query(`UPDATE posts SET ${field} = ${field} + 1 WHERE post_id = $1`, [postId]);
}

export async function setRepostCooldown(postId: string, expiresAt: Date): Promise<void> {
  await query(`UPDATE posts SET cooldown_expires_at = $2 WHERE post_id = $1`, [postId, expiresAt]);
}

export async function getUserAnalyticsData(userId: string): Promise<{
  post_id: string; title: string; impressions: number;
  clicks: number; saves: number; purchases: number;
}[]> {
  const r = await query(
    `SELECT post_id, title, impressions, clicks, saves,
     (SELECT COUNT(*) FROM purchases WHERE purchases.post_id = posts.post_id AND status='delivered')::int AS purchases
     FROM posts WHERE user_id=$1 AND status IN ('live','archived')
     ORDER BY approved_at DESC`,
    [userId]
  );
  return r.rows;
}

// ─── APPLICATIONS ─────────────────────────────────────────────────────────────

export async function createApplication(userId: string, skillType: string, portfolioLink: string): Promise<Application> {
  const appId = await nextPostId('APP');
  const r = await query(
    `INSERT INTO applications (application_id,user_id,skill_type,portfolio_link,status,created_at)
     VALUES ($1,$2,$3,$4,'pending',NOW()) RETURNING *`,
    [appId, userId, skillType, portfolioLink]
  );
  return r.rows[0];
}

export async function getApplication(appId: string): Promise<Application | null> {
  const r = await query(`SELECT * FROM applications WHERE application_id=$1`, [appId]);
  return r.rows[0] ?? null;
}

export async function updateApplicationStatus(
  appId: string,
  status: string,
  extra?: { actioned_by?: string; actioned_at?: Date; denial_reasons?: string[]; staff_message_id?: string }
): Promise<void> {
  let sql = `UPDATE applications SET status=$2`;
  const params: unknown[] = [appId, status];
  let i = 3;
  if (extra?.actioned_by)     { sql += `, actioned_by=$${i++}`;     params.push(extra.actioned_by); }
  if (extra?.actioned_at)     { sql += `, actioned_at=$${i++}`;     params.push(extra.actioned_at); }
  if (extra?.denial_reasons)  { sql += `, denial_reasons=$${i++}`;  params.push(JSON.stringify(extra.denial_reasons)); }
  if (extra?.staff_message_id){ sql += `, staff_message_id=$${i++}`; params.push(extra.staff_message_id); }
  sql += ` WHERE application_id=$1`;
  await query(sql, params);
}

export async function getUserApplicationHistory(userId: string): Promise<string> {
  const r = await query(
    `SELECT status, COUNT(*) cnt FROM applications WHERE user_id=$1 GROUP BY status`,
    [userId]
  );
  if (!r.rows.length) return 'No previous applications';
  return r.rows.map((row: { status: string; cnt: string }) => `${row.status}: ${row.cnt}`).join(', ');
}

// ─── TICKETS ─────────────────────────────────────────────────────────────────

export async function createTicket(userId: string, ticketType: string, channelId: string): Promise<Ticket> {
  const ticketId = await nextTicketId();
  const r = await query(
    `INSERT INTO tickets (ticket_id,user_id,ticket_type,channel_id,status,created_at)
     VALUES ($1,$2,$3,$4,'open',NOW()) RETURNING *`,
    [ticketId, userId, ticketType, channelId]
  );
  return r.rows[0];
}

export async function logTicketMessage(data: {
  ticketId: string; senderId: string; senderTag: string;
  direction: 'user' | 'staff'; content: string; attachments?: string[];
}): Promise<void> {
  await query(
    `INSERT INTO ticket_messages (ticket_id,sender_id,sender_tag,direction,content,attachments)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [data.ticketId, data.senderId, data.senderTag, data.direction,
     data.content, JSON.stringify(data.attachments ?? [])]
  );
}

export async function getTicketMessages(ticketId: string): Promise<{
  sender_tag: string; direction: string; content: string;
  attachments: string[]; sent_at: Date;
}[]> {
  const r = await query(
    `SELECT sender_tag, direction, content, attachments, sent_at
     FROM ticket_messages WHERE ticket_id=$1 ORDER BY sent_at ASC`,
    [ticketId]
  );
  return r.rows.map(row => ({ ...row, attachments: row.attachments ?? [] }));
}

export function buildTicketTranscriptHtml(
  ticketId: string, userTag: string, type: string,
  messages: { sender_tag: string; direction: string; content: string; attachments: string[]; sent_at: Date }[]
): string {
  const rows = messages.map(m => {
    const time = new Date(m.sent_at).toLocaleString('en-GB', { timeZone: 'UTC' });
    const side = m.direction === 'user' ? 'user' : 'staff';
    const attachLinks = (m.attachments as string[])
      .map((a: string) => `<a href="${a}" target="_blank">Attachment</a>`).join(' ');
    const safeContent = m.content
      ? m.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      : '<em>no text</em>';
    return [
      `<div class="msg ${side}">`,
      `  <span class="meta">${m.sender_tag} &bull; ${time}</span>`,
      `  <p>${safeContent}</p>`,
      attachLinks ? `  <div class="attachments">${attachLinks}</div>` : '',
      `</div>`,
    ].filter(Boolean).join('\n');
  }).join('\n');

  return [
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">',
    `<title>Ticket ${ticketId}</title>`,
    '<style>',
    '  body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;background:#0f172a;color:#e2e8f0;padding:20px}',
    '  h1{color:#94a3b8;font-size:1.1rem;margin-bottom:4px}',
    '  .meta-bar{color:#64748b;font-size:.85rem;margin-bottom:24px}',
    '  .msg{margin-bottom:16px;padding:12px 16px;border-radius:8px;max-width:90%}',
    '  .user{background:#1e293b;margin-right:auto}',
    '  .staff{background:#1e3a5f;margin-left:auto}',
    '  .meta{font-size:.75rem;color:#94a3b8;display:block;margin-bottom:4px}',
    '  p{margin:0;white-space:pre-wrap;word-break:break-word}',
    '  .attachments{margin-top:6px;font-size:.8rem}',
    '  .attachments a{color:#60a5fa}',
    '</style></head><body>',
    '<h1>DevVault Ticket Transcript</h1>',
    `<div class="meta-bar">${ticketId} &bull; ${type} &bull; ${userTag} &bull; Closed ${new Date().toUTCString()}</div>`,
    rows,
    '</body></html>',
  ].join('\n');
}

export async function getTicket(ticketId: string): Promise<Ticket | null> {
  const r = await query(`SELECT * FROM tickets WHERE ticket_id=$1`, [ticketId]);
  return r.rows[0] ?? null;
}

export async function getTicketByChannel(channelId: string): Promise<Ticket | null> {
  const r = await query(`SELECT * FROM tickets WHERE channel_id=$1 AND status='open'`, [channelId]);
  return r.rows[0] ?? null;
}

export async function getOpenTicketByUser(userId: string): Promise<Ticket | null> {
  const r = await query(`SELECT * FROM tickets WHERE user_id=$1 AND status='open' LIMIT 1`, [userId]);
  return r.rows[0] ?? null;
}

export async function updateTicket(
  ticketId: string,
  updates: { status?: string; claimed_by?: string; closed_at?: Date; channel_id?: string }
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [ticketId];
  let i = 2;
  if (updates.status)     { sets.push(`status=$${i++}`);     params.push(updates.status); }
  if (updates.claimed_by) { sets.push(`claimed_by=$${i++}`); params.push(updates.claimed_by); }
  if (updates.closed_at)  { sets.push(`closed_at=$${i++}`);  params.push(updates.closed_at); }
  if (updates.channel_id) { sets.push(`channel_id=$${i++}`); params.push(updates.channel_id); }
  if (!sets.length) return;
  await query(`UPDATE tickets SET ${sets.join(',')} WHERE ticket_id=$1`, params);
}

// ─── MODERATION ───────────────────────────────────────────────────────────────

export async function createModEntry(data: {
  userId: string; actionType: string; reason: string;
  evidence?: string; durationDays?: number;
  moderatorId: string; moderatorTag: string; expiresAt?: Date;
}): Promise<ModEntry> {
  const r = await query(
    `INSERT INTO moderation
     (user_id,action_type,reason,evidence,duration_days,moderator_id,moderator_tag,expires_at,is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE) RETURNING *`,
    [data.userId, data.actionType, data.reason, data.evidence ?? null,
     data.durationDays ?? null, data.moderatorId, data.moderatorTag, data.expiresAt ?? null]
  );
  return r.rows[0];
}

export async function getModHistory(userId: string): Promise<ModEntry[]> {
  const r = await query(`SELECT * FROM moderation WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
  return r.rows;
}

export async function getActiveModEntries(userId: string): Promise<ModEntry[]> {
  const r = await query(
    `SELECT * FROM moderation WHERE user_id=$1 AND is_active=TRUE
     AND (expires_at IS NULL OR expires_at > NOW()) AND removed_early=FALSE`,
    [userId]
  );
  return r.rows;
}

export async function deactivateModEntry(entryId: string, removedBy: string, removedReason: string): Promise<void> {
  await query(
    `UPDATE moderation SET is_active=FALSE,removed_early=TRUE,removed_by=$2,removed_reason=$3
     WHERE entry_id=$1`,
    [entryId, removedBy, removedReason]
  );
}

// ─── MP NOTES ────────────────────────────────────────────────────────────────

export async function addMpNote(userId: string, noteText: string, addedBy: string): Promise<void> {
  await query(`INSERT INTO mp_notes (user_id,note_text,added_by) VALUES ($1,$2,$3)`, [userId, noteText, addedBy]);
}

export async function getMpNotes(userId: string): Promise<MpNote[]> {
  const r = await query(`SELECT * FROM mp_notes WHERE user_id=$1 ORDER BY created_at DESC LIMIT 5`, [userId]);
  return r.rows;
}

// ─── WORKFLOW SESSIONS ────────────────────────────────────────────────────────

export async function saveSession(userId: string, workflowType: string, step: number, data: Record<string, unknown>): Promise<void> {
  await query(
    `INSERT INTO workflow_sessions (user_id,workflow_type,step,data,updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (user_id) DO UPDATE SET workflow_type=$2,step=$3,data=$4,updated_at=NOW()`,
    [userId, workflowType, step, JSON.stringify(data)]
  );
}

export async function getSession(userId: string): Promise<WorkflowSession | null> {
  const r = await query(`SELECT * FROM workflow_sessions WHERE user_id=$1`, [userId]);
  return r.rows[0] ?? null;
}

export async function updateSession(userId: string, step: number, data: Record<string, unknown>): Promise<void> {
  await query(
    `UPDATE workflow_sessions SET step=$2,data=$3,updated_at=NOW() WHERE user_id=$1`,
    [userId, step, JSON.stringify(data)]
  );
}

export async function clearSession(userId: string): Promise<void> {
  await query(`DELETE FROM workflow_sessions WHERE user_id=$1`, [userId]);
}

export async function hasActiveSession(userId: string): Promise<boolean> {
  const r = await query(`SELECT user_id FROM workflow_sessions WHERE user_id=$1`, [userId]);
  return r.rows.length > 0;
}

export async function createSession(userId: string, workflowType: string): Promise<void> {
  await saveSession(userId, workflowType, 0, {});
}

// ─── SAVED LISTINGS ───────────────────────────────────────────────────────────

export async function saveListing(userId: string, postId: string): Promise<void> {
  await query(`INSERT INTO saved_listings (user_id,post_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, postId]);
}

export async function removeSavedListing(userId: string, postId: string): Promise<void> {
  await query(`DELETE FROM saved_listings WHERE user_id=$1 AND post_id=$2`, [userId, postId]);
}

export async function getSavedListings(userId: string): Promise<Post[]> {
  const r = await query(
    `SELECT p.* FROM posts p JOIN saved_listings s ON p.post_id=s.post_id
     WHERE s.user_id=$1 AND p.status='live' ORDER BY s.saved_at DESC`,
    [userId]
  );
  return r.rows;
}

// ─── PROOF REQUESTS ───────────────────────────────────────────────────────────

export async function createProofRequest(data: {
  targetId: string; targetType: 'post' | 'application';
  proofType: 'ownership' | 'funds'; requestedBy: string;
  threadId?: string; reviewMessageId?: string;
}): Promise<ProofRequest> {
  const deadlineAt = new Date(Date.now() + config.proofDeadline);
  const r = await query(
    `INSERT INTO proof_requests
     (target_id,target_type,proof_type,requested_by,deadline_at,thread_id,review_message_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [data.targetId, data.targetType, data.proofType, data.requestedBy,
     deadlineAt, data.threadId ?? null, data.reviewMessageId ?? null]
  );
  return r.rows[0];
}

export async function getProofRequest(targetId: string): Promise<ProofRequest | null> {
  const r = await query(
    `SELECT * FROM proof_requests WHERE target_id=$1 AND status='pending'
     ORDER BY requested_at DESC LIMIT 1`,
    [targetId]
  );
  return r.rows[0] ?? null;
}

export async function updateProofRequest(
  proofId: string,
  updates: { status?: string; submitted_at?: Date; proof_ref?: string }
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [proofId];
  let i = 2;
  if (updates.status)       { sets.push(`status=$${i++}`);       params.push(updates.status); }
  if (updates.submitted_at) { sets.push(`submitted_at=$${i++}`); params.push(updates.submitted_at); }
  if (updates.proof_ref)    { sets.push(`proof_ref=$${i++}`);    params.push(updates.proof_ref); }
  if (!sets.length) return;
  await query(`UPDATE proof_requests SET ${sets.join(',')} WHERE proof_id=$1`, params);
}

// ─── PURCHASES ────────────────────────────────────────────────────────────────

export async function createPurchase(postId: string, buyerId: string, sellerId: string): Promise<Purchase> {
  const r = await query(
    `INSERT INTO purchases (post_id,buyer_id,seller_id,status) VALUES ($1,$2,$3,'initiated') RETURNING *`,
    [postId, buyerId, sellerId]
  );
  return r.rows[0];
}

export async function getPurchase(purchaseId: string): Promise<Purchase | null> {
  const r = await query(`SELECT * FROM purchases WHERE purchase_id=$1`, [purchaseId]);
  return r.rows[0] ?? null;
}

export async function updatePurchase(
  purchaseId: string,
  updates: { status?: string; proof_ref?: string; delivered_at?: Date }
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [purchaseId];
  let i = 2;
  if (updates.status)       { sets.push(`status=$${i++}`);       params.push(updates.status); }
  if (updates.proof_ref)    { sets.push(`proof_ref=$${i++}`);    params.push(updates.proof_ref); }
  if (updates.delivered_at) { sets.push(`delivered_at=$${i++}`); params.push(updates.delivered_at); }
  if (!sets.length) return;
  await query(`UPDATE purchases SET ${sets.join(',')} WHERE purchase_id=$1`, params);
}

// ─── FEATURED QUEUE ───────────────────────────────────────────────────────────

export async function addToFeaturedQueue(postId: string, sellerTier: 'standard' | 'trusted'): Promise<void> {
  const existing = await query(`SELECT id FROM featured_queue WHERE post_id=$1 AND status='queued'`, [postId]);
  if (existing.rows.length) return;
  await query(`INSERT INTO featured_queue (post_id,seller_tier,queued_at) VALUES ($1,$2,NOW())`, [postId, sellerTier]);
}

export async function getNextFeatured(): Promise<{ id: string; post_id: string; seller_tier: string } | null> {
  const r = await query(
    `SELECT * FROM featured_queue WHERE status='queued'
     ORDER BY CASE WHEN seller_tier='trusted' THEN 0 ELSE 1 END, queued_at ASC LIMIT 1`
  );
  return r.rows[0] ?? null;
}

export async function getActiveFeatured(): Promise<{
  id: string; post_id: string; seller_tier: string;
  featured_message_id: string; expires_at: Date;
} | null> {
  const r = await query(`SELECT * FROM featured_queue WHERE status='active' LIMIT 1`);
  return r.rows[0] ?? null;
}

export async function setFeaturedActive(id: string, messageId: string, expiresAt: Date): Promise<void> {
  await query(
    `UPDATE featured_queue SET status='active',started_at=NOW(),expires_at=$2,featured_message_id=$3 WHERE id=$1`,
    [id, expiresAt, messageId]
  );
}

export async function markFeaturedDone(id: string): Promise<void> {
  await query(`UPDATE featured_queue SET status='done' WHERE id=$1`, [id]);
}
