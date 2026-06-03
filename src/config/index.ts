// ─────────────────────────────────────────────────────────────────────────────
// DEVVAULT — CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';

export const config = {
  token:      process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || '',
  clientId:   process.env.CLIENT_ID || '',
  databaseUrl: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '',
  serverInvite: process.env.MAIN_SERVER_INVITE || '',

  proofOfFundsThresholdRobux: parseInt(process.env.PROOF_OF_FUNDS_THRESHOLD_ROBUX || '10000'),
  proofOfFundsThresholdUSD:   parseFloat(process.env.PROOF_OF_FUNDS_THRESHOLD_USD  || '50'),

  servers: {
    main:    '1509248976690348303',
    staff:   '1509358346619195413',
    appeals: '1511506974401888459',
  },

  // Permanent invite sent to banned users
  banServerInvite: 'https://discord.gg/errSKMPKmH',

  roles: {
    main: {
      admin:                 '1509295378569363597',
      moderator:             '1509295490871853167',
      marketplaceStaff:      '1509295549264691253',
      verified:              '1509295799123837009',
      buyer:                 '1509297854043389962',
      marketplaceSubscriber: '1509297538140999710',
      trustedSeller:         '1509297031225671963',
      scripter:              '1509296101302206465',
      uiDesigner:            '1509295887015350303',
      builder:               '1509296186715017438',
      animator:              '1509296312338743427',
      vfx:                   '1509305649081614346',
      modeller:              '1509296447135158461',
    },
    staff: {
      admin:            '1509358585627279500',
      moderator:        '1509358643341037578',
      marketplaceStaff: '1509358675318538300',
    },
    appeals: {
      admin: '1511508146693079111',
    },
  },

  channels: {
    main: {
      fh: {
        uiDesigner: '1509305488653946890',
        scripter:   '1509305454809972807',
        modeller:   '1509305512821264504',
        builder:    '1509305536901025792',
        vfx:        '1509305570300133386',
        animator:   '1509305789834072144',
      },
      lfd: {
        uiDesigner: '1509305923720445972',
        scripter:   '1509305903571271680',
        modeller:   '1509305955077193969',
        builder:    '1509305979790168214',
        vfx:        '1509306013831008357',
        animator:   '1509306034416521349',
      },
      assets: {
        gameTemplates:  '1509305240975970515',
        games:          '1509305196553965588',
        systems:        '1509305272391307435',
        modelPacks:     '1509305294520320130',
        uiPacks:        '1509305160613236816',
        animationPacks: '1510685970486267975',
      },
      featured: '1509303881253912706',
    },
    staff: {
      fh: {
        uiDesigner: '1509361386906451999',
        scripter:   '1509361342929178737',
        modeller:   '1509561702188974212',
        builder:    '1509361414119100416',
        vfx:        '1509361462903050400',
        animator:   '1509361444377067612',
      },
      lfd: {
        uiDesigner: '1509361559749525544',
        scripter:   '1509361542271864893',
        modeller:   '1509561892891525130',
        builder:    '1509361586974752858',
        vfx:        '1509361716004261978',
        animator:   '1509361630541254837',
      },
      assets: {
        gameTemplates:  '1509361856643600614',
        games:          '1509362001917382786',
        systems:        '1509361928357679195',
        modelPacks:     '1509361961773830224',
        uiPacks:        '1509361892009709830',
        animationPacks: '1509362037694664815',
      },
      applications:      '1509362277319704676',
      getSellerRequests: '1509362225859661904',
      logs: {
        post:   '1509363498537455758',
        mod:    '1509363518586228736',
        ticket: '1509363936774979655',
        misc:   '1509363667987202068',
      },
    },
    ticketCategories: {
      marketplace: '1509360077356662856',
      moderation:  '1509360430789693541',
      support:     '1509533823891673249',
    },
  },

  // Timings (milliseconds)
  postExpiry:    parseInt(process.env.POST_EXPIRY_HOURS    || '48') * 3_600_000,
  postDeletion:  parseInt(process.env.POST_DELETE_HOURS    || '72') * 3_600_000,
  proofDeadline: parseInt(process.env.PROOF_DEADLINE_HOURS || '48') * 3_600_000,

  cooldowns: {
    verified:              parseInt(process.env.REPOST_COOLDOWN_VERIFIED_HOURS   || '48') * 3_600_000,
    marketplaceSubscriber: parseInt(process.env.REPOST_COOLDOWN_SUBSCRIBER_HOURS || '36') * 3_600_000,
    trustedSeller:         parseInt(process.env.REPOST_COOLDOWN_TRUSTED_HOURS    || '24') * 3_600_000,
  },

  featured: {
    standard:      parseInt(process.env.FEATURED_SLOT_STANDARD_HOURS || '1') * 3_600_000,
    trustedSeller: parseInt(process.env.FEATURED_SLOT_TRUSTED_HOURS  || '2') * 3_600_000,
  },

  // Brighter, more vivid colours
  colours: {
    fh:           0x00E5CC,  // vivid teal
    lfd:          0x7C6AFF,  // vivid indigo
    assets:       0xFFB800,  // vivid amber
    applications: 0xA0B4C8,  // slate
    system:       0x5865F2,  // Discord blurple
    approval:     0x00C853,  // vivid green
    denial:       0xFF3B3B,  // vivid red
    proofRequest: 0xFF7A00,  // vivid orange
    moderation:   0xFF2D55,  // vivid pink-red
  },

  moderationPunishments: [
    { id: 'warning',      label: 'Warning',                      action: 'warn',             durationDays: 0  },
    { id: 'mp_mute_7d',   label: 'Marketplace Mute (7 days)',    action: 'marketplace_mute', durationDays: 7  },
    { id: 'mp_mute_perm', label: 'Marketplace Mute (Permanent)', action: 'marketplace_mute', durationDays: 0  },
    { id: 'ban_30d',      label: 'Temporary Ban (30 days)',       action: 'ban',              durationDays: 30 },
    { id: 'ban_perm',     label: 'Permanent Ban',                 action: 'ban',              durationDays: 0  },
  ],
} as const;

