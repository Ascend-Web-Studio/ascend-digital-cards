# Ascend Digital Cards version 0.2 company and profile images

The start-file packaging error that displayed JavaScript as page text has been corrected. A regression check now parses the generated HTML, verifies the script boundaries and syntax, and rejects code leaking into visible document text.

## New image controls

- Companies > Edit company: upload a company logo and optional default cover photo.
- Profiles > Edit profile > Profile: upload a portrait and adjust its vertical crop position.
- Profiles > Edit profile > Design: override the company cover photo or add a full-card background image.
- PNG, JPEG and WebP uploads up to 8 MB are decoded and optimised in the browser. Transparent logos are preserved. SVG is not supported.
- Card thumbnails, live draft previews and newly published revisions show these images. Changing a logo or photo does not rewrite earlier published snapshots; republish the relevant profile or group to update live revisions.
- Remove a personal cover override to restore the company cover. Removing a portrait restores the initials fallback.
- Backup exports include all images. Old backups without images remain compatible. Before moving to the new HTML file, export a backup from the old dashboard and restore it in the new one if your browser treats the new file location as a separate store.

Images are embedded in this local milestone. A 1.4 MB workspace limit protects the current pilot database and browser storage; saving reports an error and preserves on-screen edits if the limit is exceeded. A separate cloud media service is still required for larger image-rich teams. The upload controls and image schemas are implemented and checked; interactive crop/upload browser QA remains pending in this environment.

This is the first working implementation of Sevano's NFC business card platform. It includes a private dashboard, profile and company management, client groups, a visual block editor, reusable custom sections, published snapshots, NFC assignments and the confirmed pricing calculator.

## Try the local demo

Extract the delivery ZIP and open `START-HERE.html` in a modern browser. It is a self-contained demo of the card studio. No installation is required. Sample company and people are fictional.

The demo saves only in that browser through local storage. It is not connected to a hosting account, database, live NFC cards or payments. Browser restrictions can prevent saving; use Settings > Export full backup to preserve your work. Exports contain profile information, so keep them private. Do not use the unhosted demo for customer fulfilment.

Suggested walkthrough:

1. Open a demo profile through Edit profile.
2. Open Profile to change the name, role and contact details.
3. Add or drag a Custom section onto the phone preview.
4. Change its heading, colours, spacing and columns; add content boxes and HTTPS buttons.
5. Save it to the section library and insert a copy on another profile.
6. Save draft, then Publish to create a stable revision. Future draft changes do not change the published revision.
7. Create a company and group, add staff profiles and try a locked group colour.
8. Review Pricing, including annual/monthly Individual maintenance and the Team calculator.
9. Export a backup before closing or moving to another browser.

## Production source and local development

The source is a React and TypeScript app with a small Cloudflare Worker and a D1 database binding. The constrained visual editor uses typed blocks and structured custom boxes; GrapesJS and arbitrary HTML/CSS are not included in this milestone. This avoids allowing executable client-provided content while the core workflow is tested.

With Node 24 and npm installed, run these commands from the source folder:

```sh
npm install
npm run build
npm test
npm run typecheck
npm start
```

Open the printed local address. The preview server is bound to 127.0.0.1:5189. It uses a local SQLite database and injects a local test identity only in this development server. That identity injection is never in the hosted Worker.

The build embeds frontend assets into `dist/server/index.js`, an ES module exporting `fetch(request, env)`. `dist/.openai/hosting.json` retains the registered private Site identity and `DB` binding. The schema migration is `drizzle/0000_workspace.sql`. Its table corresponds to `db/schema.ts`; the initial SQL was authored and tested directly because the framework package installer was unavailable. Later migrations must be appended rather than changing an applied migration.

Canonical source files:

- `app/entry.tsx`: browser bootstrap and explicitly labelled offline demo adapter.
- `app/workspace.tsx`: dashboard, visual editor, forms, groups, library, NFC registry and pricing.
- `app/card-view.tsx`: shared draft and published card renderer.
- `app/studio.css`: responsive interface and card themes.
- `lib/model.ts`: schema validation, profile bindings, pricing and vCard formatting.
- `lib/qr.ts`: bounded byte-mode QR encoder for card URLs.
- `worker/platform.js`: authenticated workspace API, snapshot reads, NFC routing and asset delivery.
- `scripts/build-platform.mjs`: reproducible frontend and Worker build plus local HTML demo.
- `scripts/preview-platform.mjs`: local SQLite test server.
- `tests/model.test.ts` and `tests/platform.test.mjs`: model and persistence/security checks.

The source uses a single owner-scoped versioned workspace document for the pilot. This supports atomic group publication and optimistic concurrency. The larger relational model in the brief remains a subsequent migration, not an already implemented feature.

## Access and deployment status

A private Site was registered for this project. It has not been published. Source synchronization failed because the build environment could not reach the Git host. The deployment manifest must retain its existing opaque project ID; do not create a replacement Site when resuming.

The Worker trusts identity headers supplied by Sites dispatch and rejects requests without an authenticated user ID. Records are scoped by that ID. Keep the Site owner-private. A public card delivery service with explicit owner membership and public/private route separation must be completed before changing access or selling encoded NFC cards. Do not expose this Worker directly behind a proxy that allows callers to forge trusted identity headers.

When connectivity is restored, use the Sites source workflow to push the exact reviewed source, package `dist/` with its manifest and migration, and deploy a private version. The packaged source contains no repository token or service credentials. No live URL is claimed in this delivery.

## Confirmed pricing

| Package | Initial cost | Maintenance |
| --- | --- | --- |
| Individual | R499 once off | R400 per year OR R35 per month |
| Team | R999 per company plus R250 per person | R25 per active profile per month |

The Individual options are alternatives. Annual maintenance saves R20 against 12 monthly payments. A 10-person team has R3499 in initial setup/per-person charges and R250 monthly maintenance while all 10 profiles are active. The calculator quotes these prices; it does not collect money or issue invoices.

## Verified and pending

Build, TypeScript checking, model tests and direct Worker/SQLite integration checks pass. Verified scenarios include pricing, group colour inheritance, snapshot isolation, persisted saves, owner separation, stale-save rejection, origin validation, unsafe-URL rejection, contact download, NFC redirect resolution, disabling and archive revocation.

Browser visual verification could not complete: the browser could not reach the local preview. Actual NFC taps, printed QR scanning, accessibility interaction, mobile layout and the full drag-and-drop experience still require browser/device QA. The QR encoder is implemented, but physical scanning has not been verified. Do not treat this milestone as a production release.

Next milestone: verify the UI in a browser, complete private deployment and database migration, then add shared template editing, cloud media storage, validated CSV import, order/fulfilment tracking and public card access. HTML/CSS advanced editing, linked custom-section revisions, full relational storage and client logins remain later work.

No hosting subscription, domain, NFC inventory or paid service was purchased.

