// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — DATABASE CONNECTION & SCHEMA
// ─────────────────────────────────────────────────────────────────────────────
import { Pool, QueryResult } from 'pg';
import { config } from '../config/index.js';

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on('error', err => console.error('[DB] Pool error:', err.message));

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  const client = await pool.connect();
  try { return await client.query(text, params); }
  finally { client.release(); }
}

export async function initDb(): Promise<void> {
  console.log('[DB] Initialising schema...');

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id                   TEXT PRIMARY KEY,
      username                  TEXT NOT NULL DEFAULT '',
      joined_at                 TIMESTAMPTZ,
      marketplace_muted         BOOLEAN DEFAULT FALSE,
      marketplace_mute_expires_at TIMESTAMPTZ,
      active_ban                BOOLEAN DEFAULT FALSE,
      ban_expires_at            TIMESTAMPTZ,
      warn_count                INT DEFAULT 0,
      created_at                TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS post_sequences (
      type     TEXT PRIMARY KEY,
      last_seq INT  DEFAULT 0
    )`);

  await query(`
    INSERT INTO post_sequences (type, last_seq)
    VALUES ('FH',0),('LFD',0),('ASSET',0),('APP',0)
    ON CONFLICT (type) DO NOTHING`);

  await query(`
    CREATE TABLE IF NOT EXISTS posts (
      post_id              TEXT PRIMARY KEY,
      user_id              TEXT REFERENCES users(user_id),
      post_type            TEXT NOT NULL,
      category             TEXT NOT NULL,
      title                TEXT NOT NULL,
      description          TEXT,
      price                TEXT,
      payment_type         TEXT,
      payment_methods      TEXT,
      portfolio_link       TEXT,
      showcase_image_url   TEXT,
      tags                 TEXT,
      sale_mode            TEXT,
      asset_delivery       TEXT,
      payment_link         TEXT,
      rates                TEXT,
      availability         TEXT,
      specialities         TEXT,
      status               TEXT NOT NULL DEFAULT 'pending',
      discord_message_id   TEXT,
      staff_message_id     TEXT,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      approved_at          TIMESTAMPTZ,
      archived_at          TIMESTAMPTZ,
      expires_at           TIMESTAMPTZ,
      repost_available_until TIMESTAMPTZ,
      cooldown_expires_at  TIMESTAMPTZ,
      repost_count         INT DEFAULT 0,
      impressions          INT DEFAULT 0,
      clicks               INT DEFAULT 0,
      saves                INT DEFAULT 0
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS applications (
      application_id TEXT PRIMARY KEY,
      user_id        TEXT REFERENCES users(user_id),
      skill_type     TEXT NOT NULL,
      portfolio_link TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'pending',
      denial_reasons JSONB,
      staff_message_id TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      actioned_at    TIMESTAMPTZ,
      actioned_by    TEXT
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS tickets (
      ticket_id   TEXT PRIMARY KEY,
      user_id     TEXT REFERENCES users(user_id),
      ticket_type TEXT NOT NULL,
      channel_id  TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'open',
      claimed_by  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      closed_at   TIMESTAMPTZ
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS moderation (
      entry_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       TEXT REFERENCES users(user_id),
      action_type   TEXT NOT NULL,
      reason        TEXT NOT NULL,
      evidence      TEXT,
      duration_days INT,
      moderator_id  TEXT NOT NULL,
      moderator_tag TEXT NOT NULL DEFAULT '',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      expires_at    TIMESTAMPTZ,
      is_active     BOOLEAN DEFAULT TRUE,
      removed_early BOOLEAN DEFAULT FALSE,
      removed_by    TEXT,
      removed_reason TEXT
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS mp_notes (
      note_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    TEXT REFERENCES users(user_id),
      note_text  TEXT NOT NULL,
      added_by   TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS proof_requests (
      proof_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_id        TEXT NOT NULL,
      target_type      TEXT NOT NULL,
      proof_type       TEXT NOT NULL,
      requested_by     TEXT NOT NULL,
      requested_at     TIMESTAMPTZ DEFAULT NOW(),
      deadline_at      TIMESTAMPTZ NOT NULL,
      submitted_at     TIMESTAMPTZ,
      proof_ref        TEXT,
      status           TEXT NOT NULL DEFAULT 'pending',
      thread_id        TEXT,
      review_message_id TEXT
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS suspensions (
      suspension_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_id         TEXT NOT NULL,
      target_type       TEXT NOT NULL,
      suspended_by      TEXT NOT NULL,
      moderation_reason TEXT NOT NULL,
      evidence          TEXT,
      explanation       TEXT NOT NULL,
      outcome           TEXT,
      punishment_type   TEXT,
      thread_id         TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      resolved_at       TIMESTAMPTZ
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS purchases (
      purchase_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id      TEXT REFERENCES posts(post_id),
      buyer_id     TEXT REFERENCES users(user_id),
      seller_id    TEXT REFERENCES users(user_id),
      status       TEXT NOT NULL DEFAULT 'initiated',
      proof_ref    TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      delivered_at TIMESTAMPTZ
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS saved_listings (
      user_id  TEXT REFERENCES users(user_id),
      post_id  TEXT REFERENCES posts(post_id),
      saved_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, post_id)
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS featured_queue (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id            TEXT REFERENCES posts(post_id),
      seller_tier        TEXT NOT NULL DEFAULT 'standard',
      queued_at          TIMESTAMPTZ DEFAULT NOW(),
      started_at         TIMESTAMPTZ,
      expires_at         TIMESTAMPTZ,
      featured_message_id TEXT,
      status             TEXT DEFAULT 'queued'
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS workflow_sessions (
      user_id       TEXT PRIMARY KEY,
      workflow_type TEXT NOT NULL,
      step          INT  NOT NULL DEFAULT 0,
      data          JSONB NOT NULL DEFAULT '{}',
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )`);

  await query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      entry_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type TEXT NOT NULL,
      detail     TEXT,
      error_code TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

  console.log('[DB] Schema ready.');
}

export async function nextPostId(type: 'FH' | 'LFD' | 'ASSET' | 'APP'): Promise<string> {
  const res = await query(
    `UPDATE post_sequences SET last_seq = last_seq + 1 WHERE type = $1 RETURNING last_seq`,
    [type]
  );
  return `${type}-${String(res.rows[0].last_seq).padStart(4, '0')}`;
}