// ─── SKILL ROLE MAPS ──────────────────────────────────────────────────────────

export const skillRoleMap: Record<string, {
  roleId: string; mainFH: string; staffFH: string;
  mainLFD: string; staffLFD: string; label: string;
}> = {
  scripter:   { roleId: config.roles.main.scripter,   mainFH: config.channels.main.fh.scripter,   staffFH: config.channels.staff.fh.scripter,   mainLFD: config.channels.main.lfd.scripter,   staffLFD: config.channels.staff.lfd.scripter,   label: 'Scripter'    },
  uiDesigner: { roleId: config.roles.main.uiDesigner, mainFH: config.channels.main.fh.uiDesigner, staffFH: config.channels.staff.fh.uiDesigner, mainLFD: config.channels.main.lfd.uiDesigner, staffLFD: config.channels.staff.lfd.uiDesigner, label: 'UI Designer' },
  builder:    { roleId: config.roles.main.builder,    mainFH: config.channels.main.fh.builder,    staffFH: config.channels.staff.fh.builder,    mainLFD: config.channels.main.lfd.builder,    staffLFD: config.channels.staff.lfd.builder,    label: 'Builder'     },
  animator:   { roleId: config.roles.main.animator,   mainFH: config.channels.main.fh.animator,   staffFH: config.channels.staff.fh.animator,   mainLFD: config.channels.main.lfd.animator,   staffLFD: config.channels.staff.lfd.animator,   label: 'Animator'    },
  vfx:        { roleId: config.roles.main.vfx,        mainFH: config.channels.main.fh.vfx,        staffFH: config.channels.staff.fh.vfx,        mainLFD: config.channels.main.lfd.vfx,        staffLFD: config.channels.staff.lfd.vfx,        label: 'VFX'         },
  modeller:   { roleId: config.roles.main.modeller,   mainFH: config.channels.main.fh.modeller,   staffFH: config.channels.staff.fh.modeller,   mainLFD: config.channels.main.lfd.modeller,   staffLFD: config.channels.staff.lfd.modeller,   label: 'Modeller'    },
};

