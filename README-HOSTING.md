# v0.9.1 - Archived-profile deletion (local candidate; not deployed)

Studio owners can filter Profiles to Archived and select the trash control. Save any
pending workspace changes first. A server-generated preview shows affected revisions,
employee access records, NFC assignments and images that will become unused. The owner
must type the exact profile name. Active profiles, personal cards and whole-company
deletion are outside this release.

Apply the additive migration `0007_deleted_profiles.sql` before running the new Worker.
Deletion uses the existing atomic workspace/media/public-view/projection transaction,
removes company employee grants assigned to this profile and disables/clears NFC
assignments. Shared media, company-owner/manager access, other profiles and personal
accounts remain. The transaction rechecks workspace and membership state. Company
member grant writes also recheck the workspace revision to prevent in-flight access
creation referring to a deleted profile.

An opaque owner/profile ID tombstone prevents any workspace writer or imported backup
from resurrecting the deleted ID, even with a current workspace revision. This is not
erasure of previously exported backups, downloaded contacts or external copies. Old
backups containing deleted IDs are rejected; remove those profiles/assignments before
importing. The confirmation explains this boundary. Profile-labelled activity is
removed; a generic deletion event remains.

Local validation: profile-deletion integration suite plus existing regression, type
and build checks. Browser acceptance and production deployment require later review.
No customer data is deleted by building or running these tests.

# v0.9 — Company member pilot

Company customers now use `/company` with the shared card editor. Ascend Settings → Company access assigns company owners, managers with optional group scope, or employees tied to one profile and selected fields. Sign-in uses the granted ChatGPT email; first sign-in binds the stable account ID. Share the portal link manually; this release sends no emails and creates no grants automatically.

Company owners manage their own company memberships; only Ascend can change an owner's own grant. Disabled logins retain company-owned profiles/public cards. Unpublish or archive cards separately. Company members have no studio, finance, NFC library or personal-customer administration access. External profile photos use the controlled 144px pixel pipeline. Company logo/cover/background uploads remain studio-managed in this pilot.

Server enforcement covers company isolation, optional manager group scope, employee field locks, server-generated publications, optimistic revisions, membership checks within the save transaction, and a per-account 60-write/minute company limit. Company/public/media/projection updates stay atomic. Employee views omit revision history. Public registration stays closed. Pilot capacity remains 100 profiles across the studio and 250 access records per company; the 10,000-person package target needs the later storage milestone.

Validation: company access integration suite and existing model/hosted/team/customer/personal/admin/media checks. Real second-account and phone browser acceptance remains manual; no paid browser testing used.

# v0.8 — shared editor, workspace image storage and personal profile photos

## Save-limit repair

The former 1.4MB full-workspace browser guard counted the same photo repeatedly across drafts,
published snapshots and history. The new transport hashes and deduplicates raster image data.
Migration 0005 creates an owner-scoped image table. Workspace and normalized profile records store
compact references; authenticated workspace reads hydrate those references before role scoping.
Public cards continue to receive only their published snapshot with inline image data.

Assets, workspace revision, public views and normalized records commit in one save-token-gated
transaction. Stale writes and rollback cannot insert/delete images or modify public cards.
Only referenced images are retained, including live revisions and history. No migration-time
backfill is performed: existing inline workspaces remain readable and migrate on the next save.
The server accepts legacy inline and new compact requests. Submitted asset hashes are verified,
and references in incoming requests resolve only from supplied content, never from another
company's or account's stored image IDs. There is no public raw-asset download endpoint.

Limits remain explicit: 100 company profiles, 1.4MB compact document, 4MB of current unique images,
200 referenced images and 16MB logical expanded data. Wire requests are streamed with an 8MB cap;
image and public-view SQL parameters are batched. This repairs duplicated-image overhead and is
not the later 10,000-profile company architecture.

## Shared editing UI

