# GitHub and Cloudflare migration

Status: staging sign-in probe prepared. The application itself remains locked pending identity mapping and data migration.

Imported on 7 November 2026 from the local Ascend Digital Cards checkout. The last Sites source commit was `50877bbbdc51cca86ed79dacbcdf9111f4590a5c` (0.9.0). This snapshot includes the locally tested, not yet deployed 0.9.1 archived-profile deletion feature. The import is a source snapshot; earlier Git history remains in the original checkout.

## Runtime

`npm ci` installs dependencies. `npm run build` bundles the React UI and Worker into `dist/server/index.js`, generates model tests, and regenerates the offline demo. Run `npm test` after the build. SQL migrations are in `drizzle/`.

The application uses a Cloudflare Worker with a D1 binding named `DB`. `wrangler.json` targets only `ascend-digital-cards-staging` and the separate staging D1 database. Existing Sites manifests are retained for reference and are not Cloudflare account configuration.

## First staging deployment

In Workers Builds, use the project name `ascend-digital-cards-staging`, build command `npm run build && npm test && node --test tests/cloudflare-staging.test.mjs`, and deploy command `npx wrangler deploy`.

The entrypoint `worker/cloudflare-staging.js` keeps dashboards, APIs, public cards and NFC redirects locked (HTTP 503). `/healthz` continues to return `status: locked` and `applicationReady: false`. No environment flag or identity header enables the application.

When staging Auth variables are configured, `/login` serves a separate sign-in probe with Google OAuth (PKCE) and 8-digit email OTP through pinned Supabase JS. `/auth/callback` exchanges the OAuth code; the SDK stores sessions and PKCE state in the current tab's session storage. Access and refresh tokens are not written to application logs or URLs. The OAuth code is removed from the address bar. This browser session design is limited to the probe and does not implement authenticated dashboard navigation.

`/auth/session` verifies the bearer session against the fixed Supabase project's `/auth/v1/user` endpoint and accepts only a confirmed, non-anonymous account with the staging owner's email. Client-supplied identity headers and editable metadata are ignored. All responses use `no-store`; the sign-in page has a restrictive CSP. Successful authentication grants only the sign-in test, never application access.

Staging owner: `ascendwebstudios777@gmail.com`, explicitly selected by the owner. This is not an automatic replacement for the existing Sites owner ID. Preserve the old ID in an explicit, reviewed mapping when importing live data.

Sign in with Google first to create the staging Auth account. Email OTP requests use `shouldCreateUser: false`; then test codes with that same address. The Magic link or OTP template must include `{{ .Token }}`. SMTP and Google OAuth credentials are configured only in Supabase, never in this repository. Live Google/SMTP acceptance remains to be verified manually. The built-in Auth service rate limits apply; the probe's one-minute resend timer is a UI convenience, not a security boundary. The publishable key can be used to reach the public Auth API directly, but successful Auth does not grant D1 access.

Only the Supabase URL, publishable key, staging owner email and probe-enable flag are stored as Wrangler variables. No service-role key, SMTP password, Google client secret or production data is included.

No migrations run automatically and the Worker does not read or write D1. Apply migrations to the named staging database in a subsequent step. Replace this locked entrypoint with a securely authenticated application entrypoint only after reviewing identity verification and authorization tests.

## Required before external deployment

- Replace Sites-managed authentication. The current Worker trusts identity headers injected by Sites and uses `/signin-with-chatgpt` and `/signout-with-chatgpt`. A public Worker must not trust identity headers supplied by a browser or caller. Implement verified authentication and preserve or explicitly map existing user IDs before data import.
- Obtain a complete live-data export, including workspace records, images, published revisions, memberships, personal accounts, manager access, owner identity and NFC assignments. A source-code import does not transfer this data. Verify backup coverage before relying on the in-app backup.
- Create a separate staging D1 database and apply the schema, including `0007_deleted_profiles.sql` for version 0.9.1. Test the deletion flow only with synthetic records.
- Choose a domain and plan compatibility for existing public-card and NFC URLs. The Sites-owned `.chatgpt.site` hostname does not move with this repository.
- Validate access controls, published cards, vCard downloads, persistence, media and data counts on staging before approving production cutover.

No production database records, credentials, local environment files or dependency directories are included in this source import. The current Sites deployment is unchanged.
