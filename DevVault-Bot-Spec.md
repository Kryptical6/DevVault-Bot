# DEV VAULT — COMPLETE TECHNICAL SPECIFICATION
Version 2.1 — Master Build Document (Post-Revision)

---

# TABLE OF CONTENTS

1. Platform Overview
2. Infrastructure & Stack
3. Server Architecture
4. Role System
5. Channel Architecture
6. Command List
7. Embed Design System
8. Post ID System
9. Denial Reason Library
10. Posting System
11. Review System
12. Proof Systems
13. Moderate (Investigation) System
14. Browsing System
15. Featured Listings System
16. Asset Purchase System
17. Application System
18. Seller Access System (/get-seller)
19. Ticket System
20. Moderation System
21. Logging System
22. Analytics System
23. Audit System
24. Notification System
25. Post Lifecycle
26. Repost System
27. Saved Listings
28. Featured Rotation Logic
29. Database Schema Overview
30. Configuration File Reference

---

# 1. PLATFORM OVERVIEW

Dev Vault is a Discord-native Roblox development marketplace ecosystem.

Core goals:
- Structured listings with zero channel flooding
- Backend review pipelines for every post
- Proof verification for anti-fraud
- Subscription-gated seller access via Patreon
- Trust/reputation system via Trusted Seller role
- Intelligent browsing via DM carousel system
- Full moderation tooling with logging and accountability

Discord is the interface layer only.
The real system is powered by the bot, PostgreSQL database, and automated workflow engine.

---

# 2. INFRASTRUCTURE & STACK

## Bot
- Runtime: Node.js
- Language: TypeScript
- Library: Discord.js
- Hosting: Railway (continuous, auto-restart, env vars)

## Database
- Neon PostgreSQL
- Stores: users, posts, tickets, applications, subscriptions, moderation history, analytics, transactions, cooldowns, audit logs, saved listings, mp-notes, suspensions, asset delivery files/refs

## Patreon Integration
- Patreon bot already installed in main server
- Patreon bot assigns/removes Marketplace Subscriber role automatically
- Dev Vault bot reads role state from Discord only — no direct Patreon API integration
- /get-seller exists as a fallback only when Patreon fails

## Bloxlink
- Already installed and operational in main server
- Bot checks for Verified role — does not handle /verify itself

---

# 3. SERVER ARCHITECTURE

## 3.1 MAIN SERVER (PUBLIC)
ID: 1509248976690348303

Public-facing platform. Users browse, post, purchase, socialise, open tickets, use commands.
Must remain visually clean. No backend review clutter.

## 3.2 STAFF SERVER (BACKEND)
ID: 1509358346619195413

Private operational backend. All reviews, investigations, proofs, logs, analytics, moderation pipelines live here.
Never accessible to public users.

---

# 4. ROLE SYSTEM

## 4.1 MAIN SERVER ROLES

| Role | ID | Purpose |
|---|---|---|
| Admin | 1509295378569363597 | Full system access |
| Moderator | 1509295490871853167 | Server moderation |
| Marketplace Staff | 1509295549264691253 | Listing reviews + proof verification |
| Verified | 1509295799123837009 | Bloxlink verification (base trust layer) |
| Buyer | 1509297854043389962 | Default user state |
| Marketplace Subscriber | 1509297538140999710 | Patreon-gated — unlocks asset posting |
| Trusted Seller | 1509297031225671963 | Reputation-based elevated trust |
| Scripter | 1509296101302206465 | Skill role |
| UI Designer | 1509295887015350303 | Skill role |
| Builder | 1509296186715017438 | Skill role |
| Animator | 1509296312338743427 | Skill role |
| VFX | 1509305649081614346 | Skill role |
| Modeller | 1509296447135158461 | Skill role |

NOTE: There is NO separate Seller role. Asset posting is gated by Marketplace Subscriber only.

## 4.2 STAFF SERVER ROLES

| Role | ID |
|---|---|
| Admin | 1509358585627279500 |
| Moderator | 1509358643341037578 |
| Marketplace Staff | 1509358675318538300 |

## 4.3 ROLE HIERARCHY & ACCESS RULES

- Verified: required to use /post, /apply, /browse, /ticket, /repost, /saved, /mylogs
- Buyer: default state, can browse and purchase
- Marketplace Subscriber: required for /post Assets flow. Assigned by Patreon bot. Removed on subscription expiry.
- Skill Role: required for /post FH flow. Obtained via /apply.
- Trusted Seller: manually granted by Admin via /grant-trusted-seller. Requirements: Marketplace Subscriber + at least one Skill Role + no active severe punishments.
- Marketplace mute: DB flag. Blocks all marketplace commands (/post, /repost, /browse buy actions). No Discord-side action.
- Server ban: Discord ban. Bot DMs invite link when duration expires.

---

# 5. CHANNEL ARCHITECTURE

## 5.1 MAIN SERVER — LISTING CHANNELS

| Channel | ID |
|---|---|
| For Hire — UI Designer | 1509305488653946890 |
| For Hire — Scripter | 1509305454809972807 |
| For Hire — Modeller | 1509305512821264504 |
| For Hire — Builder | 1509305536901025792 |
| For Hire — VFX | 1509305570300133386 |
| For Hire — Animator | 1509305789834072144 |
| LFD — UI Designer | 1509305923720445972 |
| LFD — Scripter | 1509305903571271680 |
| LFD — Modeller | 1509305955077193969 |
| LFD — Builder | 1509305979790168214 |
| LFD — VFX | 1509306013831008357 |
| LFD — Animator | 1509306034416521349 |
| Assets — Game Templates | 1509305240975970515 |
| Assets — Games | 1509305196553965588 |
| Assets — Systems | 1509305272391307435 |
| Assets — Model Packs | 1509305294520320130 |
| Assets — UI Packs | 1509305160613236816 |
| Assets — Animation Packs | 1510685970486267975 |
| Featured Listings | 1509303881253912706 |

## 5.2 STAFF SERVER — REVIEW CHANNELS

| Channel | ID |
|---|---|
| FH — UI Designer Reviews | 1509361386906451999 |
| FH — Scripter Reviews | 1509361342929178737 |
| FH — Modeller Reviews | 1509561702188974212 |
| FH — Builder Reviews | 1509361414119100416 |
| FH — VFX Reviews | 1509361462903050400 |
| FH — Animator Reviews | 1509361444377067612 |
| LFD — UI Designer Reviews | 1509361559749525544 |
| LFD — Scripter Reviews | 1509361542271864893 |
| LFD — Modeller Reviews | 1509561892891525130 |
| LFD — Builder Reviews | 1509361586974752858 |
| LFD — VFX Reviews | 1509361716004261978 |
| LFD — Animator Reviews | 1509361630541254837 |
| Assets — Game Templates Reviews | 1509361856643600614 |
| Assets — Games Reviews | 1509362001917382786 |
| Assets — Systems Reviews | 1509361928357679195 |
| Assets — Model Packs Reviews | 1509361961773830224 |
| Assets — UI Packs Reviews | 1509361892009709830 |
| Assets — Animation Packs Reviews | 1509362037694664815 |
| Applications | 1509362277319704676 |
| Get-Seller Requests | 1509362225859661904 |