Company profiles now open the same editor component as personal cards: independent panels,
device widths, Section/Profile/Design controls, Undo/Redo, preview, sharing and save status.
The studio mode retains company/group selection, 40 blocks, cover/background/profile images,
reusable section library, archive controls and publishing under the caller's permissions.
Managers keep existing backend restrictions. Locked group accents remain locked.
Personal users keep their private one-card, 20-block editor. Admin mode does not impersonate
personal customers or expose their drafts. Typography settings now persist on studio profiles.
Changes made in the studio editor remain in parent workspace state when returning to the list.

## Personal photos

Personal users can choose PNG/JPEG/WebP up to 8MB on their device. The existing raster validation
and browser decoder prepare a centre-cropped 144x144 RGB profile photo. Only fixed-size pixel data,
not the original file, is submitted. The server writes a fresh RGB PNG with exactly IHDR, IDAT
and IEND chunks, no filename, EXIF or other metadata. Previously generated PNGs used by Undo/Redo
are strictly parsed, bounded during inflation, and rebuilt. Arbitrary original file containers,
trailing data and unsupported dimensions/encodings are rejected.
Photo saves use the existing personal membership, origin, rate and optimistic version checks.
The personal JSON cap is now 256KB to accommodate pixels plus the card. Images stay private until
Publish. General personal cover/background/gallery uploads remain disabled.
This is a controlled pixel-image pipeline, not an antivirus scan of arbitrary documents.
Public registration, general upload quarantine/scanning and wider moderation remain pending.

## Recover unsaved edits

In the old still-open tab, Settings > Export full backup preserves unsaved company-profile edits.
After loading this release, Settings > Recover profile draft edits accepts that backup and copies
draft fields for matching profile/company IDs. Current live revisions, history, publication flags,
archive state, company/group records and NFC assignments remain intact. Review, then Save workspace.
This action does not auto-publish and does not create missing profiles. Full Restore backup remains
a separate replacement operation and intentionally disables publication as before.
The shared editor also has Export draft for future failed-save recovery.

## Verification

Automated tests reproduce a >1.5MB repeated-photo workspace and verify one stored image,
complete draft/history reload, unchanged public image rendering, compact/legacy transport,
missing/tampered reference rejection, stale saves, rollback and manager media isolation.
Photo tests verify PNG dimensions/chunks and exact RGB round-trip, private/published separation,
removal, Undo and malformed input rejection. Draft-recovery tests preserve public fields and
immutable input. Existing permissions, customer privacy, pricing, CSV, vCard, hosted and offline
checks pass, as does TypeScript. Browser interaction checks need the user's smoke test; no
metered browser tool was used. No paid service was enabled.

Earlier release notes follow.

---


# v0.7.2 — owner personal-customer overview

The owner dashboard now includes a Personal customers navigation item and a separate account
summary below the company statistics. Company profile counters are labelled explicitly.
Personal accounts are not copied into the company workspace or added to company/NFC counts.

Personal customers lists enabled and disabled pilot grants, whether the account has signed in,
whether a card exists, its publication state, card-update metadata and an already-public name/link
when available. Search uses account email and published name only. Access/publication filters and
25-row pages operate over the bounded 100-grant pilot list. Refresh reloads the latest server state;
this is not a live push feed. A separate Your personal card tile opens the owner's own editor/public
card and is excluded from customer counts. Current accounts are labelled Personal pilot; no paid
subscription state, plan migration or billing integration has been invented.

The owner can disable/re-enable customers using the existing optimistic access endpoint.
Disabling unpublishes and retains the draft; restoring access does not republish.
Enable a tester goes to the existing Settings access form. No invitations are sent automatically.

GET /api/admin/personal-customers is owner-only and studio-scoped. Its SQL selects account metadata
and published-view names, never draft JSON or unpublished contact fields. Private profile IDs,
authenticated user IDs, tokens, blocks and unpublished names are not returned. The owner is not
given an editor or support impersonation path into customer drafts. Existing private drafts remain
accessible solely through the customer's own authenticated personal endpoint.

New integration checks exercise anonymous, personal and manager denials, initial invitations,
bound-but-unsaved accounts, private/published/disabled states, count accuracy, independent studio
scope, no draft/contact/identity leaks, public snapshot isolation, separate owner card metadata,
revocation visibility and retained drafts. Build, typecheck, existing regression and offline checks
pass. Browser interaction QA remains unavailable; real second-account browser testing is pending.

