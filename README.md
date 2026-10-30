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

`verify` runs Astro and Worker type checks, a static build, contact security unit tests, local link and sitemap checks, local Worker runtime checks, isolated product fixture builds, browser/WCAG checks in Chromium at 375/768/1440 px, Firefox at 1440 px, and Playwright WebKit at 375 px, plus a 320 px overflow check, and a Wrangler packaging dry run. `npm run test:e2e` expects an existing `dist/` build and starts Astro preview automatically. The active-form browser fixture builds to ignored `.test-dist/`; Turnstile and mail responses are mocked, and the production `dist/` remains disabled. GitHub Actions runs these gates and an advisory audit on pushes and pull requests. It has no deployment job and needs no deployment credentials.

Automated accessibility checks do not establish complete WCAG conformance. Manual assistive technology review, actual Safari, and real device coverage remain required before production signoff.

## Structure

- `src/layouts`, `src/components`, `src/styles`: shared design system, navigation, metadata, reusable page sections.
- `src/pages`: static page routes, collection detail templates, sitemap and robots endpoints.
- `src/content.config.ts`, `src/content`: typed work/software/game collections. Only `published: true` entries generate public routes.
- `src/lib/contact.ts`, `src/scripts/contact.ts`: shared validation/categories and accessible contact interaction.
- `worker/`, `wrangler.jsonc`: a small Cloudflare Worker serving Astro's `dist/` assets and `/api/contact`.
- `tests/`, `scripts/`: security, browser, accessibility, link and publication-gate regression checks.
- `docs/cloudflare-staging.md`: environment, Turnstile, mail delivery, and staging checklist.

The site remains static-first. Plain CSS and small browser scripts keep the design maintainable without a UI framework or unnecessary Tailwind dependency. No database, R2 bucket, analytics, or tracking library is needed for this milestone. An Astro server adapter is unnecessary: Cloudflare serves the generated static assets and the standalone Worker handles the contact route.

## Content and publication

The three supplied portfolio entries describe **academic research or prior professional experience**, not Prather Software clients. Review publication permissions before expanding details. No clients, testimonials, staff, product releases, pricing, or partnerships have been invented. The owner-confirmed catalog lists Quest Theater under Software and Promenade, Rick Dangerman (& the Cuboids) Remastered, and Floor 13 under Games. All four products are unreleased. Quest Theater is marked Coming soon with a planned release week of November 2–8, 2026; the other three are In development. Prices and official store links remain unannounced on the site. Planned support is separate from current platforms, and Rick Dangerman’s controller/console plans remain conditional on success. Draft collection entries default to unpublished; published releases require an HTTPS store link, verified pricing (including Free), and platform metadata. Test products exist only in an automatically cleaned temporary directory.

The geometric lettermark and social graphic are provisional identity assets, not a claim of finalized branding. Founder information and the NinjaDawg label relationship come from the supplied source.

## Contact and deployment gates

The contact implementation validates and limits requests server-side, checks same-origin submissions, verifies Turnstile action and hostname, uses a native Cloudflare rate-limit binding, and submits through the fixed Resend API. A successful response requires an accepted provider response with a message ID; acceptance does not imply inbox delivery. Automated tests mock external providers and do not prove real delivery.

The UI, server enable flag, and delivery-verification flag default off. Configure real Turnstile keys/allowed hosts, a verified sender and recipient, and private environment secrets; verify a real accepted message and token replay rejection in staging before activating the form. Resend is an unconfigured implementation choice; no account, paid plan, or remote resource has been created.

No production DNS, custom domain, or deployment is configured by this change. Review [the staging guide](docs/cloudflare-staging.md) and obtain approval before production deployment or DNS changes. Contact/privacy text and retention practices must match the selected live configuration before activation.

See [the verification record](docs/milestone-2-verification.md) for tested scope and remaining production checks.
