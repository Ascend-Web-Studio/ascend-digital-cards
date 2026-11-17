# Ascend Digital Cards (v0.9.1)

A full-stack digital business card, company portal, and identity management platform built on **Vinext**, **Cloudflare Workers**, **Cloudflare D1**, and **Drizzle ORM**.

## Platform Architecture & Custom Modules

Built by **Ascend Web Studio**, this platform extends the Cloudflare Vinext edge architecture into a multi-tenant digital identity solution featuring:

* **Modular Edge Worker Architecture (`worker/`):** Dedicated worker modules handling company portals (`company-portal.js`), customer foundations (`customer-foundation.js`), personal profile access (`personal-access.js`), workspace media (`workspace-media.js`), and GDPR/POPIA-compliant profile deletion (`profile-deletion.js`).
* **Multi-Method Authentication & Staging Probes (`worker/staging-auth.js`, `app/`):** Supports owner-only staging verification, Google OAuth, Email OTP sign-in flows, and dispatch-owned ChatGPT/SIWC authentication headers with strict Cloudflare redirect handling.
* **Relational Edge Persistence (`db/`, `drizzle/`):** Type-safe SQL schema management and local/production D1 migrations powered by Drizzle ORM.
* **Offline & Cross-Platform Delivery (`offline-demo/`, `scripts/`):** Includes a standalone offline fallback demo, automated image controls (`add-image-controls.mjs`), and cross-platform build/packaging pipelines (`build-platform.mjs`, `package-delivery.ps1`).
* **Automated Verification (`tests/`):** Session verification and staging redirect test suites.

---

## Development & Runtime Reference (Vinext / Cloudflare D1)

### Prerequisites
- Node.js `>=22.13.0`
- Portable: Windows, macOS, or Linux (no Bash required)
- Git and `tar` for publishing archives

### Quick Start & Diagnostic Commands
- `npm run install:ci`: Perform the locked dependency install
- `npm run dev`: Start the Vite/Vinext development server (defaults to port `5173` with HMR)
- `npm run build`: Build the deployable Sites & Worker artifact
- `npm run start`: Preview the built Worker locally on `127.0.0.1` with D1/R2 state sharing
- `npm run db:generate`: Generate Drizzle SQL migrations after schema changes

### Local D1 Migrations
To apply pending Drizzle migrations to your local `.wrangler/state` preview database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
