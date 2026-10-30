# Production operations

The owner authorized the initial launch to `prathersoftware.com` on October 29, 2026. Authorization covers this website and its apex/www routing; it does not authorize merging the open pull request or modifying the separate product privacy Worker.

## Targets and boundaries

- Cloudflare account: `901d7b0a79a15aaa0f84fbca1bbb2ad5`.
- Active zone: `b741c0e55de6f1334e70d87196676e02` (`prathersoftware.com`).
- Production: `wrangler.jsonc` environment `production`, Worker `prather-software-website`.
- Exact Custom Domains: `prathersoftware.com` and `www.prathersoftware.com`. The Worker redirects www and apex HTTP to the canonical HTTPS apex with status 308, preserving path/query.
- Default staging target: `prather-software-staging`, no public hostname configured and indexing disabled. No workers.dev or version preview URLs are enabled for either environment.
- Preserve `prather-software-privacy` / `privacy.prathersoftware.com`, Google MX/SPF/DKIM/verification records, and unrelated resources. Preflight found no existing apex/www website records to replace.

Successful production pages allow indexing; staging, API responses, and errors retain `X-Robots-Tag: noindex, nofollow`. The 404 page also has a noindex meta tag. Both environments retain CSP and other security headers.

## Release procedure

Use the committed lockfile and Node 24 LTS. Do not deploy unreviewed local files or enable the contact form during a site release.

```sh
npm ci
npm run verify
npm audit --audit-level=high
npx wrangler whoami
npx wrangler deploy --env production
```

`verify` includes local staging/production runtime checks and dry runs for both configurations. The app connector and Wrangler CLI authenticate separately. Wrangler OAuth may store credentials in the OS Keychain with `--use-keyring`; never copy connector tokens or paste credentials into chat. Use the verified account above. Adding Custom Domains requires Workers Routes Write for the zone as well as Worker deployment access. Cloudflare provisions DNS and certificates for the exact Custom Domains; do not add wildcard routes.

After deployment, verify HTTPS and all sitemap pages, static assets, canonical/OG metadata, robots/sitemap, www redirect, branded 404 status, security headers, production indexing, and contact unavailability. Check the existing privacy domain and its Worker metadata for unintended changes. Run `npm run test:production` against the deployed site and this exact `dist/` build. It compares all sitemap pages and non-HTML assets byte-for-byte, checks domain redirects and security headers, and sends one empty POST to confirm collection is disabled. It also prints the separate privacy page hash for comparison with the release baseline. This remote check is intentionally excluded from PR/local CI; update its disabled-contact expectation only after a separately verified activation. Record the deployed source commit and Cloudflare version ID below. A successful upload alone does not establish a working live site.

## Contact activation is a separate release

`PUBLIC_CONTACT_ENABLED` stays false at build time. Production `CONTACT_ENABLED` and `CONTACT_DELIVERY_VERIFIED` stay false; sender and recipient remain empty, and no provider credentials are configured. The contact page explains availability, and direct POST requests return 503 without calling external services.

Follow [the staging guide](cloudflare-staging.md) to configure separate Turnstile widgets, secrets, sender verification, privacy review, and a real accepted/inbox-tested message before activation. Mocked tests do not prove email delivery. No paid provider account has been created.

## Rollback

Inspect `npx wrangler deployments list --env production` and identify a verified prior version before using `npx wrangler rollback --env production <version-id>`. A rollback does not roll back unrelated resources or DNS. The first release has no prior website version: restore only this site's exact routing if an incident requires taking it offline; preserve privacy and email services. Production changes require user authorization.

## Launch record

Pending deployment and live verification. Do not treat this runbook as proof that the domain is live.

## References

- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Workers authorization](https://developers.cloudflare.com/workers/authorization/workers/)
