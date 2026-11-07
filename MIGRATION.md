# GitHub and Cloudflare migration

Status: ready for an infrastructure-only staging deployment. The application itself remains locked pending replacement authentication and data migration.

Imported on 7 November 2026 from the local Ascend Digital Cards checkout. The last Sites source commit was `50877bbbdc51cca86ed79dacbcdf9111f4590a5c` (0.9.0). This snapshot includes the locally tested, not yet deployed 0.9.1 archived-profile deletion feature. The import is a source snapshot; earlier Git history remains in the original checkout.

## Runtime

`npm ci` installs dependencies. `npm run build` bundles the React UI and Worker into `dist/server/index.js`, generates model tests, and regenerates the offline demo. Run `npm test` after the build. SQL migrations are in `drizzle/`.

The application uses a Cloudflare Worker with a D1 binding named `DB`. `wrangler.json` targets only `ascend-digital-cards-staging` and the separate staging D1 database. Existing Sites manifests are retained for reference and are not Cloudflare account configuration.

## First staging deployment

In Workers Builds, use the project name `ascend-digital-cards-staging`, build command `npm run build && npm test && node --test tests/cloudflare-staging.test.mjs`, and deploy command `npx wrangler deploy`.

The entrypoint `worker/cloudflare-staging.js` deliberately serves only a setup-in-progress page (HTTP 503) and a `/healthz` response (HTTP 200, `status: locked`, `applicationReady: false`). It cannot be unlocked with environment variables or identity headers. The application bundle is built and tested, but is not served. This first deployment verifies repository integration and Worker provisioning, not login, database connectivity or application readiness.

No migrations run automatically and the Worker does not read or write D1. Apply migrations to the named staging database in a subsequent step. Replace this locked entrypoint with a securely authenticated application entrypoint only after reviewing identity verification and authorization tests.

## Required before external deployment

- Replace Sites-managed authentication. The current Worker trusts identity headers injected by Sites and uses `/signin-with-chatgpt` and `/signout-with-chatgpt`. A public Worker must not trust identity headers supplied by a browser or caller. Implement verified authentication and preserve or explicitly map existing user IDs before data import.
- Obtain a complete live-data export, including workspace records, images, published revisions, memberships, personal accounts, manager access, owner identity and NFC assignments. A source-code import does not transfer this data. Verify backup coverage before relying on the in-app backup.
- Create a separate staging D1 database and apply the schema, including `0007_deleted_profiles.sql` for version 0.9.1. Test the deletion flow only with synthetic records.
- Choose a domain and plan compatibility for existing public-card and NFC URLs. The Sites-owned `.chatgpt.site` hostname does not move with this repository.
- Validate access controls, published cards, vCard downloads, persistence, media and data counts on staging before approving production cutover.

No production database records, credentials, local environment files or dependency directories are included in this source import. The current Sites deployment is unchanged.