## 5.3 STAFF SERVER — LOG & ADMIN CHANNELS

| Channel | ID |
|---|---|
| Post Logs | 1509363498537455758 |
| Mod Logs | 1509363518586228736 |
| Ticket Logs | 1509363936774979655 |
| Misc Logs | 1509363667987202068 |

## 5.4 STAFF SERVER — TICKET CATEGORIES

| Category | ID |
|---|---|
| Marketplace Tickets | 1509360077356662856 |
| Moderation Tickets | 1509360430789693541 |
| Support Tickets | 1509533823891673249 |

---

# 6. COMMAND LIST

## 6.1 USER COMMANDS (Main Server + DMs)

| Command | Access | Description |
|---|---|---|
| /post | Verified | Opens DM posting workflow |
| /repost | Verified + archived posts exist | Archived post selector → repost flow |
| /browse | Verified | Opens DM carousel browsing |
| /apply | Verified | Opens skill role application workflow in DM |
| /ticket | Verified | Opens ticket type selector |
| /get-seller | Verified | Fallback for Patreon role assignment failures |
| /analytics | Marketplace Subscriber | View own post analytics in DM |
| /saved | Verified | View saved listings in DM carousel |
| /mylogs | Verified | View own moderation history (moderator names hidden) |

## 6.2 STAFF COMMANDS

| Command | Access | Description |
|---|---|---|
| /warn | Moderator+ | Issue a warning |
| /mute | Moderator+ | Discord timeout a user |
| /kick | Moderator+ | Kick a user |
| /ban | Moderator+ | Ban a user for a set duration |
| /note | Moderator+ | Add internal note to a user |
| /unmute | Moderator+ | Remove mute early (reason required, logged) |
| /unban | Moderator+ | Remove ban early (reason required, logged) |
| /mod-logs | Moderator+ | View full moderation history for a user |
| /mp-notes | Marketplace Staff+ | Add marketplace notes to a user |
| /grant-trusted-seller | Admin+ | Manually grant Trusted Seller role |
| /audit-log | Admin+ | View system health, API failures, diagnostics |

---

# 7. EMBED DESIGN SYSTEM

## 7.1 UNIFIED STRUCTURE

All public post embeds share one unified structure. No different layouts per system.

### Header
- Post ID (e.g. FH-0001)
- Category / Specialisation

### Body
- Title
- Description
- Pricing / Rate / Budget

### Metadata
- Tags
- Seller (username + mention)
- Payment methods
- Timestamp

### Footer
- "Dev Vault" branding

## 7.2 COLOUR CODING BY TYPE

| Post Type | Colour | Hex |
|---|---|---|
| For Hire (FH) | Teal | #2DD4BF |
| Looking For Developers (LFD) | Indigo | #818CF8 |
| Assets | Amber | #FBBF24 |
| Applications | Slate | #94A3B8 |
| System / Bot Messages | Dark grey | #1E293B |
| Approval notices | Green | #22C55E |
| Denial notices | Red | #EF4444 |
| Proof requests | Orange | #F97316 |
| Moderation notices | Red-orange | #F43F5E |

## 7.3 REVIEW EMBED STRUCTURE (STAFF SERVER)

Clean, not overwhelming. Fields shown per review:

- Post ID
- Post Type + Category
- Title
- Full post content (all submitted fields)
- Showcase image (if provided)
- Seller mention + username
- Account age
- Previous post count + outcomes
- Active moderation flags (warns, active mutes, marketplace mutes)
- MP Notes (from /mp-notes)
- Submission timestamp

---

# 8. POST ID SYSTEM

## 8.1 FORMAT

| Type | Format | Example |
|---|---|---|
| For Hire | FH-XXXX | FH-0001 |
| Looking For Developers | LFD-XXXX | LFD-0001 |
| Assets | ASSET-XXXX | ASSET-0001 |
| Applications | APP-XXXX | APP-0001 |

Sequential numbering per type. Never reused, even after deletion.

## 8.2 VISIBILITY

Post IDs appear in:
- Public listing embeds
- Review embeds (staff server)
- All log entries
- All DM notifications to users
- Analytics
- Ticket references

---

# 9. DENIAL REASON LIBRARY

## 9.1 SYSTEM BEHAVIOUR

- Staff select from a filtered subset based on post type
- Multiple reasons can be selected
- Formatted as a bullet list in DM to user
- "Other" option always available, requires modal with custom explanation
- "Special Reason" option is staff-only and never shown in user-facing DMs

## 9.2 DISPLAY FORMAT (USER DM)

```
Your submission could not be approved.

Reasons:
• [Reason 1]
• [Reason 2]

Reference ID: FH-0001
```

Never use "Reason 1:", "Reason 2:" format.

## 9.3 FILTERED REASON SETS BY TYPE

### FH POST DENIALS
- Insufficient Quality — This submission does not meet the current quality standards.
- Incomplete Submission — Please ensure all required information and materials are provided.
- Insufficient Showcase — Please provide sufficient examples showcasing your work or product.
- Insufficient Information — Please provide additional information so the submission can be properly reviewed.
- Ownership Cannot Be Verified — Ownership of the submitted work could not be verified.
- Unauthorised Content — Submitted content appears to contain material that cannot be verified as your own work.
- Third-Party Content — This submission contains content that may belong to a third party.
- Portfolio Does Not Meet Standards — The submitted portfolio does not currently meet the requirements for this role.
- Skill Level Does Not Meet Requirements — The demonstrated skill level does not currently meet the requirements for this role.
- Portfolio Access Issue — The submitted portfolio could not be accessed or reviewed.
- Marketplace Policy Violation — This submission does not comply with marketplace requirements.
- Repeated Submission — This submission is substantially similar to a recently denied submission.
- Verification Requirement Not Met — Additional verification requirements have not been satisfied.
- Other — (requires modal, custom explanation)

### LFD POST DENIALS
- Incomplete Submission
- Insufficient Information
- Insufficient Budget Information — Please provide a clear payment amount and compensation structure.
- Funds Could Not Be Verified — Available funds could not be verified.
- Insufficient Funds Evidence — The submitted proof of funds was insufficient for verification.
- Unrealistic Compensation — The compensation offered does not reasonably align with the requested work.
- Marketplace Policy Violation
- Repeated Submission
- Verification Requirement Not Met
- Other — (requires modal)

