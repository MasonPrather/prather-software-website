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

Use the committed lockfile and Node 24 LTS. The verified contact form is now active. Preserve its explicit build settings and server flags during subsequent authorized releases; repository defaults remain disabled for local verification.

```sh
npm ci
npm run verify
npm audit --audit-level=high
npx wrangler whoami
PUBLIC_CONTACT_ENABLED=true PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFsABGQE4Na23nbs npm run build
npx wrangler deploy --env production --var CONTACT_ENABLED:true --var CONTACT_DELIVERY_VERIFIED:true
npm run test:production -- --contact-enabled
npm run test:production:browser -- --contact-enabled
```

`verify` includes local staging/production runtime checks and dry runs for both configurations. The app connector and Wrangler CLI authenticate separately. Wrangler OAuth may store credentials in the OS Keychain with `--use-keyring`; never copy connector tokens or paste credentials into chat. Use the verified account above. Adding Custom Domains requires Workers Routes Write for the zone as well as Worker deployment access. Cloudflare provisions DNS and certificates for the exact Custom Domains; do not add wildcard routes.

After deployment, verify HTTPS and all sitemap pages, static assets, canonical/OG metadata, robots/sitemap, www redirect, branded 404 status, security headers, production indexing, and active contact configuration. Check the existing privacy domain and Worker metadata for unintended changes. Run both production checks with `--contact-enabled` against this exact `dist/` build. They compare live pages/assets, check the enabled UI and real Turnstile loading without submitting an inquiry, and print the separate privacy-page hash. The default check modes expect disabled collection and send one empty POST; use them only after a deliberate disable. These remote checks are excluded from PR/local CI. Record the deployed source commit and Cloudflare version ID below. Upload success does not establish a working live site.

## Current contact configuration

The live build has `PUBLIC_CONTACT_ENABLED=true` and the recorded production Turnstile sitekey. Both production server gates are true, and the three Gmail secrets plus the existing production Turnstile secret are configured. The fixed sender and notification destination are the authorized Workspace primary address `mason@prathersoftware.com`. The public contact address remains its alternate address `contact@prathersoftware.com`; direct primary delivery avoids Gmail's self-alias Inbox suppression. Visitor email is used only as a validated Reply-To. The application has only `gmail.send` authorization.

Real staging and production submissions confirmed provider acceptance, and an immediate staging replay returned 403. Actual Inbox placement is still unconfirmed and must not be described as verified receipt. No paid provider account was created. Follow [the staging guide](cloudflare-staging.md) for future changes. Tracked configuration and example env files keep contact disabled; omitting the explicit activation flags or public build settings above will disable the form in a later deployment.

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

## Google Workspace implementation prepared

On October 30, 2026, the owner selected the existing Google Workspace account as the sender. The current application source replaces the unconfigured Resend transport with fixed Gmail OAuth refresh and send endpoints, strict acceptance checks, safe UTF-8 MIME and a shared delivery deadline. It also includes a loopback-only PKCE/state authorization helper and a selected-provider privacy notice. No extra runtime dependency or database was added.

Node 24 verification passed with 88 unit tests, 155 browser tests, 14 built HTML pages, 304 local references, both local Worker configurations and packaging dry runs, and zero dependency audit vulnerabilities. Real Google authorization and real Turnstile/mail acceptance/replay checks have not occurred. The Mac was locked; the owner said they will unlock it later. No Google Cloud project, OAuth client, or credential has been created, and no Gmail credentials are present in the Workers. The implementation may be staged with collection disabled; the production contact gates and public form must remain off until the real verification completes. See [Google Workspace setup](google-workspace.md) for the exact next steps and callback URI.

