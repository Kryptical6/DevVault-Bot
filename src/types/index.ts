// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface Post {
  post_id: string;
  user_id: string;
  post_type: 'FH' | 'LFD' | 'ASSET';
  category: string;
  title: string;
  description: string | null;
  price: string | null;
  payment_type: string | null;
  payment_methods: string | null;
  portfolio_link: string | null;
  showcase_image_url: string | null;
  tags: string | null;
  sale_mode: 'single' | 'unlimited' | null;
  asset_delivery: string | null;
  payment_link: string | null;
  rates: string | null;
  availability: string | null;
  specialities: string | null;
  status: 'pending' | 'live' | 'archived' | 'deleted' | 'moderated' | 'denied';
  discord_message_id: string | null;
  staff_message_id: string | null;
  created_at: Date;
  approved_at: Date | null;
  archived_at: Date | null;
  expires_at: Date | null;
  repost_available_until: Date | null;
  cooldown_expires_at: Date | null;
  repost_count: number;
  impressions: number;
  clicks: number;
  saves: number;
}

export interface Application {
  application_id: string;
  user_id: string;
  skill_type: string;
  portfolio_link: string;
  status: 'pending' | 'approved' | 'denied' | 'proof_requested' | 'moderated';
  denial_reasons: string[] | null;
  staff_message_id: string | null;
  created_at: Date;
  actioned_at: Date | null;
  actioned_by: string | null;
}

export interface DbUser {
  user_id: string;
  username: string;
  joined_at: Date | null;
  marketplace_muted: boolean;
  marketplace_mute_expires_at: Date | null;
  active_ban: boolean;
  ban_expires_at: Date | null;
  warn_count: number;
  created_at: Date;
}

export interface Ticket {
  ticket_id: string;
  user_id: string;
  ticket_type: 'marketplace' | 'moderation' | 'support';
  channel_id: string;
  status: 'open' | 'closed';
  claimed_by: string | null;
  created_at: Date;
  closed_at: Date | null;
}

export interface ModEntry {
  entry_id: string;
  user_id: string;
  action_type: 'warn' | 'mute' | 'kick' | 'ban' | 'note' | 'marketplace_mute';
  reason: string;
  evidence: string | null;
  duration_days: number | null;
  moderator_id: string;
  moderator_tag: string;
  created_at: Date;
  expires_at: Date | null;
  is_active: boolean;
  removed_early: boolean;
  removed_by: string | null;
  removed_reason: string | null;
}

export interface WorkflowSession {
  user_id: string;
  workflow_type: string;
  step: number;
  data: Record<string, unknown>;
  updated_at: Date;
}

export interface ProofRequest {
  proof_id: string;
  target_id: string;
  target_type: 'post' | 'application';
  proof_type: 'ownership' | 'funds';
  requested_by: string;
  requested_at: Date;
  deadline_at: Date;
  submitted_at: Date | null;
  proof_ref: string | null;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  thread_id: string | null;
  review_message_id: string | null;
}

export interface Suspension {
  suspension_id: string;
  target_id: string;
  target_type: 'post' | 'application';
  suspended_by: string;
  moderation_reason: string;
  evidence: string | null;
  explanation: string;
  outcome: string | null;
  punishment_type: string | null;
  thread_id: string | null;
  created_at: Date;
  resolved_at: Date | null;
}

export interface Purchase {
  purchase_id: string;
  post_id: string;
  buyer_id: string;
  seller_id: string;
  status: 'initiated' | 'proof_submitted' | 'staff_approved' | 'seller_confirmed' | 'delivered' | 'cancelled' | 'disputed';
  proof_ref: string | null;
  created_at: Date;
  delivered_at: Date | null;
}

export interface MpNote {
  note_id: string;
  user_id: string;
  note_text: string;
  added_by: string;
  created_at: Date;
}

export interface FeaturedEntry {
  id: string;
  post_id: string;
  seller_tier: 'standard' | 'trusted';
  queued_at: Date;
  started_at: Date | null;
  expires_at: Date | null;
  featured_message_id: string | null;
  status: 'queued' | 'active' | 'done';
}

export type WorkflowState = Record<string, unknown>;