### ASSET POST DENIALS
- Insufficient Quality
- Incomplete Submission
- Insufficient Showcase
- Insufficient Information
- Ownership Cannot Be Verified
- Insufficient Ownership Evidence — The ownership evidence provided was insufficient for verification.
- Unauthorised Content
- Third-Party Content
- Asset Does Not Meet Marketplace Standards — This asset does not meet the current marketplace quality standards.
- Insufficient Asset Demonstration — Please provide additional demonstrations of the asset's functionality or features.
- Unsupported Listing Type — This type of listing is not currently supported on the marketplace.
- Asset Delivery Method Invalid — The asset delivery method provided could not be verified or accessed.
- Marketplace Policy Violation
- Repeated Submission
- Verification Requirement Not Met
- Other — (requires modal)

### APPLICATION DENIALS
- Insufficient Quality
- Incomplete Submission
- Insufficient Showcase
- Insufficient Information
- Ownership Cannot Be Verified
- Insufficient Ownership Evidence
- Unauthorised Content
- Third-Party Content
- Portfolio Does Not Meet Standards
- Skill Level Does Not Meet Requirements
- Portfolio Access Issue
- Verification Requirement Not Met
- Repeated Submission
- Other — (requires modal)

## 9.4 MODERATION REASONS (used in Moderate pipeline — NOT denial reasons)

Shown when staff click the Moderate button:
- Suspected AI Generated Content
- Suspected Stolen Content
- Ownership Dispute
- Fraud Concern
- Misrepresentation
- Circumvention Of Marketplace Requirements
- Repeated Rule Violations
- Other — (requires evidence upload)

## 9.5 PROOF REQUEST REASONS (standardised, no custom typing)

When staff click Request Proof of Ownership:
> "Ownership Verification — Additional ownership verification is required before this submission can proceed."

When staff click Request Proof of Funds:
> "Funds Verification — Additional funds verification is required before this submission can proceed."

---

# 10. POSTING SYSTEM

## 10.1 OVERVIEW

Single command: /post
All workflows happen entirely in DMs.
When run in a server channel, bot responds ephemerally redirecting user to DMs.
Bot tone: casual and friendly throughout — acts as a guide at every step.

## 10.2 CATEGORY SELECTION

User selects one of:
- For Hire (FH)
- Looking For Developers (LFD)
- Assets

## 10.3 FOR HIRE (FH) FLOW

### Access Checks (run before workflow):
1. Has Verified role — if not: blocked, told to verify via Bloxlink
2. Has at least one Skill Role — if not: blocked immediately, told to use /apply
3. Not marketplace muted — if muted: blocked, told duration remaining
4. Not within repost cooldown — if in cooldown: blocked, told time remaining

### Fields collected in order:

1. **Role / Specialisation** — dropdown: Scripter / UI Designer / Builder / Animator / VFX / Modeller
2. **Title** — text input, max 70 characters
3. **Short About Me** — text input, max 200 characters
4. **Portfolio Link** — required, single link
5. **Showcase Image** — optional image upload
6. **Rates** — text input, must include structure (hourly / per task / fixed)
7. **Payment Types** — multi-select: Robux / USD
8. **USD Payment Methods** (if USD selected) — multi-select: PayPal / CashApp / Bank Transfer
9. **Availability / Timezone** — short text
10. **Specialities** — optional, comma-separated
11. **Tags** — multi-select dropdown
12. **Final Preview** — full embed preview, buttons: Confirm / Edit / Cancel

### Post routing:
- Skill role selection → matching FH review channel (staff server)
- On approval → matching FH listing channel (main server)

## 10.4 LOOKING FOR DEVELOPERS (LFD) FLOW

### Access Checks:
1. Has Verified role
2. Not marketplace muted
3. Not within cooldown

### Fields collected in order:

1. **Category / Role Needed** — dropdown: Scripter / UI Designer / Builder / Animator / VFX / Modeller
2. **Title** — text input, max 70 characters
3. **Payment Type** — Robux or USD
4. **Payment Details** — amount. If USD: payment method (PayPal / CashApp / Bank Transfer)
5. **Deadline** — text input (e.g. "2 weeks", "ASAP")
6. **Task Description** — text input, max 200 characters
7. **Portfolio Link** — optional
8. **Tags** — multi-select dropdown
9. **Final Confirmation** — preview embed, buttons: Confirm / Edit / Cancel

### Auto-flag logic (Proof of Funds):
- Bot checks payment amount against configurable threshold (PROOF_OF_FUNDS_THRESHOLD in config)
- If over threshold: proof of funds requested before post goes to review
- Staff can also manually trigger proof of funds at review stage

### Post routing:
- Role selected → matching LFD review channel (staff server)
- On approval → matching LFD listing channel (main server)

## 10.5 ASSETS FLOW

### Access Checks:
1. Has Verified role
2. Has Marketplace Subscriber role — if not: blocked, told to subscribe via Patreon or use /get-seller
3. Not marketplace muted
4. Not within cooldown

### Fields collected in order:

1. **Asset Category** — dropdown: Game Templates / UI Packs / Systems / Model Packs / Games / Animation Packs / Others
2. **Title** — text input, max 70 characters
3. **Asset Type (Sale Mode)** — Single Sale / Unlimited Sales
4. **Price** — fixed amount
5. **Payment Type** — Robux or USD
6. **USD Payment Methods** (if USD) — PayPal / CashApp / Bank Transfer
7. **Asset Delivery** — file upload OR secure link (stored privately, never public)
8. **Payment Link** — gamepass / product / external payment link
9. **Showcase Image** — required
10. **Description** — text input, max 200 characters
11. **Tags** — multi-select dropdown
12. **Ownership Confirmation** — "Do you confirm you own full rights to this asset?" — Yes / Cancel
13. **Final Preview** — full embed, buttons: Confirm / Edit / Cancel

### Post routing:
- Asset category → matching Assets review channel (staff server)
- On approval → matching Assets listing channel (main server)
- Single Sale: listing auto-archives after verified purchase

---

# 11. REVIEW SYSTEM

## 11.1 OVERVIEW

Every post (FH, LFD, Assets) and application enters a backend review pipeline.
No auto-approval. Every item requires a Marketplace Staff member to manually action it.
Any Marketplace Staff member can action any review — no claiming system.

## 11.2 REVIEW ACTIONS PER TYPE

### FH Reviews
Buttons: ✅ Approve | ❌ Deny | 🔍 Request Proof of Ownership | 🔶 Moderate