No database migration is required. Previous profile IDs, links, permissions and saved cards remain
in their existing tables. Earlier release notes follow.

---


# v0.7.1 — navigation and personal editor usability

Settings is pinned below a scrollable studio navigation list, with an additional top-bar shortcut.
Branding is fitted to a bounded height so short windows and browser zoom cannot push Settings off-screen.

The personal editor fits the viewport: section list, preview and inspector scroll independently.
Selecting a section opens only its relevant controls and resets the inspector scroll, while the preview
keeps its position. Profile and Design have separate inspector tabs. Header/contact sections open
Profile directly. Add block is a collapsible library so current sections are immediately available.
Mobile panel switching retains the mounted preview, and Show in preview reveals the selected section.
Sharing/QR opens in a dialog instead of requiring scrolling to the end of the card editor.
Undo/Redo, saving, publishing and permissions are unchanged.

Build, TypeScript and existing regression checks pass. The screenshot was inspected. The recording
was downloaded but no video decoder or browser interaction tool is available in this environment;
interaction and responsive-layout smoke testing on the owner's browser remains required.
The owner has already confirmed sign-in return, refresh persistence and QR/public-card access
for v0.7. Real second-account browser testing is still pending.

---

# Ascend Digital Cards v0.7 — invited personal accounts

## Use the release

Sign in to the studio as owner and open Settings > Personal tester access.
Enter a tester's exact ChatGPT sign-in email, then choose Enable tester.
Share the displayed /personal link yourself. No email is sent automatically.
The tester signs in with their own ChatGPT account, gets one private card editor, and
can save drafts and explicitly publish a public card. They receive no studio/company permissions.
The owner continues to use the existing studio and can also open their own personal card.

Access is invitation-only, with a maximum of 100 retained pilot grants (disabled grants count).
No accounts have been enabled by this release; the owner chooses testers through Settings.
Public self-registration, customer uploads and automatic billing remain closed.

## Identity, isolation and revocation

Migration 0004 is schema-only and additive. It does not alter profiles, manager permissions,
public URLs, NFC assignments or existing owner identity. The new table records owner-issued
personal access grants with normalized email, stable bound user ID, revision and mutation token.
First sign-in binds a grant to the permanent trusted Sites identity. A different identity cannot
claim an already-bound email. Re-enabling preserves this binding; it does not transfer an account.

The browser cannot choose a profile owner or company. Profile reads and saves derive ownership
from authenticated identity, with one record per account. A personal user cannot access the studio
workspace, company browser, manager configuration or tester grant administration.
Root navigation sends personal-only users to /personal. The editor shows the signed-in email,
sign-out control and personal-account navigation.

Disabling access atomically revokes the grant, deletes that user's published view, clears their
published snapshot and increments their profile revision. The private draft and permanent card ID
are retained. In-flight saves recheck the exact active grant revision inside the write transaction
and cannot restore publication after revocation. Re-enabling does not republish: the tester must
explicitly publish again. The public link stays the same when publication is restored.

Only the studio owner may list, add, disable or re-enable testers. Grant edits require matching
revision and request origin. Mutation-token guards prevent stale or failed access changes from
unpublishing cards. Existing manager grants remain independent and unchanged.
Access events carry revision and update time; a full moderation/audit console remains future work.

## Verification and limits

Automated integration tests use two separate authenticated identities and verify independent
private drafts, non-enumerable draft ownership, stable per-account card IDs, bound first sign-in,
company/studio access denials, owner-only configuration, stale settings, transaction rollback,
revocation during publication, retained drafts, explicit republishing and the 100-account cap.
Existing model, image, CSV, vCard, hosted publication, manager, pagination and offline-demo checks
also pass, along with TypeScript checking.