export const assetCategoryMap: Record<string, {
  mainChannel: string; staffChannel: string; label: string;
}> = {
  gameTemplates:  { mainChannel: config.channels.main.assets.gameTemplates,  staffChannel: config.channels.staff.assets.gameTemplates,  label: 'Game Templates'  },
  games:          { mainChannel: config.channels.main.assets.games,          staffChannel: config.channels.staff.assets.games,          label: 'Games'           },
  systems:        { mainChannel: config.channels.main.assets.systems,        staffChannel: config.channels.staff.assets.systems,        label: 'Systems'         },
  modelPacks:     { mainChannel: config.channels.main.assets.modelPacks,     staffChannel: config.channels.staff.assets.modelPacks,     label: 'Model Packs'     },
  uiPacks:        { mainChannel: config.channels.main.assets.uiPacks,        staffChannel: config.channels.staff.assets.uiPacks,        label: 'UI Packs'        },
  animationPacks: { mainChannel: config.channels.main.assets.animationPacks, staffChannel: config.channels.staff.assets.animationPacks, label: 'Animation Packs' },
  others:         { mainChannel: config.channels.main.assets.systems,        staffChannel: config.channels.staff.assets.systems,        label: 'Others'          },
};

// ─── DENIAL REASONS ───────────────────────────────────────────────────────────

export interface DenialReason { id: string; label: string; message: string; }

export const DENIAL_REASONS_FH: DenialReason[] = [
  { id: 'insufficient_quality',  label: 'Insufficient Quality',              message: 'This submission does not meet the current quality standards.' },
  { id: 'incomplete_submission', label: 'Incomplete Submission',             message: 'Please ensure all required information and materials are provided.' },
  { id: 'insufficient_showcase', label: 'Insufficient Showcase',             message: 'Please provide sufficient examples showcasing your work or product.' },
  { id: 'ownership_unverified',  label: 'Ownership Cannot Be Verified',      message: 'Ownership of the submitted work could not be verified.' },
  { id: 'unauthorised_content',  label: 'Unauthorised Content',              message: 'Submitted content appears to contain material that cannot be verified as your own work.' },
  { id: 'portfolio_standards',   label: 'Portfolio Does Not Meet Standards', message: 'The submitted portfolio does not currently meet the requirements for this role.' },
  { id: 'skill_level',           label: 'Skill Level Does Not Meet Requirements', message: 'The demonstrated skill level does not currently meet the requirements for this role.' },
  { id: 'portfolio_access',      label: 'Portfolio Access Issue',            message: 'The submitted portfolio could not be accessed or reviewed.' },
  { id: 'policy_violation',      label: 'Marketplace Policy Violation',      message: 'This submission does not comply with marketplace requirements.' },
  { id: 'repeated_submission',   label: 'Repeated Submission',               message: 'This submission is substantially similar to a recently denied submission.' },
  { id: 'verification_not_met',  label: 'Verification Requirement Not Met',  message: 'Additional verification requirements have not been satisfied.' },
  { id: 'other',                 label: 'Other',                             message: '' },
];

export const DENIAL_REASONS_LFD: DenialReason[] = [
  { id: 'incomplete_submission',       label: 'Incomplete Submission',           message: 'Please ensure all required information and materials are provided.' },
  { id: 'insufficient_budget',         label: 'Insufficient Budget Information', message: 'Please provide a clear payment amount and compensation structure.' },
  { id: 'funds_unverified',            label: 'Funds Could Not Be Verified',     message: 'Available funds could not be verified.' },
  { id: 'insufficient_funds_evidence', label: 'Insufficient Funds Evidence',     message: 'The submitted proof of funds was insufficient for verification.' },
  { id: 'unrealistic_compensation',    label: 'Unrealistic Compensation',        message: 'The compensation offered does not reasonably align with the requested work.' },
  { id: 'policy_violation',            label: 'Marketplace Policy Violation',    message: 'This submission does not comply with marketplace requirements.' },
  { id: 'verification_not_met',        label: 'Verification Requirement Not Met', message: 'Additional verification requirements have not been satisfied.' },
  { id: 'other',                       label: 'Other',                           message: '' },
];