### LFD Reviews
Buttons: ✅ Approve | ❌ Deny | 💰 Request Proof of Funds | 🔶 Moderate

### Assets Reviews
Buttons: ✅ Approve | ❌ Deny | 🔍 Request Proof of Ownership
NOTE: No Moderate button on asset reviews.

### Application Reviews
Buttons: ✅ Approve | ❌ Deny | 🔍 Request Proof of Ownership | 🔶 Moderate

## 11.3 ACTION BEHAVIOUR

### Approve
- Post goes live in correct main server channel
- Review embed removed from staff channel
- Full log entry posted to Post Logs
- User DM'd (see notification system)

### Deny
- Staff selects from filtered denial reason list (multi-select)
- "Other" option opens modal for custom explanation
- Review embed removed from staff channel
- Full log entry posted to Post Logs
- User DM'd with formatted reason list + Post ID

### Request Proof of Ownership / Funds
- Thread created on review embed (bot-only, staff cannot type in thread)
- Bot DMs user with standardised proof request message + Submit Proof button
- User has 48 hours to respond
- If no response after 48h: auto-denied with reason "Verification Requirement Not Met", logged, user DM'd
- When proof submitted: bot posts proof in the thread, pings the requesting staff member
- Staff reviews proof in thread
- Staff can then: Approve Proof (continue reviewing) or Deny Proof (deny post with reason)

### Moderate
- Full investigation pipeline triggered (see Section 13)
- Thread created on review embed (bot-only)

## 11.4 POST-ACTION BEHAVIOUR

After Approve or Deny:
- Review embed removed from staff review channel
- Full action record posted to Post Logs (Post ID, action, who actioned, timestamp, reason)

---

# 12. PROOF SYSTEMS

## 12.1 PROOF OF OWNERSHIP

Triggered by:
- Staff clicking "Request Proof of Ownership" on FH / Assets review or application

Process:
1. Thread created on review embed (locked to bot only — staff cannot type)
2. Bot DMs user: standardised ownership verification message + Submit Proof button
3. 48h deadline begins
4. If no response: auto-denial, "Verification Requirement Not Met", logged
5. If response: user uploads video (project files, layers, creation environment)
6. Bot posts proof in the review thread
7. Bot pings requesting staff member in thread
8. Staff actions: Approve Proof / Deny Proof (from thread buttons)
9. All outcomes logged

## 12.2 PROOF OF FUNDS

Triggered by:
- Bot auto-flag (payment exceeds PROOF_OF_FUNDS_THRESHOLD)
- Staff manually clicking "Request Proof of Funds" on LFD review

Process:
1. Thread created on LFD review embed (locked to bot only)
2. Bot DMs user: standardised funds verification message + Submit Proof of Funds button
3. 48h deadline begins
4. If no response: auto-denial, "Verification Requirement Not Met", logged
5. If response: user submits screen recording (balance visible + page refresh)
6. Bot posts proof in review thread
7. Bot pings requesting staff member in thread
8. Staff actions: Approve Proof / Deny Proof (from thread buttons)
9. All outcomes logged

---

# 13. MODERATE (INVESTIGATION) SYSTEM

Used only on: FH posts, LFD posts, Applications.
NOT available on Assets.

Used when staff suspect: AI-generated work, stolen assets, fraud, serious inconsistencies.

## 13.1 MODERATE PIPELINE

1. Staff clicks "Moderate" on review embed
2. Thread created on review embed (locked to bot only — staff cannot type in thread)
3. Bot opens modal prompting staff for:
   - Moderation reason (dropdown — see Section 9.4)
   - Evidence (file upload / links)
   - Written explanation
4. Staff submits
5. Post/application status → Under Investigation
6. Bot DMs user (minimal, no panic language):
   > "Your post has been placed on hold for further review. Post ID: FH-0001"
7. Bot DMs user separately requesting proof of ownership (video of project files / creation process) + Submit Proof button
8. 48h deadline begins for user proof submission
9. If no response: auto-denial with reason "Verification Requirement Not Met"
10. If proof submitted: bot posts in thread + pings the staff member who moderated

## 13.2 AFTER PROOF REVIEW

Staff reviews proof in thread. Then selects outcome:

**Outcome: No Action**
- Unsuspend post, continue normal review
- Logged

**Outcome: Punishment Required**
- Staff selects from punishment dropdown (see config: MODERATION_PUNISHMENT_TIERS)
- Default tiers (all editable in config):
  - Warning — warn issued, post continues review
  - Marketplace Mute — blocks marketplace commands (duration configurable)
  - Temporary Ban — Discord ban for configurable duration
  - Permanent Ban — permanent Discord ban

## 13.3 POST-PUNISHMENT

- Bot DMs user with punishment type, reason, evidence reference
- DM includes Appeal button → auto-creates moderation ticket in Moderation Tickets category
- All actions logged to Mod Logs + Post Logs

---

# 14. BROWSING SYSTEM

## 14.1 OVERVIEW

/browse always redirects to DM regardless of where it's run.
Results delivered as full cloned listing embeds in DM carousel — one listing per page.
Carousel shows the same embed as the public post (full clone).

## 14.2 BROWSE FILTERS

Users can browse by:
- Search (title, description, tags — fuzzy match)
- Category (FH / LFD / Assets)
- Skill type
- Tags (multi-select)

## 14.3 CAROUSEL STRUCTURE

Each carousel page shows the full listing embed (identical to public post) plus navigation buttons:

- ◀ Previous
- ▶ Next
- 💾 Save
- 📌 View Post

View Post redirects user to the original live message in main server — does NOT generate a new embed.

## 14.4 BROWSE BEHAVIOUR

- User can open View Post, return to carousel, continue from same position
- Save adds listing to saved list (viewable via /saved)

## 14.5 RANKING

Results ranked by:
- Tag relevance to search
- Recency
- Trusted Seller status (slight boost — not suppressive to smaller sellers)
- Engagement (saves, clicks)

---

# 15. FEATURED LISTINGS SYSTEM

## 15.1 ELIGIBILITY

ONLY approved asset listings are eligible for featured rotation.
FH and LFD posts are NEVER featured.

Eligible asset categories:
- Game Templates
- Games
- UI Packs
- Systems
- Model Packs
- Animation Packs
- Others

## 15.2 ROTATION LOGIC

- One listing shown at a time in Featured Listings channel (ID: 1509303881253912706)
- Marketplace Subscriber seller: 1 hour slot
- Trusted Seller: 2 hour slot
- Rotation is fully automatic — FIFO queue weighted by seller tier
- When slot expires: old embed deleted, next in queue posted automatically
- Listing returns to rotation queue if still active after slot

