# Cloudflare staging runbook

Astro renders to `dist/`; the standalone Worker serves files through `ASSETS` and handles `/api/contact`. No SSR adapter, database, or R2 storage is needed. Configuration targets **prather-software-staging**, with no routes, custom domains, workers.dev, or version preview URLs. Nothing has been deployed. Every response carries `X-Robots-Tag: noindex, nofollow` for staging. Production requires a separately reviewed configuration and removal of that staging restriction.

## Local verification

Install dependencies and build, then use `npm run worker:dev -- --ip 127.0.0.1 --port 8787`. Generate bindings with `npm run worker:types`; type-check with `npm run check`; package with `npm run worker:dry-run`. These commands do not deploy or change DNS. A dry run does not prove remote bindings or email delivery.

Copy `.env.example` to ignored `.env` for build-time settings and `.dev.vars.example` to ignored `.dev.vars` for Worker-local settings. Never put secrets in `PUBLIC_` variables. Astro dev alone serves the frontend; `/api/contact` requires Wrangler. Keep the public form disabled until real security and delivery verification is complete.

## Staging configuration remaining

1. Confirm Cloudflare account and scoped authentication. Configure an approved staging hostname or enable workers.dev only after approval of that target. Published staging URLs are public unless protected with Cloudflare Access.
2. Set `ALLOWED_ORIGIN` to the exact staging HTTPS origin and `TURNSTILE_HOSTNAME` to its hostname. Other origins and mismatched Turnstile hostnames/actions are rejected. Production must never allow localhost. Review limiter namespace `1001` for account uniqueness before deployment: sharing it shares approximate counters in each Cloudflare location. Five attempts per minute are allowed per hashed visitor IP; users behind a shared network share this allowance. Native limits are approximate, per location, and not a global spending limit.
3. Create a staging Turnstile widget; set build-time `PUBLIC_TURNSTILE_SITE_KEY`; store `TURNSTILE_SECRET` through the approved secret manager. No widget or secret was created here. Use separate production and staging widgets/secrets.
4. The server adapter calls the fixed Resend HTTPS API with plain text, verified sender `CONTACT_FROM`, and single destination `CONTACT_TO`. Confirm the provider/account and verify its sender before activation. No account, purchase, paid service, or email DNS record was configured. Store `RESEND_API_KEY` as a Worker secret. Resend is an implementation candidate; a provider change affects the server adapter and tests.
5. Keep the public form disabled during direct staging tests with real fresh Turnstile tokens. `CONTACT_ENABLED=true` and `CONTACT_DELIVERY_VERIFIED=true` are operator gates, not automatic evidence. Set them only during an approved controlled verification session, confirm provider acceptance and actual inbox receipt, then test token replay, invalid origins, provider rejection, and rate limiting. Mock tests and dry runs do not verify live delivery.
6. After real verification, keep both server gates true; set `PUBLIC_CONTACT_ENABLED=true`; rebuild and review the accessible success/error states. Success means a successful provider status plus nonempty message ID; it does not guarantee inbox delivery. Uncertain acceptance never produces success. A timeout may occur after provider acceptance: never automatically retry.
7. Confirm the privacy notice, case-study publication permissions, provisional lettermark, and staging browser/accessibility results. Production deployment and DNS changes require explicit approval.

## Secrets and operational safety

Do not add routes for `prathersoftware.com` without explicit approval. Platform secrets stay out of source and public build settings. Standard `wrangler secret put` immediately creates and deploys a Worker version: only use it for a confirmed approved staging target. Prefer the version-secret workflow when a change must stay staged.

The Worker applies CSP, frame restrictions, MIME sniffing protection, and conservative referrer policy. Inline scripts and styles support Astro and JSON-LD; stronger CSP hashes can be added later. Application code never logs submission bodies, visitor emails, tokens, raw IPs, or provider responses. Cloudflare operational logs/traces are enabled; review platform access and retention before deployment. The limiter uses a hashed transient IP key; there is no application message database.

## References

- [Static Assets bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Turnstile server verification](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
