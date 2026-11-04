# Launch readiness and free operations

The owner requested the remaining launch setup on November 4, 2026, with a $0 starting budget. Use existing accounts and free features. No paid plan, trial, new sending subscription, domain purchase, or billing change is authorized by this work.

## Search visibility

Google Search Console's Domain property `sc-domain:prathersoftware.com` is registered to the owner's business Google account. Ownership was automatically verified through the existing domain-provider record; no DNS change was needed. Google accepted `https://prathersoftware.com/sitemap.xml`, reported Success, and discovered 13 pages on November 4. Initial performance/indexing reports are still processing. Discovery and a submitted indexing request do not establish completed indexing or search placement.

The homepage's initial inspection reported Discovered — currently not indexed. Google's live test then confirmed URL is available to Google and Page can be indexed. The indexing request was accepted into its priority crawl queue. Actual indexing/search placement remains subject to Google's processing.

## Free services and limits

| Component                       | Choice                                       | Cost control                                                                                           |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Search discovery                | Google Search Console                        | Free; no advertising campaign                                                                          |
| Visitor/performance measurement | Manual Cloudflare Web Analytics              | Free feature; HTTPS apex only, no staging/privacy-subdomain collection, Do Not Track respected         |
| Operational checks              | Hourly GitHub Actions monitor                | Standard Ubuntu runner in the existing public repository; no packages, build artifacts, or paid runner |
| Failure notifications           | One owner-assigned GitHub issue per incident | Quiet while unchanged; close after verified recovery; separate self-test incident                      |
| Incident persistence            | Separate free-tier Workers KV namespaces     | Fixed incident categories/timestamps only; no inquiry content, email, IP, or visitor profile           |
| Deployment safety               | Manual GitHub Actions releases               | Dry run by default; main-only source; production requires owner approval                               |

Workers KV Free currently allows 100,000 reads and 1,000 writes/deletes per day, with 1 GB storage. Excess operations on the Free plan fail rather than purchasing additional usage. The configured state consists of two fixed keys per environment. The monitor sends no inquiry and never retries a customer's uncertain send. Standard GitHub-hosted runner compute is free for public repositories; other account storage limits still apply. Current repository artifact inventory was empty, and failed-test artifact retention is reduced to one day.

No existing Google Workspace or domain-renewal charges are removed by this setup. Cloudflare billing-plan details are unavailable to the OAuth connector; no plan upgrade was requested or performed.

## Access and activation

- GitHub environments `production`, `staging`, and `monitoring` exist with main-only branch policies. `production` requires approval by MasonPrather; the monitoring environment has no hourly approval gate.
- Default GitHub Actions permissions are read-only, and workflows cannot approve pull requests. The monitor alone requests issue-write access.
- Main requires pull requests, the passing `verify` check from the GitHub Actions app, an up-to-date source branch, resolved conversations, and linear history. Force pushes/deletions are blocked, including for admins. A second reviewer is not required for the founder-led repository.
- Weekly dependency/Actions update pull requests are configured without automatic merging. Repository vulnerability alerts and automated security-update pull requests are enabled and verified; retain manual review and the required quality gate. The weekly file takes effect after the reviewed default-branch merge.
- The private monitoring credential requires explicit owner approval before creation and storage on the production Worker and the main-only GitHub monitoring environment. It permits only the authenticated health probe; it does not expose mailbox contents or permit website editing.
- Actual deployments from Actions require a separate narrowly scoped Cloudflare CI token stored privately in the selected release environment. Connector/CLI OAuth tokens must never be copied into CI.
- The original instruction says not to merge automatically. The reviewed pull request must receive owner merge approval before new default-branch schedules can run.
- Scheduled monitoring also remains off until repository variable `WEBSITE_MONITOR_ENABLED` is explicitly set to `true` after a passing notification self-test and real check. Manual main-branch runs remain available before that flag is enabled.
- Public analytics metadata and KV identifiers are in `ops/`; credentials are not. Keep automatic RUM injection disabled so the manually controlled production beacon is the only analytics script.

See [monitoring](monitoring.md) and [releases](releases.md) for operation, tests, and activation requirements. Prepared source is not proof that a schedule, notification, or deployment has run successfully.

## Account ownership

Public RDAP reports Cloudflare as registrar, a transfer-prohibited lock, and expiry on October 13, 2027. A subsequent read-only Registrar API check confirmed an active registration and automatic renewal enabled. The payment method and account recovery details still need owner verification; no renewal or payment setting was changed.

Cloudflare's user API initially reported two-factor authentication disabled. The owner has been asked to enroll privately and close any authenticator/recovery-code screens before further automation. GitHub and Google MFA status and recovery-code storage have not been verified. Do not print passwords, enrollment QR secrets, recovery keys, or API credentials into chat or Git.

The read-only zone audit found TLS 1.3 enabled, minimum TLS 1.0, SSL mode Full, and DNSSEC disabled. The website already redirects HTTP to HTTPS in its Worker. Full (strict) concerns certificate validation for proxied origins; these website Workers have no separate origin server. Raising the zone minimum to TLS 1.2 and enabling DNSSEC are additional hardening options, not completed changes. Review all affected hostnames and the Cloudflare Registrar DNSSEC workflow before changing them. Mail DNS and the separate privacy site remain preserved.

## Visitor experience and remaining owner input

Original local SVG brand artwork replaces the homepage checkerboard while preserving blur, centered text, pause/play, reduced-motion, and no-JavaScript fallbacks. Product FAQs use only owner-provided facts. Quest Theater remains unreleased without an unconfirmed launch date. Actual product screenshots/trailers, released store links, and pricing have not been supplied and are not fabricated.

Automated Chromium/Firefox/WebKit checks cover responsive layouts, keyboard operation, selected WCAG rules, motion preferences, and analytics boundaries. Actual iPhone/Android hardware, Safari/VoiceOver, a full manual accessibility audit, account recovery, and a periodic human contact-delivery check remain distinct verification tasks.

## References

- [Search Console setup](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/)
- [Workers KV pricing and Free limits](https://developers.cloudflare.com/kv/platform/pricing/)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub environment protections](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