## 15.3 ELIGIBILITY RULES

- Post must be live and approved
- Post must not be expired, archived, or suspended

---

# 16. ASSET PURCHASE SYSTEM

## 16.1 PURCHASE FLOW

1. Buyer clicks "Buy Asset" on listing embed
2. Bot DMs buyer: purchase initiated, submit proof of payment
3. Buyer submits payment proof (screenshot / recording) in DM
4. Bot routes proof to relevant assets staff review channel
5. Marketplace Staff verifies proof
6. On rejection: bot DMs buyer — payment could not be verified, no delivery made
7. On approval: bot DMs seller with confirmation request

## 16.2 SELLER CONFIRMATION

After staff approve proof:
1. Bot DMs seller: "Payment confirmation required for [Asset Title]. Please confirm."
   Buttons: ✅ Payment Received | ❌ Payment Missing
2. Seller clicks Payment Received → bot delivers asset to buyer via DM
3. Seller clicks Payment Missing → see Section 16.3
4. Admin+ can bypass seller confirmation step if needed (logged)

## 16.3 PAYMENT MISSING OUTCOME

When seller clicks "Payment Missing":
1. Support ticket automatically created in Support Tickets category (ID: 1509533823891673249)
2. Both buyer and seller are referenced in the ticket
3. Staff investigate manually
4. Admin+ have access to all asset files held by the bot — can manually deliver to buyer if seller is found to be dishonest

## 16.4 SINGLE SALE LOGIC

If listing is marked Single Sale:
- After successful verified purchase + seller confirmation + delivery: listing auto-archives
- Logged to Post Logs

## 16.5 ASSET FILE ACCESS

Admin+ can access all asset delivery files/refs stored by the bot for investigation purposes.

---

# 17. APPLICATION SYSTEM

## 17.1 OVERVIEW

Command: /apply
All applications land in staff server channel ID: 1509362277319704676
All skill types use the same channel.

## 17.2 APPLICATION FLOW

1. User runs /apply
2. Bot redirects to DM
3. User selects skill type: Scripter / UI Designer / Builder / Animator / VFX / Modeller
4. User provides portfolio link
5. Application submitted with auto-generated ID (APP-XXXX)
6. Bot DMs user: "Your application has been received. Status updates will be sent here."
7. Review embed posted to applications channel (staff server)

## 17.3 APPLICATION REVIEW EMBED

- Application ID (APP-XXXX)
- Applicant mention + username
- Skill type applied for
- Account age
- Portfolio link
- Previous application history + outcomes
- Active moderation flags
- MP Notes

## 17.4 STAFF ACTIONS

| Action | Effect |
|---|---|
| ✅ Approve | Skill role assigned. Logged. User DM'd. |
| ❌ Deny | Filtered denial reasons (multi-select). Logged. User DM'd. |
| 🔍 Request Proof of Ownership | Thread created. Bot DMs user. 48h deadline. |
| 🔶 Moderate | Full investigation pipeline triggered. |

## 17.5 APPLICATION RULES

- Users cannot edit after submission — must reapply if denied
- Proof requests freeze the application until resolved or deadline expires
- Applications receive highest fraud scrutiny (primary anti-fraud filter)

---

# 18. SELLER ACCESS SYSTEM (/get-seller)

## 18.1 PURPOSE

Fallback only — used when Patreon bot fails to assign Marketplace Subscriber role.

## 18.2 FLOW

1. User runs /get-seller
2. Bot opens modal: "Please enter your Patreon transaction/order ID"
3. Bot posts request to staff server channel ID: 1509362225859661904
4. Admin+ verify transaction manually via Patreon dashboard
5. If valid: Marketplace Subscriber role manually assigned, user DM'd
6. If invalid: request denied, user DM'd

## 18.3 ACCESS

Only Admin+ can see and action the get-seller requests channel.

---

# 19. TICKET SYSTEM

## 19.1 OVERVIEW

Command: /ticket
Access: Verified users only
Limit: One open ticket per user at a time

## 19.2 TICKET TYPES & CATEGORIES

| Type | Staff Server Category ID |
|---|---|
| Marketplace | 1509360077356662856 |
| Moderation | 1509360430789693541 |
| Support | 1509533823891673249 |

## 19.3 TICKET CREATION FLOW

1. User runs /ticket, selects type
2. New channel created in relevant staff server category
3. Channel name: ticket-[type]-[username]-[shortID]
4. User communicates entirely via DM
5. Bot mirrors user DMs → staff ticket channel
6. Staff reply in channel → bot mirrors back to user DM
7. Staff messages prefixed with !! are NOT mirrored (internal notes)

## 19.4 TICKET ACTIONS (STAFF)

| Action | Description |
|---|---|
| Claim | Staff member takes responsibility. Logged. |
| Close | Closes + archives channel. Both sides notified. Logged. |
| Convert | Change ticket type |
| Escalate | Flag for higher staff attention. Logged. |

## 19.5 APPEAL TICKETS

Any punishment DM includes an Appeal button.
Clicking Appeal → automatically creates a Moderation ticket.
Works for: warns, mutes, bans, marketplace mutes, and moderate outcomes.

---

# 20. MODERATION SYSTEM

## 20.1 OVERVIEW

Mod commands work in both main server and staff server.
All commands open a modal after user is selected — no inline arguments.
Reason is required for ALL punishment types.
Everything logged to Mod Logs.

## 20.2 PUNISHMENT COMMANDS

### /warn @user
- Modal: reason
- Bot DMs user with warning + reason
- Warns are informational only — no auto-escalation
- Logged: moderator, reason, timestamp

### /mute @user
- Modal: duration + reason
- Uses Discord's built-in timeout
- Bot DMs user: mute duration + reason + appeal button
- Logged

### /kick @user
- Modal: reason
- Bot attempts DM to user before kick
- Logged

### /ban @user
- Modal: duration + reason
- Discord ban for specified duration
- Bot DMs user: duration, reason, appeal button
- When ban expires: bot DMs user with server invite link
- Logged

### /note @user
- Modal: note text
- Internal only — never shown to user
- Visible in /mod-logs and on review embeds
- Logged

### Marketplace Mute (via Moderate pipeline)
- DB flag only — no Discord-side action
- Blocks: /post, /repost, browse buy actions
- Duration configurable per case
- Bot DMs user: reason + appeal button
- Logged

## 20.3 PUNISHMENT REMOVAL

### /unmute @user
- Modal: reason
- Removes Discord timeout early
- Logged: who removed, reason, timestamp

### /unban @user
- Modal: reason
- Removes ban early
- Bot DMs user with invite link
- Logged

