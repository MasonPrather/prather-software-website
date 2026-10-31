# Milestone 2 verification record

Verified locally on October 29, 2026 with Node 24.19.0, npm 11.11.0, Astro 7.4.4, Wrangler 4.156.0, and Playwright Chromium, Firefox, and WebKit. CI targets Node 24 LTS on Ubuntu.

## Implemented

- Accessible responsive Home / Services / Products / About / Contact navigation and a branded 404 page.
- Reusable crimson/black/white design system, homepage business and publishing sections, four engineering categories, founder pages, collection-driven software/game catalogs and detail templates.
- Page-specific descriptions, canonical URLs, Open Graph/Twitter image metadata, Organization structured data, sitemap and robots.
- Separate staging/production Cloudflare Static Assets Worker configurations and gated contact service with bounded input, same-origin checks, Turnstile action/hostname verification, hashed-IP rate limiting, and provider-confirmed acceptance.
- Owner-confirmed Quest Theater, Promenade, Rick Dangerman (& the Cuboids) Remastered, and Floor 13 listings with separate planned-support notes and owner-confirmed unreleased statuses (Quest Theater targets November 2–8, 2026); client services explicitly include SaaS, server support, AI integration, and contracted ongoing service.
- Lockfile, formatter, strict type checks, regression tests, and GitHub Actions quality workflow. No deploy or DNS job exists.

## Local checks

- Dependency installation succeeds; `npm audit` reports zero vulnerabilities for the installed lockfile.
- Astro validation: zero errors, warnings, or hints in source diagnostics; Worker TypeScript passes.
- Current build targets 14 HTML pages: 13 public routes and a branded 404. Research/personal portfolio routes have been removed and are covered by 404 regressions.
- 88 unit tests cover production indexing/canonical redirects and contact security, including missing configuration, method/content/origin checks, rate limits, size caps, invalid fields, honeypot, failed/replayed verdicts, action/host mismatch, provider rejection/missing receipts, accepted-provider semantics, Gmail OAuth/send failure handling and safe MIME, and PKCE/state/offline authorization/credential-storage security.
- 304 local references and generated sitemap routes resolve. Temporary content fixtures exercise software/game release details, catalogs, sitemap inclusion, explicit/default draft exclusion, unreleased coming-soon availability, and invalid release URL/pricing rejection.
- 155 browser tests cover all 13 public routes in Chromium at 375/768/1440 px, Firefox desktop, and Playwright WebKit mobile, 320 px overflow on key pages, keyboard navigation, focus, dropdown dismissal, JavaScript-disabled navigation, reduced motion, and disabled/active contact states. Axe checks use WCAG A/AA tags including 2.2 rules. Active contact uses mocked Turnstile and email responses in an isolated build.
- Local workerd runtime verifies staging and production static pages, indexing policy, 404 responses, contact method/unavailable states, robots, and CSP/security headers. Wrangler dry runs package both environments and assets without deploying.
- Repository checks find no tracked private environment files or common credential patterns. This is a basic pattern scan, not proof against all possible secret formats.

## Not verified or intentionally deferred

- Staging URL/access controls, Turnstile widget registration, real fresh-token/replay behavior, verified email sender, provider acceptance, and actual inbox receipt. Cloudflare account/zone and existing privacy routing were verified through the app connection. Contact remains disabled.
- Manual screen-reader testing, physical-device testing, actual Safari/VoiceOver coverage, and a complete manual WCAG 2.2 AA audit. Automated checks alone do not establish conformance.
- Research and personal portfolio entries were removed at the owner’s request; no client case studies are claimed.
- Final brand assets, confirmed release availability/store links/pricing, operational privacy/retention review. The lettermark is provisional.
- The owner authorized production launch on October 29, 2026. Deployment and live verification are recorded in [production operations](production.md). Staging stays noindex; successful production pages allow indexing.

See [Cloudflare staging](cloudflare-staging.md) for the remaining setup and verification sequence. The release CI passed before the authorized production launch. Live HTTP/build-parity and Chromium checks passed; deployment version, source commit, preserved privacy/email configuration, and remaining limitations are recorded in [production operations](production.md).