Real browser sign-in with a second human account still needs a smoke test; no browser interaction
tool is available in this environment. No external email/password or Google identity provider is
added. Existing 64KB, 20-block and 30-save/minute personal limits remain in place.
Upload screening, bot protection, moderation, public signup, customer company provisioning,
per-profile company writes and large-company capacity testing are subsequent milestones.
The agency editor retains its 100-profile compatibility limit.

Earlier release notes follow for historical context; v0.7 supersedes the v0.6 owner-only pilot rule.

---

# Ascend Digital Cards v0.6 — customer foundation and owner editor pilot

This is the first foundation release, not a public self-service launch.

## Try the pilot

Sign in as the existing studio owner, then open /personal, or Settings > Customer foundation > Open personal editor.
The personal record is separate from the studio workspace. Enter a name to start saving.
Text and link blocks, reordering, duplication, deletion, Undo/Redo, six palettes, readable fonts,
16–20px body text, iPhone/Android/Tablet width presets, mobile panel tabs, draft autosave,
explicit publishing, public card sharing, QR and unpublishing are implemented.
Device presets are layout previews, not operating-system emulators.
Undo/Redo is session-local; publishing uses the current draft snapshot. Account IDs come only from Sites dispatch.

Uploads, image blocks, open registration, customer company provisioning, billing automation,
malware scanning, bot challenges, moderation and media storage are not enabled in this pilot.
No new external service, paid subscription, or authentication provider is configured.
The existing owner and manager grants are preserved; managers cannot enter the personal owner pilot.

## Database rollout

Migration 0003 is additive and schema-only. It creates normalized company, group and profile
records with composite ownership keys and an indexed company/profile list, a projection-version
marker, one personal profile record per authenticated owner, and a bounded per-account save counter.
No existing profile IDs, workspace JSON, public URLs, NFC tokens or access grants are changed by migration.

Existing studio saves now update normalized records in the same transaction as the workspace
and published views. A save-token guard prevents stale writes from changing projections.
Settings > Customer foundation > Sync saved company records explicitly backfills existing saved data.
The action is idempotent, owner-only, checks origin, and gates the entire transaction on the
workspace revision. It does not change the workspace or published cards. Save the workspace first.

The paginated browser uses /api/company/profiles?companyId=...&limit=25&offset=0&q=...
Limit is 1–50; responses exclude images, draft payloads and history. Company reads check studio
membership and manager company scope. No customer owner ID is accepted from browser input.

Important compatibility limit: the existing agency studio still writes its JSON workspace and
retains the 100-profile limit. Normalized records are a transactional projection at this stage.
Per-profile company writes, independent company memberships and the large-company UI are the
next migration step. Do not advertise 10,000-person production capacity yet. The automated
10,000-row test checks bounded reads only; it does not establish concurrent traffic capacity.

## Personal save and publishing boundary

/api/personal is restricted to the registered studio owner's authenticated context.
Each account key is derived from the authenticated ID, with one stable server-generated card ID.
The strict request accepts only version, action and doc. Saves are optimistic and atomic with
published views. Draft changes cannot update the public snapshot until Publish is requested.
Unpublishing retains the card ID. Personal publication ownership is namespaced separately from
the agency workspace, so saving company cards cannot delete a personal published card.
Personal writes have an origin check, a 64KB JSON limit, 20-block limit, schema validation and
30 attempts per account per minute. On a conflict, autosave stops and the UI offers a guarded reload.
Other failed saves do not trigger an automatic retry loop.
Customer image uploads are rejected server-side, including data images and gallery blocks.
This is a restriction, not an antivirus scanner. Full upload quarantine/scanning and wider abuse
controls are required before any public signup.

## Pricing

Individual: R499 once off including one stainless steel card or wristband; R400/year or R35/month.
Company: R999 setup + R300/person including one NFC item per person; R25/active profile/month.
Company package range: 5–10,000 people. The calculator can quote the range; current editor capacity
is still 100 until the later company rollout. Delivery, tax, maintenance start and proration terms
remain unconfigured. No automatic billing has been added.

## Verification and remaining work

