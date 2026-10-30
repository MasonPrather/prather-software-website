# Production operations

The owner authorized the initial launch to `prathersoftware.com` on October 29, 2026. Authorization covers this website and its apex/www routing; it does not authorize merging the open pull request or modifying the separate product privacy Worker.

## Targets and boundaries

- Cloudflare account: `901d7b0a79a15aaa0f84fbca1bbb2ad5`.
- Active zone: `b741c0e55de6f1334e70d87196676e02` (`prathersoftware.com`).
- Production: `wrangler.jsonc` environment `production`, Worker `prather-software-website`.
- Exact Custom Domains: `prathersoftware.com` and `www.prathersoftware.com`. The Worker redirects www and apex HTTP to the canonical HTTPS apex with status 308, preserving path/query.
- Default staging target: `prather-software-staging`, serving `staging.prathersoftware.com` with indexing disabled. No workers.dev or version preview URLs are enabled for either environment.
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

After deployment, verify HTTPS and all sitemap pages, static assets, canonical/OG metadata, robots/sitemap, www redirect, branded 404 status, security headers, production indexing, and contact unavailability. Check the existing privacy domain and its Worker metadata for unintended changes. Run `npm run test:production` and `npm run test:production:browser` against the deployed site and this exact `dist/` build. It compares all sitemap pages and non-HTML assets byte-for-byte, checks domain redirects and security headers, and sends one empty POST to confirm collection is disabled. It also prints the separate privacy page hash for comparison with the release baseline. This remote check is intentionally excluded from PR/local CI; update its disabled-contact expectation only after a separately verified activation. Record the deployed source commit and Cloudflare version ID below. A successful upload alone does not establish a working live site.

## Contact activation is a separate release

`PUBLIC_CONTACT_ENABLED` stays false at build time. Production `CONTACT_ENABLED` and `CONTACT_DELIVERY_VERIFIED` stay false; sender and recipient remain empty, and no provider credentials are configured. The contact page explains availability, and direct POST requests return 503 without calling external services.

Follow [the staging guide](cloudflare-staging.md) to configure separate Turnstile widgets, secrets, sender verification, privacy review, and a real accepted/inbox-tested message before activation. Mocked tests do not prove email delivery. No paid provider account has been created.

## Rollback

Inspect `npx wrangler deployments list --env production` and identify a verified prior version before using `npx wrangler rollback --env production <version-id>`. A rollback does not roll back unrelated resources or DNS. The first release has no prior website version: restore only this site's exact routing if an incident requires taking it offline; preserve privacy and email services. Production changes require user authorization.

## Launch record

Launched October 29, 2026 at approximately 9:32 PM America/New_York (October 30 at 01:32 UTC), with explicit owner authorization.