## 20.4 /mod-logs @user

Access: Moderator+
Marketplace Staff can see notes only.

Format per entry:
```
@User | [Action] — [Timestamp] | [Duration if applicable] | [Moderator] | [Reason / Evidence]
```

## 20.5 /mylogs

User-facing. Own history only. Cannot use on other users.
Same format as /mod-logs but moderator field hidden.

## 20.6 /mp-notes @user

Access: Marketplace Staff+
Adds marketplace-specific note to user record.
Visible on all review embeds for that user.
Stored in DB. Logged.

## 20.7 /grant-trusted-seller @user

Access: Admin+
Modal: user selection + confirmation
Checks: Marketplace Subscriber + at least one Skill Role + no active severe punishments
If valid: Trusted Seller role assigned, user DM'd, logged.

---

# 21. LOGGING SYSTEM

## 21.1 POST LOGS (Channel: 1509363498537455758)

All post and application lifecycle events. Every entry includes: ID, action, who actioned, timestamp, reason.

Post Events:
- created (submitted)
- approved
- denied (with reasons)
- archived
- restored (reposted)
- deleted (permanent)

Proof Events:
- ownership proof requested
- ownership proof approved
- ownership proof denied
- funds proof requested
- funds proof approved
- funds proof denied
- proof deadline expired (auto-denial)

Moderation Events (post-level):
- moderated (investigation opened)
- moderation outcome (punishment issued or cleared)
- evidence attached

Purchase Events (assets):
- purchase initiated
- purchase proof approved
- purchase proof denied
- seller confirmed payment
- seller flagged payment missing
- asset delivered

## 21.2 MOD LOGS (Channel: 1509363518586228736)

All moderation actions:
- warn issued
- mute issued / removed early
- kick issued
- ban issued / removed early
- note added
- marketplace mute issued / removed
- punishment from Moderate pipeline
- trusted seller granted

Each entry: user, action, moderator, duration, reason, timestamp, evidence if applicable.

## 21.3 TICKET LOGS (Channel: 1509363936774979655)

- ticket opened (type, user, ID)
- ticket claimed (by whom)
- ticket closed (by whom)
- ticket escalated
- ticket converted (from → to)

## 21.4 MISC LOGS (Channel: 1509363667987202068)

- API errors + error codes
- Patreon sync failures
- Bot restart events
- Database connection errors
- Unhandled exceptions
- Audit failures

---

# 22. ANALYTICS SYSTEM

## 22.1 ACCESS

Command: /analytics
Access: Marketplace Subscriber only
Scope: Own posts only

## 22.2 DATA TRACKED PER POST

- Impressions (shown in browse results)
- Clicks (View Post presses)
- Saves
- Purchases (assets only)
- Conversion rate (clicks → purchases, assets only)

## 22.3 DISPLAY

DM embed. User selects post via dropdown by Post ID.

---

# 23. AUDIT SYSTEM

Command: /audit-log
Access: Admin+ only

Returns:
- System health status
- Recent API failures with error codes
- Database connection status
- Patreon sync issues
- Unresolved misc log entries
- Bot uptime
- Recent unhandled exceptions

---

# 24. NOTIFICATION SYSTEM

Design rule: Users notified ONLY when something requires action or a final outcome changes.
No "under review", no "pending", no investigation language. Silent processing until actionable.
Tone: casual and friendly.

## 24.1 POST SUBMISSION CONFIRMED
> "Your post has been successfully submitted.
> **Post ID:** FH-0001
> You'll be notified once there's an update."

## 24.2 PROOF OF OWNERSHIP REQUESTED
> "Additional verification is required for your post.
> **Post ID:** FH-0001
> Please submit a short video showing proof of ownership (project file / creation process)."
> Button: Submit Proof
> (48h deadline — no deadline mentioned in DM)

## 24.3 PROOF OF FUNDS REQUESTED
> "Additional verification is required for this listing.
> **Post ID:** LFD-0001
> Please submit a screen recording showing your available funds and a page refresh."
> Button: Submit Proof of Funds

## 24.4 PROOF APPROVED
> "Verification has been approved. Your post will now continue normally."

## 24.5 PROOF DENIED
> "Verification could not be confirmed.
> **Reasons:**
> • [Reason]
> **Reference ID:** FH-0001"

## 24.6 POST APPROVED
> "Your post is now live in the Dev Vault marketplace.
> **Post ID:** FH-0001"
> Button: View Post

## 24.7 POST DENIED
> "Your submission could not be approved.
> **Reasons:**
> • [Reason 1]
> • [Reason 2]
> **Reference ID:** FH-0001"

## 24.8 POST PLACED ON HOLD (Moderate triggered)
> "Your post has been placed on hold for further review.
> **Post ID:** FH-0001"

## 24.9 POST ARCHIVED
> "Your post has been archived.
> **Post ID:** FH-0001
> You can restore it at any time within the available repost window."
> Button: Repost

## 24.10 POST RESTORED
> "Your post has been successfully restored.
> **Post ID:** FH-0001"

## 24.11 POST PERMANENTLY DELETED (72h after archive)
> "Your post has been permanently removed.
> **Post ID:** FH-0001"

## 24.12 PURCHASE INITIATED (buyer)
> "Purchase initiated for: **[Asset Title]**
> Please submit proof of payment to continue."

## 24.13 PURCHASE PROOF APPROVED (buyer)
> "Payment confirmed. Your asset is being delivered."

## 24.14 PURCHASE PROOF DENIED (buyer)
> "Payment could not be verified. No delivery will be made."

## 24.15 ASSET DELIVERED (buyer)
> "Your asset has been delivered successfully."
> Button: Download / View

## 24.16 SELLER PAYMENT CONFIRMATION REQUEST
> "A buyer has submitted payment for: **[Asset Title]**
> Please confirm whether payment was received."
> Buttons: ✅ Payment Received | ❌ Payment Missing

## 24.17 APPLICATION SUBMITTED
> "Your application has been received.
> **Application ID:** APP-0001
> Status updates will be sent here."

## 24.18 APPLICATION APPROVED
> "Your application has been approved. You've been granted the **[Skill Role]** role."

## 24.19 APPLICATION DENIED
> "Your application was not successful.
> **Reasons:**
> • [Reason]
> **Reference ID:** APP-0001"

## 24.20 APPLICATION PROOF REQUESTED
> "Additional verification is required for your application.
> **Application ID:** APP-0001"
> Button: Submit Proof

## 24.21 SELLER ACCESS GRANTED
> "You now have access to the Dev Vault marketplace."

## 24.22 SELLER ACCESS REMOVED (subscription expired)
> "Your marketplace access has been removed due to subscription expiry."