Run the build, model tests, hosted integration tests, team-access tests,
customer-foundation integration tests, typecheck and offline HTML test.
Foundation tests exercise authorization, strict ownership inputs, separate drafts/public snapshots,
optimistic saves, rollback, forbidden uploads, origin checks, idempotent backfill, manager isolation,
literal search escaping, 10,000-row bounded pagination and save throttling.

There is no available browser interaction tool in this environment. The owner must smoke-test
the editor interactions after deployment. Real second-account sign-in, physical NFC, iPhone
contact import, full load testing, automated backup/restore operations and public-abuse controls
remain pending. Existing earlier release details follow.

---

# Ascend Digital Cards version 0.5 — owner and manager access

## Current status

Hosting is live at https://ascend-digital-cards.snugloach66.chatgpt.site. The owner has confirmed online profile persistence, public profile access and Android contact import. Public card routes are enabled; the dashboard is restricted to the owner and explicitly configured manager. Physical NFC testing is pending until a compatible phone and writable tag are available.

The owner email allowlist has been configured as a secret runtime setting in the registered Site. The Worker denies management access when that configuration is missing. No password or deployment credential is included in this package.

## Separate owner and manager sign-in in version 0.5

Use /login to sign in through the existing ChatGPT identity integration. Each person uses their own account. The owner is configured by the existing ADMIN_EMAIL secret and retains full control. No separate password store, source editor access or invitation emails are introduced.

In Settings → Team access, the owner can configure one manager's exact ChatGPT email, enable or disable access, select specific companies and toggle team/profile editing, company/group branding and publication permissions. Granting publication also permits unpublishing, archiving and restoring public revisions for assigned companies. Creating companies, permanently removing records, changing account access, full backups, global reusable libraries and NFC assignment management remain owner-only.

The manager's first sign-in binds the grant to the stable authenticated user ID. Changing the email clears that binding; changing companies or permissions increments an access revision. Only assigned company, group and profile data is returned to the manager. The manager's changes merge into the owner's canonical workspace and preserve unassigned clients and existing record order. Writes validate permissions and recheck membership revision inside the atomic save transaction. Conflicting workspace versions and revoked in-flight saves are rejected.

Migration 0002_team_access.sql adds owner identity and manager membership tables and preserves the existing workspace. Apply it after the first two migrations. Manager access remains unconfigured until the owner saves the intended email, companies and permissions. Access configuration is separate from workspace backup JSON.

Automated integration checks cover identity binding, company isolation, read/write/publish permissions, owner-only access configuration, attempted record removal, stale saves, in-flight revocation, account replacement and migration preservation. Owner/manager browser sign-in with a second real account still requires a live smoke test.

## Team onboarding in version 0.4

Open Profiles → Import team CSV. Download the example template or paste UTF-8 CSV with name, role, email, phone and website columns. Name is required; the other columns are optional. Select one company, optional matching group and starting template, then review every row before saving.

Quoted commas, escaped quotes, embedded newlines, CRLF and UTF-8 BOM are supported. Imports are limited to 256 KB, 100 file rows and the existing 100-profile workspace capacity (including archived profiles). Phone values should be preserved as text, including a country code. Unknown or duplicate headers, invalid contact fields, mismatched columns, foreign groups and duplicate people within the selected company block the whole import.

Import creates private drafts only, saves them with the workspace's existing conflict protection and records one activity entry. Existing profiles and published revisions are preserved. No NFC links are created automatically and the uploaded CSV is not stored.

## Testing status

Automated checks cover CSV parsing and errors, file/row/capacity bounds, company/group ownership, duplicate detection, immutable inputs, private draft creation, inherited branding and the existing hosted authorization/publication/rollback behavior. Physical NFC and iPhone contact import remain unverified. The current environment cannot perform browser interaction QA; the new import UI needs an owner browser smoke test after deployment.

## What is implemented

