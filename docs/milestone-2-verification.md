# Milestone 2 verification record

Latest full local verification passed on November 4, 2026 with Node 24.22.1, Astro 7.4.4, Wrangler 4.156.0, and Playwright Chromium, Firefox, and WebKit. CI targets Node 24 LTS on Ubuntu. Fixed source `ad4ba542b60d79a8d3df7a3be25df16953511d42` passed both [PR CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41855415137) and [push CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41855407358).

## Implemented

- Accessible responsive Home / Services / Products / About / Contact navigation and a branded 404 page.
- Owner-supplied logo and reusable emerald green/near-black/white design system, homepage business and publishing sections, four engineering categories, founder pages, collection-driven software/game catalogs and detail templates.
- Page-specific descriptions, canonical URLs, Open Graph/Twitter image metadata, Organization structured data, sitemap and robots.
- Separate staging/production Cloudflare Static Assets Worker configurations and gated contact service with bounded input, same-origin checks, Turnstile action/hostname verification, hashed-IP rate limiting, and provider-confirmed acceptance.
- Owner-confirmed Quest Theater, Promenade, Rick Dangerman (& the Cuboids) Remastered, and Floor 13 listings with separate planned-support notes and owner-confirmed unreleased statuses (Quest Theater targets November 2–8, 2026); client services explicitly include SaaS, server support, AI integration, and contracted ongoing service.
- Lockfile, formatter, strict type checks, regression tests, and GitHub Actions quality workflow. No deploy or DNS job exists.

## Local checks

- Dependency installation succeeds; `npm audit` reports zero vulnerabilities for the installed lockfile.
- Astro validation: zero errors, warnings, or hints in source diagnostics; Worker TypeScript passes.
- Current build targets 14 HTML pages: 13 public routes and a branded 404. Research/personal portfolio routes have been removed and are covered by 404 regressions.
- 95 unit tests cover production indexing/canonical redirects and contact security, including missing configuration, method/content/origin checks, rate limits, size caps, invalid fields, honeypot, failed/replayed verdicts, action/host mismatch, provider rejection/missing receipts, accepted-provider semantics, Gmail OAuth/send failure handling and safe MIME, PKCE/state/offline authorization/credential-storage security, redirect rejection, and bounded diagnostics that exclude provider bodies, error messages, and inquiry data.
- 376 local references and generated sitemap routes resolve. Temporary content fixtures exercise software/game release details, catalogs, sitemap inclusion, explicit/default draft exclusion, unreleased coming-soon availability, and invalid release URL/pricing rejection.
- 180 browser tests cover all 13 public routes in Chromium at 375/768/1440 px, Firefox desktop, and Playwright WebKit mobile, 320 px overflow on key pages, keyboard navigation, focus, dropdown dismissal, JavaScript-disabled navigation, reduced motion, disabled/active contact states, original-logo loading, centered blurred hero media, and optional GIF pause/play, reduced-motion/no-JavaScript fallback, and failed-image recovery. Axe checks use WCAG A/AA tags including 2.2 rules. Active contact uses mocked Turnstile and email responses in an isolated build.
- Local workerd runtime verifies staging and production static pages, indexing policy, 404 responses, contact method/unavailable states, robots, and CSP/security headers. A separate isolated contact fixture constructs actual workerd Requests before returning mocked upstream responses, covering four cases: provider acceptance and redirect rejection at Siteverify, token refresh, and Gmail send. Negative controls restoring the old unsupported redirect mode fail as expected. These checks send no real email. Wrangler dry runs package both environments and assets without deploying.
- Repository checks find no tracked private environment files or common credential patterns. This is a basic pattern scan, not proof against all possible secret formats.

## Not verified or intentionally deferred

- Actual inbox placement. Google sender authorization, real staging fresh-token acceptance and immediate token replay rejection, and a real ordinary production-form provider acceptance are verified. Production collection is active under the owner's existing authorization; inbox receipt still awaits owner confirmation. Staging is publicly accessible with noindex and has been restored to ordinary disabled assets; no Cloudflare Access policy is configured.
- Manual screen-reader testing, physical-device testing, actual Safari/VoiceOver coverage, and a complete manual WCAG 2.2 AA audit. Automated checks alone do not establish conformance.
- Research and personal portfolio entries were removed at the owner’s request; no client case studies are claimed.
- The homepage checkerboard is a deliberate placeholder; a final GIF and static still remain to be supplied. Confirmed release availability/store links/pricing and operational privacy/retention review remain pending.
- The owner authorized production launch on October 29, 2026. Deployment and live verification are recorded in [production operations](production.md). Staging stays noindex; successful production pages allow indexing.

See [Cloudflare staging](cloudflare-staging.md) for the remaining setup and verification sequence. The release CI passed before the authorized production launch. Live HTTP/build-parity and Chromium checks passed; deployment version, source commit, preserved privacy/email configuration, and remaining limitations are recorded in [production operations](production.md).

## Branding revision