Gmail staging deployment completed: source `dabeecceaa1b788ce44ac03e08155150840c689f`, Worker version `bceaa153-8a13-4d2b-9ac8-cc6e464f66bf`. [CI passed](https://github.com/MasonPrather/prather-software-website/actions/runs/41151259118). Live staging parity/security/disabled-contact checks passed for 13 pages and seven assets. Production was not redeployed or activated; its previous source/version remains in service. The next required action is unlocking the Mac and completing the owner-reviewed Google project/client/consent flow, followed by real delivery and replay checks.

## Owner-approved branding release

The owner explicitly authorized deployment of the new logo, green palette, and centered hero on October 30, 2026. Deployed at `2026-10-31T01:49:26.751849Z` (October 30, approximately 9:49 PM America/New_York). This was the production branding release; the subsequent diamond-icon release below is current.

- Source: `e7a0a4c847fe3049779ff6b8b4a0403167e122ad` on `feature/milestone-2-website`.
- Worker: `prather-software-website`, explicit Wrangler environment `production`, exact apex/www Custom Domains.
- Version: `f3d1ff4b-4dbf-4e09-9b30-92fecaa7c10a`, serving 100% of traffic; deployment ID `b98f24df-5d72-4768-953c-ad51ad8ce97a`, tag `e7a0a4c`.
- [Release CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41153242529) passed for this exact source, including 88 unit tests, 180 browser tests, build/type checks, local runtimes, packaging dry runs, and a zero-vulnerability advisory audit. A fresh static build explicitly set `PUBLIC_CONTACT_ENABLED=false`; production packaging passed before upload.
- Live `npm run test:production` passed: all 13 public pages and nine non-HTML assets match the release build byte-for-byte. HTTPS/www redirects preserve path/query; indexing, canonical metadata, security headers, branded 404, and disabled contact responses pass.
- Live `npm run test:production:browser` passed in Chromium at 375/768/1440 px. Additional checks verified both original JPEG logos, centered hero text, blurred checkerboard, green palette, and static reduced-motion behavior at each width. Navigation and the selected automated WCAG rules passed; no browser errors or injected analytics beacon were detected.
- Both remote server gates remain false, the public form remains disabled, the Turnstile secret remains present, and Gmail secrets remain absent. The prepared Gmail implementation is now deployed but cannot collect or send inquiries until the separate verified activation.
- Google MX/SPF/DKIM/site-verification and privacy DNS records retain their exact IDs, contents, and modification timestamps. The separate privacy Worker's metadata/custom domain are unchanged. Its redirect and 200 response still work; SHA-256 remains `39f28d3ba5f389520791143ecffffbd557beb639ac9e47bf5bdcd850392ea4a6`.
- Staging remains on its prior disabled Gmail release. No production email activation, paid service purchase, unrelated DNS change, or PR merge occurred.

The homepage checkerboard remains a deliberate static placeholder. A future GIF and static still can be configured through `src/data/hero.ts` with pause/play and reduced-motion support. Manual assistive technology, physical-device, and actual Safari coverage remain unverified.

## Supplied diamond icon release

On November 3, 2026, the owner requested contact activation and supplied the exact diamond-P artwork for the site icon. The icon is now live in the header beside the wordmark and in fresh browser/favicon/Apple-touch paths. Its original PNG is preserved unchanged (SHA-256 `69643ae4dfdeef74408131ee7cb02e2cb07760e79e323b1df6692cc9313f5272`); small rendered variants avoid loading the full original in navigation.

- Deployed source: `20aa7994beffdaba6b0cc4c752ba8738d6b13247`.
- Production Worker/version: `prather-software-website` / `3bf9ee4d-e56b-4d41-83d8-0e71d23129b2`, tag `20aa799`, serving 100% of apex/www traffic.
- Deployment ID: `75317f12-af68-4e7b-938c-971c4a423c28`; created `2026-11-03T22:04:10.376787Z` (November 3, approximately 5:04 PM America/New_York).
- Full local Node 24 validation passed: formatting, build/types, 88 unit tests, 180 browser tests, 376 references, publication/secret-pattern/runtime checks, both packaging dry runs, and zero dependency vulnerabilities. [PR CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41725745566) and [push CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41725736620) passed before deployment.
- Live HTTP parity passed for all 13 public pages and 13 assets, plus canonical redirects, indexing/security, branded 404, and contact-disabled checks. Live Chromium checks passed at 375/768/1440px, including the supplied diamond thumbnail, SVG/PNG favicons, touch-icon links, navigation, selected accessibility rules, and absence of browser errors or analytics injection.
- Privacy Worker metadata, exact custom domain, and five scoped Google mail/verification and privacy DNS records are identical before/after. Privacy still redirects to `/quest-theater/`, returns 200, and retains SHA-256 `39f28d3ba5f389520791143ecffffbd557beb639ac9e47bf5bdcd850392ea4a6`.
- Both contact gates and public form remain off. The Turnstile secret is preserved; Gmail secrets are absent. The Google organization-owned project and Internal app configuration are prepared, but client-creation approval, send-only consent, protected credentials, and actual staged delivery/replay tests remain pending. The Mac locked again at the prepared client form. No live delivery or contact activation is claimed.

## Contact verification — November 4, 2026

The owner created the approved Internal Web OAuth client and completed send-only consent. Its downloaded JSON and the generated refresh credentials are ignored, mode 0600 local files. The three Gmail credentials are now installed as private bindings on the actual staging and production Workers, alongside each environment's existing Turnstile secret. Production contact gates remain false pending actual inbox confirmation.

The initial real staging attempt returned 502 before Gmail. Cloudflare Workers rejects `redirect: 'error'` when constructing an outbound request; Node-based fetch mocks had missed this runtime difference. Source `ad4ba542b60d79a8d3df7a3be25df16953511d42` uses manual redirects and rejects non-2xx responses without following them or forwarding credentials. An isolated workerd fixture now covers accepted requests and redirects at all three upstream stages. Restoring the old setting separately in the Turnstile and Gmail code causes that runtime check to fail. Fixed-category verification diagnostics contain no error text, provider bodies, credentials, tokens, IP addresses, or inquiry content.

Controlled staging version `a679360b-e878-4a77-98db-4023c008ef33` confirmed real Gmail acceptance (HTTP 200, requiring a nonempty provider message ID), followed immediately by rejection of the same token (HTTP 403). A deliberately invalid token was also rejected before mail. The owner identified `contact@prathersoftware.com` as a Workspace alternate address. Because Gmail can file mail sent to the sender's own alias only in Sent/All Mail, form notifications now target the same mailbox's primary address `mason@prathersoftware.com`; the public contact address stays `contact@prathersoftware.com`. The primary address is also the authorized sender. No email-reading/settings scope, domain-wide delegation, paid provider, or DNS change was added.

Primary-recipient staging version `d7fc431e-e69f-448e-8524-7afe44c3612a` also passed real fresh-token acceptance and immediate replay rejection. Owner confirmation of Inbox receipt remains pending. Temporary verification assets were removed; staging version `692dbebf-eb75-4972-a1b2-56c3ca76b7c5` restores ordinary assets with both gates false and noindex.

Validation: 95 unit tests, 180 browser tests, four workerd contact cases, formatting/types/build, 376 local references, content fixtures, secret-pattern checks, both local Worker environments, and both packaging dry runs passed. [PR CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41855415137) and [push CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41855407358) passed for `ad4ba54`. Active staging UI checks at 375/768/1440 px found no automated WCAG AA violations, overflow, or JavaScript exceptions. These automated checks do not establish mailbox receipt.

For production commands, use the configured `--env production` without a `--name` override. Wrangler appends the environment suffix to that override even when the environment already specifies its exact name. Verification caught an accidentally created empty, unrouted Worker; it was removed, and the actual production binding names were then verified. The separate privacy Worker/domain, five protected mail/privacy DNS records, and host-specific RUM exclusion matched the previous release before activation.

The new optional `--contact-enabled` production-check modes are for a future verified activation. They do not send inquiries and cannot replace actual acceptance/inbox/replay evidence. The PR remains unmerged.

### Active contact release

Deployed on November 4, 2026 at `2026-11-04T15:24:23.086577Z` (approximately 10:24 AM America/New_York) under the owner's existing contact-setup and production-launch authorization.

- Deployed source: `4daf17776404ec355ca9005222a8f83fb7b77a99`.
- Production Worker version: `510d1a8e-e9be-43dc-89ca-960429e07278`, deployment `9c779a07-7f21-419b-8f93-8956d565014e`, serving 100% of traffic.
- Both server gates and the public form are enabled. Remote settings confirm the primary sender/destination and exactly the four expected secret binding names. No secret values were read back.
- A fresh real submission through the ordinary production form, identified as `PS-COM-20261104-01`, displayed provider-confirmed acceptance. No staging helper, synthetic Turnstile token, or bypass was used. Inbox placement remains unconfirmed; the owner has been asked to check the primary mailbox. The locked Mac prevented direct business-mail UI verification.
- Enabled-mode live checks passed: 13 sitemap pages and 13 assets match the release build; HTTPS/www redirects, indexing, security headers, branded 404 and separate privacy availability passed. Live Chromium checks at 375/768/1440 px passed layout, automated WCAG AA checks, product navigation, active fields, real Turnstile frame loading, browser errors, and analytics exclusion.
- [Release PR CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41857323327) and [release push CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41857313001) passed for this exact source.
- Postrelease preservation checks match the preflight: all five protected mail/privacy DNS records, privacy Worker/domain and policy hash, and the RUM exclusion are unchanged. Only the three expected Workers remain. Staging stays disabled/nonindexable, and its temporary helper paths return 404.
- The pull request remains open and unmerged. Physical-device and manual screen-reader checks, final hero media, and owner-confirmed product release/store information remain outside this verified release.