- Owner and company-scoped manager dashboard, using trusted Sites identity, an owner email allowlist and server-enforced manager permissions.
- D1 workspace saving with version checks that reject conflicting browser-tab saves.
- Separate public read records containing only explicitly published card documents and enabled NFC assignments.
- Anonymous profile pages at `/p/{profileId}`, contact downloads and temporary NFC redirects at `/n/{token}`.
- Atomic updates of the private workspace and public read records. A failure rolls back the whole save; a stale save cannot alter public cards.
- Immediate public-link revocation on a successful save that disables an NFC card, unpublishes a profile or archives it. Public responses are not cached.
- Existing company logos, portraits, cover photos, backgrounds and custom sections remain supported.
- Restoring a local backup explicitly disables public flags. Imported demo revisions remain private until republished online.

The offline `START-HERE.html` remains a local demo and cannot put cards online. It saves only in the current browser. Export a backup from your existing dashboard before opening it from a different folder.

## Run and verify locally

Use Node 24 and install dependencies from the source folder:

```sh
npm install
npm run build
npm test
npm run typecheck
npm start
```

The local preview server binds to `127.0.0.1:5189`, uses a local SQLite database, and supplies a test identity only inside that development server. The hosted Worker does not contain a test identity bypass.

The source entry points are `app/entry.tsx`, `app/workspace.tsx`, `worker/hosted-platform.js`, `lib/model.ts` and the shared card renderer. The build produces `dist/server/index.js` and its deployment manifest. Images are embedded for this pilot; the current workspace size budget remains in place. Cloud object storage is still a separate scaling milestone.

The original workspace and public-view migrations are: `drizzle/0000_workspace.sql` and `drizzle/0001_public_views.sql`. Do not modify either after applying them. The second adds a save token and indexed public-view table. Every successful save uses three SQL statements in one batch, regardless of the number of public cards.

## Deployment workflow

1. Read the existing `.openai/hosting.json` and retain its registered project identity. Do not create another Site.
2. Use the Sites connector to obtain fresh source access. Keep credentials in memory and send them to its supported source helper through stdin.
3. Open and synchronize the checkout using the Sites source workflow. Build the current source, run the checks and package the generated Worker with both migrations.
4. Preserve the current public audience for updates. Verify owner sign-in, database saving and persistence. The ADMIN_EMAIL runtime setting is required; do not trust caller-supplied headers outside Sites dispatch.
5. Public access permits anonymous card routes. The dashboard and management API remain restricted to the owner.
6. Verify the published card and its contact download from a signed-out browser. Confirm that anonymous and unrelated signed-in users cannot read or modify the workspace.
7. Restore the local backup into the online dashboard, save it, and explicitly republish only the profiles the owner wants public.

No live URL should be reported until the native deployment result succeeds. No public card should be claimed accessible until checked without owner authentication.

## NFC and QR acceptance after deployment

Use a fictional test profile first. Publish it, register and assign a card, then save the workspace. Open the `/n/` URL and scan its downloaded QR on an iPhone and an Android phone without a ChatGPT sign-in. Verify the correct profile, company logo, portrait and contact values; test phone, WhatsApp, email and contact import. Record those results rather than assuming a QR image guarantees a successful scan.

Encode a sample NFC tag with its assigned HTTPS `/n/` URL, read back the stored URL and physically tap it on both supported devices. Disable the assignment and save; both the NFC URL and its QR should stop resolving. Re-enable and save; confirm the same physical tag resolves again. Unpublish and save; direct profile and contact URLs must stop working. Reassign only through the owner dashboard and verify the new destination.

Physical phone/NFC testing and live browser checks are pending. Choose a permanent domain before encoding customer cards at scale.

## Confirmed checks

Integration checks cover owner authorization, absent configuration, anonymous published-card reads, private imported revisions, snapshot isolation, vCards, NFC routing and revocation, unsafe input, stale-save publication gating and transactional rollback. Model checks cover the final prices, image inheritance and backup compatibility. Generated local HTML script boundaries and syntax are checked. Browser UI verification remains limited by this environment's network access.

No paid hosting component, domain or NFC stock has been purchased. The original free-hosting target still applies within service allowances.
Operational rollback note: once a workspace has saved compact image references, older pre-v0.8 Workers cannot read that stored representation directly. Prefer a forward fix; rolling back application code requires first hydrating that workspace to inline JSON from a verified export. The additive migration alone does not rewrite existing payloads.