The supplied logo is preserved byte-for-byte in `public/brand/` and displayed with a CSS whitespace crop. Header, footer, favicon, social sharing, theme color, and shared page accents now use the green/near-black/white identity. Homepage text is large, centered semantic HTML above a separately blurred checkerboard image with a dark readability overlay. `src/data/hero.ts` provides one location for the static image and future GIF path; no real animation is published yet.

The full verification and advisory audit passed after the revision. Desktop/tablet/mobile screenshots were inspected, including logo completeness and hero readability. Automated color-contrast and keyboard checks passed across the public routes. Browser fixtures exercised the optional GIF through the real bundled script without adding test media to production content. The owner subsequently approved production deployment. The revision was deployed as version `f3d1ff4b-4dbf-4e09-9b30-92fecaa7c10a`, with all 13 public pages and nine assets matching that release build and responsive live browser checks passing. Privacy hosting and email DNS were preserved. Deployment details are recorded in the production runbook.

## Supplied diamond icon and activation preparation

On November 3, the owner supplied the exact diamond-P icon for navigation and browser branding. Its original PNG is preserved unchanged; optimized 32px/180px variants and compact SVG wrappers use the same artwork. The header uses the 180px thumbnail at 44px alongside the wordmark. New asset paths avoid the previous favicon cache. The updated branding browser check covers the decorative navigation icon as well as both wordmarks, and layouts were inspected from 320px through 1440px.

The full local suite passed again: 88 unit tests, 180 browser tests, 376 references, both local Worker environments and packaging dry runs, plus a zero-vulnerability advisory audit. Both [PR CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41725745566) and [push CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41725736620) passed. That icon release deployed production source `20aa799` as version `3bf9ee4d-e56b-4d41-83d8-0e71d23129b2`. Live parity passed for 13 pages and 13 assets; responsive live browser checks verified the diamond header/favicon assets, navigation, selected accessibility rules, and the then-disabled contact state. Privacy hosting and Google mail DNS remained unchanged.

Manual production checks accept an explicit `--contact-enabled` mode. It verifies the enabled UI and real widget loading without submitting inquiries or inspecting tokens. That mode has now passed against the active production form; it does not prove inbox delivery. The subsequent contact verification below supersedes the icon release's pending authorization state.

## Google Workspace and real staging contact verification

The owner completed the Internal Google client and send-only consent. The three Gmail credentials are stored privately and remotely verified in the correct production and staging Workers; separate Turnstile secrets are preserved. Production now enables both server gates through deployment overrides and serves the enabled public form, under the owner's existing launch/contact authorization.

Real staging testing exposed Workers' unsupported `redirect: 'error'` mode, which fails during outbound Request construction. The fixed source uses manual redirect handling and rejects non-2xx responses, supported by actual runtime regression cases and negative controls. Verification-unavailable logs contain only fixed stage/reason categories and a bounded HTTP status, never provider data or inquiry content. See [Workers Request documentation](https://developers.cloudflare.com/workers/runtime-apis/request/).

At staging version `a679360b-e878-4a77-98db-4023c008ef33`, a real fresh-token inquiry returned HTTP 200 and its immediate replay returned the contact-verification HTTP 403 response. The success path requires a nonblank Gmail acceptance ID. Controlled version `d7fc431e-e69f-448e-8524-7afe44c3612a` repeated those results using the owner's primary mailbox, `mason@prathersoftware.com`, as recipient. The public contact address remains `contact@prathersoftware.com`, the same owner's Workspace alternate address. Primary addressing avoids Google's documented self-alias inbox behavior without adding mailbox-reading or settings permissions.

The active staging page also passed fresh Chromium checks at 375/768/1440 px: no overflow, enabled fields, expected staging key, real Turnstile script/frame loading, visible focus, and zero automated WCAG A/AA violations. Those read-only browser checks blocked all non-GET requests; they do not establish challenge completion or delivery. Real acceptance/replay evidence came from the separate controlled browser submission.

Staging was restored to ordinary disabled assets as version `692dbebf` (abbreviated; full identifier in [production operations](production.md)). The temporary probe is no longer published.

## Production contact activation

On November 4, source `4daf17776404ec355ca9005222a8f83fb7b77a99` was deployed as production Worker version `510d1a8e-e9be-43dc-89ca-960429e07278`. The ordinary production build has `PUBLIC_CONTACT_ENABLED=true` and the recorded production sitekey, with no probe assets. Both runtime gates were enabled explicitly at deployment; the checked-in defaults remain false. The [README production command sequence](../README.md#contact-and-deployment-gates) preserves the active configuration on future authorized releases. Omitting those overrides deactivates contact collection.

A fresh real inquiry identified as `PS-COM-20261104-01` was submitted through the ordinary production form and returned HTTP 200, requiring Gmail's acceptance message ID. No challenge token was read into tool or chat output. Live HTTP checks passed for all 13 public pages and 13 assets, expected indexing/security behavior, and preservation of the separate privacy service. Chromium checks at 375/768/1440 px passed layout, enabled-form/widget loading, navigation, and automated WCAG checks.

Actual inbox placement remains unconfirmed while owner mailbox access is unavailable. Provider acceptance and staging replay rejection are established; inbox receipt, manual assistive-technology coverage, and the other deferred checks above are not. This record does not mark the entire milestone fully verified.
