# Milestone 2 verification record

Verified locally on October 29, 2026 with Node 25.8.1, npm 11.11.0, Astro 7.4.4, Wrangler 4.156.0, and Playwright Chromium, Firefox, and WebKit. CI targets Node 24 LTS on Ubuntu.

## Implemented

- Accessible responsive Home / Services / Our Work / Products / About / Contact navigation and a branded 404 page.
- Reusable crimson/black/white design system, homepage business and publishing sections, four engineering categories, attributed case-study overviews, founder pages, collection-driven software/game catalogs and detail templates.
- Page-specific descriptions, canonical URLs, Open Graph/Twitter image metadata, Organization structured data, sitemap and robots.
- Separate staging/production Cloudflare Static Assets Worker configurations and gated contact service with bounded input, same-origin checks, Turnstile action/hostname verification, hashed-IP rate limiting, and provider-confirmed acceptance.
- Owner-confirmed Quest Theater, Promenade, Rick Dangerman (& the Cuboids) Remastered, and Floor 13 listings with separate planned-support notes and owner-confirmed unreleased statuses (Quest Theater targets November 2–8, 2026); client services explicitly include SaaS, server support, AI integration, and contracted ongoing service.
- Lockfile, formatter, strict type checks, regression tests, and GitHub Actions quality workflow. No deploy or DNS job exists.

## Local checks

- Dependency installation succeeds; `npm audit` reports zero vulnerabilities for the installed lockfile.
- Astro validation: zero errors, warnings, or hints in source diagnostics; Worker TypeScript passes.
- Production build: 18 HTML pages, including four owner-confirmed product detail pages, three supplied work detail pages, and a 404 page.
- 38 unit tests cover production indexing/canonical redirects and contact security, including missing configuration, method/content/origin checks, rate limits, size caps, invalid fields, honeypot, failed/replayed verdicts, action/host mismatch, provider rejection/missing receipts, and accepted-provider semantics.
- 429 local references and generated sitemap routes resolve. Temporary content fixtures exercise software/game release details, catalogs, sitemap inclusion, explicit/default draft exclusion, unreleased coming-soon availability, and invalid release URL/pricing rejection.
- 165 browser tests cover all 17 public routes in Chromium at 375/768/1440 px, Firefox desktop, and Playwright WebKit mobile, 320 px overflow on key pages, keyboard navigation, focus, dropdown dismissal, JavaScript-disabled navigation, reduced motion, and disabled/active contact states. Axe checks use WCAG A/AA tags including 2.2 rules. Active contact uses mocked Turnstile and email responses in an isolated build.
- Local workerd runtime verifies staging and production static pages, indexing policy, 404 responses, contact method/unavailable states, robots, and CSP/security headers. Wrangler dry runs package both environments and assets without deploying.
- Repository checks find no tracked private environment files or common credential patterns. This is a basic pattern scan, not proof against all possible secret formats.

## Not verified or intentionally deferred

- Staging URL/access controls, Turnstile widget registration, real fresh-token/replay behavior, verified email sender, provider acceptance, and actual inbox receipt. Cloudflare account/zone and existing privacy routing were verified through the app connection. Contact remains disabled.
- Manual screen-reader testing, physical-device testing, actual Safari/VoiceOver coverage, and a complete manual WCAG 2.2 AA audit. Automated checks alone do not establish conformance.
- Case-study publication permissions and supporting artifacts. Supplied high-level research/employment facts are preserved and no client relationships are implied.
- Final brand assets, confirmed release availability/store links/pricing, operational privacy/retention review. The lettermark is provisional.
- The owner authorized production launch on October 29, 2026. Deployment and live verification are recorded in [production operations](production.md). Staging stays noindex; successful production pages allow indexing.

See [Cloudflare staging](cloudflare-staging.md) for the remaining setup and verification sequence. GitHub Actions results are available on the pull request once pushed.
