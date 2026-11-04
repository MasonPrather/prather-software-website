# Cloudflare staging runbook

Astro renders to `dist/`; the standalone Worker serves files through `ASSETS` and handles `/api/contact`. No SSR adapter, database, or R2 storage is needed. The default configuration targets **prather-software-staging**, at `staging.prathersoftware.com`, with workers.dev and version preview URLs disabled. Staging responses carry `X-Robots-Tag: noindex, nofollow`. The separately selected `production` environment enables indexing for successful public pages; API and error responses stay nonindexable. See [production operations](production.md) for the approved apex/www launch configuration.

## Verified account and existing routing

`wrangler.jsonc` pins account `901d7b0a79a15aaa0f84fbca1bbb2ad5`. Cloudflare app authentication and read access to this account and the active `prathersoftware.com` zone have been verified. The app and local Wrangler use separate authentication sessions; the standard deployment path requires `npx wrangler whoami` to succeed for this account. Wrangler OAuth can store its session in macOS Keychain with `--use-keyring`; never copy app tokens into source or terminal arguments.

The existing `prather-software-privacy` Worker serves `privacy.prathersoftware.com`. It has no workers.dev or version-preview URL enabled. Do not overwrite that Worker or its custom domain when deploying this repository. The production environment owns only the exact apex and www custom domains. Staging owns only `staging.prathersoftware.com`. The distinct staging target is `prather-software-staging`.

No account-level workers.dev subdomain is needed. The staging custom hostname is part of the owner-authorized contact setup. Staging is publicly accessible and nonindexable; it carries public website content and no embedded credentials.

## Local verification

Install dependencies and build, then use `npm run worker:dev -- --ip 127.0.0.1 --port 8787`. Generate bindings with `npm run worker:types`; type-check with `npm run check`; package with `npm run worker:dry-run`. Run `npx playwright install chromium firefox webkit` and `npm run verify` for the complete local gate, including browser compatibility and accessibility checks. Playwright WebKit is not a substitute for actual Safari, VoiceOver, or device testing. These commands do not deploy or change DNS. A dry run does not prove remote bindings or email delivery.

Copy `.env.example` to ignored `.env` for build-time settings and `.dev.vars.example` to ignored `.dev.vars` for Worker-local settings. Never put secrets in `PUBLIC_` variables. Astro dev alone serves the frontend; `/api/contact` requires Wrangler. Keep the public form disabled until real security and delivery verification is complete.

## Staging activation procedure

1. Confirm Cloudflare account and scoped authentication. Use the configured exact staging hostname. Published staging URLs are public unless protected with Cloudflare Access.
2. Set `ALLOWED_ORIGIN` to the exact staging HTTPS origin and `TURNSTILE_HOSTNAME` to its hostname. Other origins and mismatched Turnstile hostnames/actions are rejected. Production must never allow localhost. Review limiter namespace `1001` for account uniqueness before deployment: sharing it shares approximate counters in each Cloudflare location. Five attempts per minute are allowed per hashed visitor IP; users behind a shared network share this allowance. Native limits are approximate, per location, and not a global spending limit.
3. Create a staging Turnstile widget; set build-time `PUBLIC_TURNSTILE_SITE_KEY`; store `TURNSTILE_SECRET` through the approved secret manager. Production widget `0x4AAAAAAFsABGQE4Na23nbs` and staging widget `0x4AAAAAAFsCcoZSKLOD1l_B` are created, with secrets stored in the corresponding Workers; no secret is in source. See `ops/turnstile-widgets.json` for metadata. Use separate production and staging widgets/secrets.
4. The server adapter uses Google Workspace through the fixed Gmail API. The owner completed authorization for the primary sender `mason@prathersoftware.com` through a dedicated Internal OAuth client with only `gmail.send`. The three Gmail secrets are installed and remotely verified in both correct Workers. The current fixed recipient is the same owner's primary mailbox; the public alternate address remains `contact@prathersoftware.com`. Follow [Google Workspace setup](google-workspace.md) for protected reconnection and the self-alias delivery explanation. No credential values belong in chat, Git, or public build variables. No extra email subscription or DNS changes are needed.
5. Keep the public form disabled during direct staging tests with real fresh Turnstile tokens. `CONTACT_ENABLED=true` and `CONTACT_DELIVERY_VERIFIED=true` are operator gates, not automatic evidence. Set them only during an approved controlled verification session, confirm provider acceptance and actual inbox receipt, then test token replay, invalid origins, provider rejection, and rate limiting. Mock tests and dry runs do not verify live delivery.
6. After real verification, keep both server gates true; set `PUBLIC_CONTACT_ENABLED=true`; rebuild and review the accessible success/error states. Success means a successful provider status plus nonempty message ID; it does not guarantee inbox delivery. Uncertain acceptance never produces success. A timeout may occur after provider acceptance: never automatically retry.
7. Confirm the privacy notice, owner-supplied logo, and staging browser/accessibility results. Retire any temporary verification assets and restore ordinary staging assets after the controlled session. Production deployment and DNS changes require explicit approval; the owner has authorized the current contact setup, but activation still depends on actual inbox receipt.