export const DENIAL_REASONS_ASSET: DenialReason[] = [
  { id: 'insufficient_quality',            label: 'Insufficient Quality',                      message: 'This submission does not meet the current quality standards.' },
  { id: 'incomplete_submission',           label: 'Incomplete Submission',                     message: 'Please ensure all required information and materials are provided.' },
  { id: 'insufficient_showcase',           label: 'Insufficient Showcase',                     message: 'Please provide sufficient examples showcasing your work or product.' },
  { id: 'ownership_unverified',            label: 'Ownership Cannot Be Verified',              message: 'Ownership of the submitted work could not be verified.' },
  { id: 'insufficient_ownership_evidence', label: 'Insufficient Ownership Evidence',           message: 'The ownership evidence provided was insufficient for verification.' },
  { id: 'unauthorised_content',            label: 'Unauthorised Content',                      message: 'Submitted content appears to contain material that cannot be verified as your own work.' },
  { id: 'asset_standards',                 label: 'Asset Does Not Meet Marketplace Standards', message: 'This asset does not meet the current marketplace quality standards.' },
  { id: 'insufficient_asset_demo',         label: 'Insufficient Asset Demonstration',          message: 'Please provide additional demonstrations of the asset functionality or features.' },
  { id: 'delivery_invalid',                label: 'Asset Delivery Method Invalid',             message: 'The asset delivery method provided could not be verified or accessed.' },
  { id: 'policy_violation',                label: 'Marketplace Policy Violation',              message: 'This submission does not comply with marketplace requirements.' },
  { id: 'verification_not_met',            label: 'Verification Requirement Not Met',          message: 'Additional verification requirements have not been satisfied.' },
  { id: 'other',                           label: 'Other',                                     message: '' },
];

export const DENIAL_REASONS_APP: DenialReason[] = [
  { id: 'insufficient_quality',            label: 'Insufficient Quality',                   message: 'This submission does not meet the current quality standards.' },
  { id: 'incomplete_submission',           label: 'Incomplete Submission',                  message: 'Please ensure all required information and materials are provided.' },
  { id: 'insufficient_showcase',           label: 'Insufficient Showcase',                  message: 'Please provide sufficient examples showcasing your work or product.' },
  { id: 'ownership_unverified',            label: 'Ownership Cannot Be Verified',           message: 'Ownership of the submitted work could not be verified.' },
  { id: 'insufficient_ownership_evidence', label: 'Insufficient Ownership Evidence',        message: 'The ownership evidence provided was insufficient for verification.' },
  { id: 'portfolio_standards',             label: 'Portfolio Does Not Meet Standards',      message: 'The submitted portfolio does not currently meet the requirements for this role.' },
  { id: 'skill_level',                     label: 'Skill Level Does Not Meet Requirements', message: 'The demonstrated skill level does not currently meet the requirements for this role.' },
  { id: 'portfolio_access',                label: 'Portfolio Access Issue',                 message: 'The submitted portfolio could not be accessed or reviewed.' },
  { id: 'verification_not_met',            label: 'Verification Requirement Not Met',       message: 'Additional verification requirements have not been satisfied.' },
  { id: 'other',                           label: 'Other',                                  message: '' },
];

export const MODERATION_REASONS: DenialReason[] = [
  { id: 'ai_generated',        label: 'Suspected AI Generated Content',            message: 'Suspected AI Generated Content' },
  { id: 'stolen_content',      label: 'Suspected Stolen Content',                  message: 'Suspected Stolen Content' },
  { id: 'ownership_dispute',   label: 'Ownership Dispute',                         message: 'Ownership Dispute' },
  { id: 'fraud_concern',       label: 'Fraud Concern',                             message: 'Fraud Concern' },
  { id: 'misrepresentation',   label: 'Misrepresentation',                         message: 'Misrepresentation' },
  { id: 'circumvention',       label: 'Circumvention of Marketplace Requirements', message: 'Circumvention of Marketplace Requirements' },
  { id: 'repeated_violations', label: 'Repeated Rule Violations',                  message: 'Repeated Rule Violations' },
  { id: 'other',               label: 'Other',                                     message: '' },
];

export function getDenialReasons(type: 'FH' | 'LFD' | 'ASSET' | 'APP'): DenialReason[] {
  switch (type) {
    case 'FH':    return DENIAL_REASONS_FH;
    case 'LFD':   return DENIAL_REASONS_LFD;
    case 'ASSET': return DENIAL_REASONS_ASSET;
    case 'APP':   return DENIAL_REASONS_APP;
  }
}

export function formatDenialReasons(
  reasonIds: string[],
  customReason: string | null,
  type: 'FH' | 'LFD' | 'ASSET' | 'APP'
): string {
  const library = getDenialReasons(type);
  const bullets: string[] = [];
  for (const id of reasonIds) {
    if (id === 'other' && customReason) { bullets.push(customReason); continue; }
    const found = library.find(r => r.id === id);
    if (found?.message) bullets.push(found.message);
  }
  return bullets.map(b => `- ${b}`).join('\n');
}
