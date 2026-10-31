# Prather Software LLC website

Astro and TypeScript website for [prathersoftware.com](https://prathersoftware.com), presenting client software engineering alongside independent software and game publishing, including NinjaDawg Studios. Imported from the supplied Milestone 2 archive and extended on `feature/milestone-2-website`. The original repository README title is incorporated here; the initial Git history is preserved.

## Local development

Use Node 24 LTS (`nvm use`) and npm. Local validation also works on the installed Node 25 runtime. Astro was upgraded from the archive's Astro 5 range to patched Astro 7 after the initial dependency audit found security advisories. The lockfile is committed.

```sh
npm ci
npm run dev
```

Astro serves the public site. It does not implement the contact API. To exercise the Cloudflare runtime locally, build first and run Wrangler:

```sh
npm run build
npm run worker:dev
```

Contact remains unavailable by default. Local environment examples contain configuration placeholders only. Never put real credentials into tracked files.

## Verification

```sh
npx playwright install chromium firefox webkit
npm run verify
```

`verify` runs Astro and Worker type checks, a static build, contact security unit tests, local link and sitemap checks, local Worker runtime checks, isolated product fixture builds, browser/WCAG checks in Chromium at 375/768/1440 px, Firefox at 1440 px, and Playwright WebKit at 375 px, plus a 320 px overflow check, and Wrangler packaging dry runs for staging and production. `npm run test:e2e` expects an existing `dist/` build and starts Astro preview automatically. The active-form browser fixture builds to ignored `.test-dist/`; Turnstile and mail responses are mocked, and the production `dist/` remains disabled. GitHub Actions runs these gates and an advisory audit on pushes and pull requests. It has no deployment job and needs no deployment credentials.

Automated accessibility checks do not establish complete WCAG conformance. Manual assistive technology review, actual Safari, and real device coverage remain unverified.

## Structure

- `src/layouts`, `src/components`, `src/styles`: shared design system, navigation, metadata, reusable page sections.
- `src/pages`: static page routes, collection detail templates, sitemap and robots endpoints.
- `src/content.config.ts`, `src/content`: typed software/game collections. Only `published: true` entries generate public routes.
- `src/lib/contact.ts`, `src/scripts/contact.ts`: shared validation/categories and accessible contact interaction.
- `worker/`, `wrangler.jsonc`: a small Cloudflare Worker serving Astro's `dist/` assets and `/api/contact`.
- `tests/`, `scripts/`: security, browser, accessibility, link and publication-gate regression checks.
- `docs/cloudflare-staging.md`: environment, Turnstile, mail delivery, and staging checklist.

The site remains static-first. Plain CSS and small browser scripts keep the design maintainable without a UI framework or unnecessary Tailwind dependency. No database, R2 bucket, analytics, or tracking library is needed for this milestone. An Astro server adapter is unnecessary: Cloudflare serves the generated static assets and the standalone Worker handles the contact route.

## Content and publication

Research and personal portfolio entries have been removed at the owner’s request. The website focuses on client software services and independent games/apps. No clients, testimonials, staff, product releases, pricing, or partnerships have been invented. The owner-confirmed catalog lists Quest Theater under Software and Promenade, Rick Dangerman (& the Cuboids) Remastered, and Floor 13 under Games. All four products are unreleased. Quest Theater is marked Coming soon with a planned release week of November 2–8, 2026; the other three are In development. Prices and official store links remain unannounced on the site. Planned support is separate from current platforms, and Rick Dangerman’s controller/console plans remain conditional on success. Draft collection entries default to unpublished; published releases require an HTTPS store link, verified pricing (including Free), and platform metadata. Test products exist only in an automatically cleaned temporary directory.

The geometric lettermark and social graphic are provisional identity assets, not a claim of finalized branding. Founder information and the NinjaDawg label relationship come from the supplied source.

## Contact and deployment gates

The contact implementation validates and limits requests server-side, checks same-origin submissions, verifies Turnstile action and hostname, uses a native Cloudflare rate-limit binding, and submits through the fixed Gmail API using the owner-selected Google Workspace account. A successful response requires an accepted provider response with a message ID; acceptance does not imply inbox delivery. Automated tests mock external providers and do not prove real delivery.

The UI, server enable flag, and delivery-verification flag default off. Configure real Turnstile keys/allowed hosts, a verified sender and recipient, and private environment secrets; verify a real accepted message and token replay rejection in staging before activating the form. Gmail authorization uses a dedicated Internal OAuth client with only the send-mail scope. No new sending-service subscription is required. Follow [the Google Workspace guide](docs/google-workspace.md); Google consent and a genuine staging delivery/replay test are still required.

The verified Cloudflare account is pinned in Wrangler configuration. Cloudflare app authentication and Wrangler CLI authentication are separate. The default target is staging.prathersoftware.com with indexing disabled. The explicit `production` environment targets `prather-software-website`, serves `prathersoftware.com`, and redirects `www` to the HTTPS apex. Contact remains disabled in both environments. The separate `privacy.prathersoftware.com` Worker and email DNS must be preserved. The owner authorized the initial production launch on October 29, 2026; future deployments still require authorization. Follow [the production runbook](docs/production.md) and [the staging guide](docs/cloudflare-staging.md). Contact/privacy text and retention practices must match the selected live configuration before form activation.

The website is live at [prathersoftware.com](https://prathersoftware.com). See [production operations](docs/production.md) for the deployed commit/version, live checks, preserved privacy/email services, and the host-specific Cloudflare analytics exclusion. Production Turnstile is configured, with its secret stored in the Worker and public widget metadata in `ops/turnstile-widgets.json`. The fixed destination `contact@prathersoftware.com` is verified and staging Turnstile is also provisioned. Contact activation still requires sender authorization for the selected provider and real staging acceptance/inbox/replay verification. No paid service has been purchased. See [the verification record](docs/milestone-2-verification.md) for tested scope and remaining checks.