- Website: [https://prathersoftware.com](https://prathersoftware.com).
- Deployed source: `ca8b6bfe0e9576e01ad3f3d000e1650e8ef57fe0` on `feature/milestone-2-website`.
- Worker version: `99b44f09-0ace-4c8c-8f21-5954f4378009`, tag `ca8b6bf`.
- [Release CI](https://github.com/MasonPrather/prather-software-website/actions/runs/40985210550) passed on Node 24 Ubuntu before deployment. Full local verification passed: 38 unit tests, 165 browser tests, both runtime environments and dry runs, 429 local references, publication fixtures, and zero dependency audit vulnerabilities.
- Live `npm run test:production` passed for 17 sitemap pages and seven non-HTML assets, each matching the release build byte-for-byte. HTTPS/www redirects preserve path/query, public indexing is enabled, and security/404/contact-disabled responses match expectations.
- Live `npm run test:production:browser` passed in Chromium at 375/768/1440 px for Home, Quest Theater and Contact, plus product-dropdown navigation. No overflow, page/console errors, injected analytics script, or violations in the selected automated WCAG A/AA rules were detected. This remains automated coverage; manual screen readers, actual Safari and physical devices are unverified.
- Existing privacy URL still redirects to `https://privacy.prathersoftware.com/quest-theater/` and returns 200. Its pre/post SHA-256 is identical: `39f28d3ba5f389520791143ecffffbd557beb639ac9e47bf5bdcd850392ea4a6`. Its Worker ETag, modified timestamp, custom domain and DNS record remained unchanged. Google MX/SPF/DKIM/verification record IDs, contents and modified timestamps also remained unchanged.
- Contact remains disabled in the frontend and both server gates. No Turnstile widget, email account, sender credential, or paid service was created.
- [Pull request #1](https://github.com/MasonPrather/prather-software-website/pull/1) remains open and unmerged. Subsequent documentation and verification-script commits do not change the deployed application source.

### Host-specific analytics exclusion

The live browser check detected a Cloudflare-injected analytics beacon blocked by the site's CSP, even though the account's Web Analytics site list was empty and the zone RUM setting reported off. An explicit Configuration Rule now disables RUM for only `prathersoftware.com` and `www.prathersoftware.com`. The privacy subdomain does not match the expression.

The applied reference is [ops/cloudflare-main-site-rule.json](../ops/cloudflare-main-site-rule.json). Cloudflare ruleset ID: `cb552664bccf42a3979fe56f7403e55c`; rule ID: `e3d7fb6eaae3475dba96b2fd21fed483`; phase: `http_config_settings`. The phase had no entrypoint ruleset before creation. This external configuration is not managed by Wrangler or an automated deployment job. Read/reconcile the existing ruleset before future changes and update only this rule; preserve unrelated rules. The live browser regression command asserts the beacon stays absent.

## References

- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Disable RUM with Configuration Rules](https://developers.cloudflare.com/rules/configuration-rules/settings/#disable-real-user-monitoring-rum)
- [Workers authorization](https://developers.cloudflare.com/workers/authorization/workers/)

## Services/products cleanup and contact preparation

On October 29, 2026, the owner requested removal of research and personal-work entries and setup of a working inquiry form. Source `567de8f1ff98386939ad8cf28e865bb7d4da2115` is deployed to production as Worker version `6d3f97cc-ecf7-4114-b318-b6bd653450ab`. [Cleanup CI](https://github.com/MasonPrather/prather-software-website/actions/runs/40990291613) passed. The deployed content has 13 public sitemap routes and 14 HTML pages; all four retired work URLs return branded 404 and noindex. Live build-parity checks passed for all 13 pages and seven assets. The privacy page hash remains unchanged.

`staging.prathersoftware.com` now serves the separate `prather-software-staging` Worker and stays nonindexable. The existing RUM-exclusion rule now also matches that exact staging hostname, while excluding the privacy subdomain. The reference JSON is updated.

Separate managed Turnstile widgets are provisioned for production and staging, with no clearance cookies. Their secrets are stored only in each Worker’s `TURNSTILE_SECRET` binding. Public sitekeys and allowed domains are recorded in `ops/turnstile-widgets.json`; production server hostname checks remain restricted to the apex. Widget provisioning is not proof of a real successful backend verification: fresh-token and replay tests still need to run against the chosen mail transport.

The owner selected `contact@prathersoftware.com` as the fixed destination. Cloudflare destination ID `c5fa662b91c44e089fae03d8a677409b` was verified at `2026-10-30T02:11:53.653528Z`. This verifies the inbox address, not contact-form delivery.

Both server contact gates and the public form stay disabled. Cloudflare’s Email Sending dashboard requires Workers Paid on this account; no upgrade was purchased. The Email Routing wizard proposed replacing apex Google mail records and was closed without applying changes. Google MX/SPF/DKIM must remain intact. The existing Workspace mailbox can instead send through the Gmail API with a dedicated Internal OAuth client and `gmail.send` scope, or the existing Resend adapter can use a free account. Provider selection and authorization are pending. Before activation, complete real staging acceptance/inbox/replay checks and update the privacy notice to the selected provider.