## Secrets and operational safety

Do not add routes for `prathersoftware.com` without explicit approval. Platform secrets stay out of source and public build settings. Standard `wrangler secret put` immediately creates and deploys a Worker version: only use it for a confirmed approved staging target. Prefer the version-secret workflow when a change must stay staged.

For production deployment and secret commands, select only `--env production`; omit `--name`. Combining a name override with the environment can append a suffix and target an unintended Worker. Confirm the exact selected name is `prather-software-website` before applying changes, then recheck bindings and routes on that Worker. The intended account inventory is `prather-software-website`, `prather-software-staging`, and the preserved `prather-software-privacy` Worker.

The Worker applies CSP, frame restrictions, MIME sniffing protection, and conservative referrer policy. Inline scripts and styles support Astro and JSON-LD; stronger CSP hashes can be added later. Application code never logs submission bodies, visitor emails, tokens, raw IPs, or provider responses. Verification-unavailable diagnostics contain only fixed stage/reason categories and an optional bounded HTTP status. Cloudflare operational logs/traces are enabled; review platform access and retention before deployment. The limiter uses a hashed transient IP key; there is no application message database.

Outbound Siteverify, token refresh, and Gmail requests use `redirect: 'manual'` and reject non-2xx responses. Workers rejects the standard Fetch `error` redirect mode before making a request, so do not reintroduce it. The isolated workerd regression constructs actual runtime Requests before returning mocked upstream responses; acceptance and all three redirect rejection paths are covered, with old-mode negative controls verified to fail.

## References

- [Static Assets bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Turnstile server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Workers Request redirect modes](https://developers.cloudflare.com/workers/runtime-apis/request/)

## Current activation dependencies

Google client creation and send-only consent are complete. Separate Turnstile secrets and all three Gmail secrets are remotely verified on the correct staging and production Workers. Production's public form and both server gates remain off. The baseline From/To settings are `mason@prathersoftware.com`; `contact@prathersoftware.com` remains the owner's public alternate address. Google mail DNS and the separate privacy Worker are unchanged.

Fixed source `ad4ba542b60d79a8d3df7a3be25df16953511d42` was deployed for controlled staging verification as version `a679360b-e878-4a77-98db-4023c008ef33`. A real fresh-token inquiry returned HTTP 200, requiring Gmail's acceptance ID, and its immediate replay returned the contact-verification HTTP 403 response. Version `d7fc431e-e69f-448e-8524-7afe44c3612a` repeated acceptance and immediate replay rejection with the primary mailbox as recipient. Actual inbox receipt still awaits the owner's confirmation. Temporary probe assets are being retired; record the restored ordinary staging version in [production operations](production.md).

Google documents that messages to one's own alternate address can stay in Sent Mail or All Mail rather than the inbox. The controlled primary-recipient check addresses that behavior without requesting mailbox-reading or settings scopes; see [the Google setup state](google-workspace.md#current-state). Do not activate production until inbox receipt is confirmed.

Earlier setup history: Cloudflare Email Sending required a paid Workers plan on this account, and no purchase was made. The free Routing onboarding preview proposed replacing existing Google mail records, so it was aborted. The owner instead selected the existing Google Workspace Gmail API, with only `gmail.send` and no domain-wide delegation. Never reuse or extract connector credentials for the production Worker, and never put OAuth secrets or refresh tokens in chat or Git.