## 24.23 BAN EXPIRED
> "Your ban from Dev Vault has expired. You're welcome to rejoin."
> Button: Rejoin Server

## 24.24 PUNISHMENT ISSUED (warn / mute / marketplace mute)
> "[Punishment Type] issued.
> **Reason:** [reason]
> **Duration:** [duration if applicable]"
> Button: Appeal

## 24.25 PROOF DEADLINE EXPIRED (auto-denial)
> "Your submission could not be approved.
> **Reasons:**
> • Verification requirements have not been satisfied.
> **Reference ID:** FH-0001"

---

# 25. POST LIFECYCLE

## 25.1 STATES

```
SUBMITTED
    ↓
UNDER REVIEW (silent — no user notification)
    ↓
APPROVED (LIVE) ←————————————— RESTORED (via /repost)
    ↓ (48h)
ARCHIVED
    ↓ (72h, if not reposted)
PERMANENTLY DELETED

UNDER REVIEW → DENIED
UNDER REVIEW → PROOF REQUESTED → APPROVED or DENIED
UNDER REVIEW → MODERATED → RESOLVED → APPROVED or DENIED/PUNISHED
LIVE → SOLD (single-sale assets) → ARCHIVED
LIVE → SUBSCRIPTION LOST → ARCHIVED
```

## 25.2 TIMING

- Post auto-archives: 48 hours after going live
- Repost window: 48 hours after archive
- Permanent deletion: 72 hours after archive (if not reposted)
- No DM warnings sent before expiry or deletion — user tracks this themselves

## 25.3 REPOST COOLDOWNS (per individual post)

| Role | Cooldown |
|---|---|
| Verified / Skill Role only | 48 hours |
| Marketplace Subscriber | 36 hours |
| Trusted Seller | 24 hours |

---

# 26. REPOST SYSTEM

## 26.1 COMMAND

/repost — Access: Verified users with at least one archived post

## 26.2 FLOW

1. User runs /repost
2. Bot DMs dropdown list of their archived posts
3. User selects a post
4. Bot shows pre-filled embed with all original fields
5. User can edit any fields before resubmitting
6. User confirms
7. Post goes LIVE immediately — does NOT re-enter review pipeline
8. Post lifecycle timer resets (48h from repost)

---

# 27. SAVED LISTINGS

## 27.1 SAVING

- 💾 Save button on browse carousel embeds
- Stored in DB per user

## 27.2 VIEWING

Command: /saved
DM carousel — same format as browse carousel
User can remove saves from carousel interface

---

# 28. FEATURED ROTATION LOGIC

- Approved live asset posts enter the featured queue automatically
- Queue weighted: Trusted Seller posts first (2h slots), then Marketplace Subscriber posts (1h slots)
- FIFO within each tier
- One listing shown at a time in featured channel
- When slot expires: embed deleted, next post in queue displayed
- Post re-enters queue after slot if still active
- Ineligible posts (archived, expired, sold single-sale) are skipped

---

# 29. DATABASE SCHEMA OVERVIEW

### users
- user_id (Discord snowflake, PK)
- verified (bool)
- marketplace_muted (bool)
- marketplace_mute_expires (timestamptz)
- warn_count (int)
- created_at (timestamptz)

### posts
- post_id (text, e.g. "FH-0001", PK)
- post_sequence (int, per-type counter)
- user_id (FK → users)
- type (enum: FH / LFD / ASSET)
- category (text)
- title (text)
- description (text)
- fields (jsonb — all post-specific fields)
- status (enum: submitted / live / archived / deleted / moderated / denied)
- showcase_image_url (text)
- delivery_ref (text — assets only, private)
- payment_link (text — assets only)
- sale_type (enum: single / unlimited — assets only)
- channel_message_id (Discord message ID of live post)
- created_at (timestamptz)
- approved_at (timestamptz)
- archived_at (timestamptz)
- deleted_at (timestamptz)
- cooldown_expires (timestamptz)
- featured_eligible (bool)

### applications
- application_id (text, e.g. "APP-0001", PK)
- user_id (FK → users)
- skill_type (text)
- portfolio_link (text)
- status (enum: submitted / approved / denied / proof_requested / moderated)
- denial_reasons (jsonb array)
- created_at (timestamptz)
- actioned_at (timestamptz)
- actioned_by (Discord snowflake)

### tickets
- ticket_id (text, PK)
- user_id (FK → users)
- type (enum: marketplace / moderation / support)
- channel_id (Discord snowflake — staff server channel)
- status (enum: open / closed)
- claimed_by (Discord snowflake, nullable)
- created_at (timestamptz)
- closed_at (timestamptz)

### moderation
- entry_id (uuid, PK)
- user_id (FK → users)
- action_type (enum: warn / mute / kick / ban / note / marketplace_mute)
- reason (text)
- evidence (jsonb, nullable)
- duration_seconds (int, nullable)
- moderator_id (Discord snowflake)
- created_at (timestamptz)
- expires_at (timestamptz, nullable)
- removed_early (bool, default false)
- removed_by (Discord snowflake, nullable)
- removed_reason (text, nullable)

### mp_notes
- note_id (uuid, PK)
- user_id (FK → users)
- note_text (text)
- added_by (Discord snowflake)
- created_at (timestamptz)

### analytics
- post_id (FK → posts, PK)
- impressions (int, default 0)
- clicks (int, default 0)
- saves (int, default 0)
- purchases (int, default 0)

### saved_listings
- user_id (FK → users)
- post_id (FK → posts)
- saved_at (timestamptz)
- PRIMARY KEY (user_id, post_id)

### suspensions (Moderate cases)
- suspension_id (uuid, PK)
- target_id (text — post_id or application_id)
- target_type (enum: post / application)
- suspended_by (Discord snowflake)
- moderation_reason (text)
- evidence (jsonb)
- explanation (text)
- outcome (text, nullable)
- punishment_type (text, nullable)
- created_at (timestamptz)
- resolved_at (timestamptz, nullable)

### proof_requests
- proof_id (uuid, PK)
- target_id (text — post_id or application_id)
- target_type (enum: post / application)
- proof_type (enum: ownership / funds)
- requested_by (Discord snowflake)
- requested_at (timestamptz)
- deadline_at (timestamptz)
- submitted_at (timestamptz, nullable)
- proof_ref (text, nullable — file or link)
- status (enum: pending / approved / denied / expired)
- thread_id (Discord snowflake — staff thread)

### post_id_sequences
- type (text, PK — "FH" / "LFD" / "ASSET" / "APP")
- last_sequence (int)

### purchases
- purchase_id (uuid, PK)
- post_id (FK → posts)
- buyer_id (FK → users)
- seller_id (FK → users)
- status (enum: initiated / proof_submitted / staff_approved / seller_confirmed / delivered / cancelled / disputed)
- proof_ref (text, nullable)
- created_at (timestamptz)
- delivered_at (timestamptz, nullable)

### audit_log
- entry_id (uuid, PK)
- event_type (text)
- detail (text)
- error_code (text, nullable)
- created_at (timestamptz)

---

# 30. CONFIGURATION FILE REFERENCE

All values editable without code changes. Stored in environment variables + config.json.

```
# SERVERS
MAIN_SERVER_ID=1509248976690348303
STAFF_SERVER_ID=1509358346619195413
MAIN_SERVER_INVITE=[invite link for ban expiry DMs]

# BOT
BOT_TOKEN=[token]
DATABASE_URL=[neon connection string]

# TIMINGS (in hours)
POST_EXPIRY_HOURS=48
POST_DELETE_HOURS=72
PROOF_DEADLINE_HOURS=48
REPOST_COOLDOWN_VERIFIED_HOURS=48
REPOST_COOLDOWN_SUBSCRIBER_HOURS=36
REPOST_COOLDOWN_TRUSTED_HOURS=24
FEATURED_SLOT_STANDARD_HOURS=1
FEATURED_SLOT_TRUSTED_HOURS=2

# PROOF OF FUNDS THRESHOLDS
PROOF_OF_FUNDS_THRESHOLD_ROBUX=10000
PROOF_OF_FUNDS_THRESHOLD_USD=50

# ROLE IDs (MAIN SERVER)
ROLE_ADMIN=1509295378569363597
ROLE_MODERATOR=1509295490871853167
ROLE_MARKETPLACE_STAFF=1509295549264691253
ROLE_VERIFIED=1509295799123837009
ROLE_BUYER=1509297854043389962
ROLE_MARKETPLACE_SUBSCRIBER=1509297538140999710
ROLE_TRUSTED_SELLER=1509297031225671963
ROLE_SCRIPTER=1509296101302206465
ROLE_UI_DESIGNER=1509295887015350303
ROLE_BUILDER=1509296186715017438
ROLE_ANIMATOR=1509296312338743427
ROLE_VFX=1509305649081614346
ROLE_MODELLER=1509296447135158461

# ROLE IDs (STAFF SERVER)
STAFF_ROLE_ADMIN=1509358585627279500
STAFF_ROLE_MODERATOR=1509358643341037578
STAFF_ROLE_MARKETPLACE_STAFF=1509358675318538300

# MAIN SERVER — LISTING CHANNELS
CH_FH_UI=1509305488653946890
CH_FH_SCRIPTER=1509305454809972807
CH_FH_MODELLER=1509305512821264504
CH_FH_BUILDER=1509305536901025792
CH_FH_VFX=1509305570300133386
CH_FH_ANIMATOR=1509305789834072144
CH_LFD_UI=1509305923720445972
CH_LFD_SCRIPTER=1509305903571271680
CH_LFD_MODELLER=1509305955077193969
CH_LFD_BUILDER=1509305979790168214
CH_LFD_VFX=1509306013831008357
CH_LFD_ANIMATOR=1509306034416521349
CH_ASSETS_GAME_TEMPLATES=1509305240975970515
CH_ASSETS_GAMES=1509305196553965588
CH_ASSETS_SYSTEMS=1509305272391307435
CH_ASSETS_MODEL_PACKS=1509305294520320130
CH_ASSETS_UI_PACKS=1509305160613236816
CH_ASSETS_ANIMATION_PACKS=1510685970486267975
CH_FEATURED=1509303881253912706

# STAFF SERVER — REVIEW CHANNELS
STAFF_CH_FH_UI=1509361386906451999
STAFF_CH_FH_SCRIPTER=1509361342929178737
STAFF_CH_FH_MODELLER=1509561702188974212
STAFF_CH_FH_BUILDER=1509361414119100416
STAFF_CH_FH_VFX=1509361462903050400
STAFF_CH_FH_ANIMATOR=1509361444377067612
STAFF_CH_LFD_UI=1509361559749525544
STAFF_CH_LFD_SCRIPTER=1509361542271864893
STAFF_CH_LFD_MODELLER=1509561892891525130
STAFF_CH_LFD_BUILDER=1509361586974752858
STAFF_CH_LFD_VFX=1509361716004261978
STAFF_CH_LFD_ANIMATOR=1509361630541254837
STAFF_CH_ASSETS_GAME_TEMPLATES=1509361856643600614
STAFF_CH_ASSETS_GAMES=1509362001917382786
STAFF_CH_ASSETS_SYSTEMS=1509361928357679195
STAFF_CH_ASSETS_MODEL_PACKS=1509361961773830224
STAFF_CH_ASSETS_UI_PACKS=1509361892009709830
STAFF_CH_ASSETS_ANIMATION_PACKS=1509362037694664815
STAFF_CH_APPLICATIONS=1509362277319704676
STAFF_CH_GET_SELLER=1509362225859661904

# STAFF SERVER — LOG CHANNELS
STAFF_CH_POST_LOGS=1509363498537455758
STAFF_CH_MOD_LOGS=1509363518586228736
STAFF_CH_TICKET_LOGS=1509363936774979655
STAFF_CH_MISC_LOGS=1509363667987202068

# STAFF SERVER — TICKET CATEGORIES
STAFF_CAT_MARKETPLACE_TICKETS=1509360077356662856
STAFF_CAT_MODERATION_TICKETS=1509360430789693541
STAFF_CAT_SUPPORT_TICKETS=1509533823891673249

# EMBED COLOURS (hex)
COLOUR_FH=0x2DD4BF
COLOUR_LFD=0x818CF8
COLOUR_ASSETS=0xFBBF24
COLOUR_APPLICATIONS=0x94A3B8
COLOUR_SYSTEM=0x1E293B
COLOUR_APPROVAL=0x22C55E
COLOUR_DENIAL=0xEF4444
COLOUR_PROOF_REQUEST=0xF97316
COLOUR_MODERATION=0xF43F5E

# MODERATION PUNISHMENT TIERS (editable)
# Format: label|action|default_duration_hours (0 = permanent)
MODERATION_PUNISHMENT_TIERS=[
  "Warning|warn|0",
  "Marketplace Mute|marketplace_mute|168",
  "Temporary Ban|temp_ban|720",
  "Permanent Ban|permanent_ban|0"
]

# DENIAL REASONS — editable per category in config/denial-reasons.json
# APPLICATION DENIAL REASONS — config/application-denial-reasons.json
# MODERATION REASONS — config/moderation-reasons.json
```

---

# END OF SPEC V2.1

