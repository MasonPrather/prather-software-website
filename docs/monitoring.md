# Free website monitoring

The `Website monitor` GitHub Actions workflow can check the public website at minute 17 of each hour after explicit activation. Scheduled jobs default off while credentials or approvals are pending; a merge alone does not activate them. It uses standard Ubuntu runners in the existing public repository, Node 24, and built-in modules only. It has no package installation, artifacts, paid monitoring account, or independent email provider.

## What it checks

1. The homepage returns its expected public content.
2. The contact page is enabled and uses the recorded production Turnstile public key.
3. Public `/api/health` reports that contact configuration is available.
4. The `contact-readiness` check uses an authenticated `POST /api/health` to confirm Google can refresh the existing send-only authorization and that no unresolved contact incident is recorded. An unavailable result can indicate Google authorization, incident state, or KV availability; it is not labeled as a Gmail authorization failure alone.

The monitor never submits `/api/contact`, sends inquiry email, reads an inbox, or retries a message. It does not solve a Turnstile challenge. Periodic owner-led end-to-end form tests remain useful, especially after account or mail configuration changes.

## Alert and recovery behavior

A failed check creates one GitHub issue labeled `website-monitor`, assigned to `MasonPrather`. The issue contains only fixed check names, failure categories, bounded HTTP status codes, and a workflow-run link. Response bodies, headers, credentials, visitor details, and inquiry text never enter the alert.

An unchanged failure leaves the issue untouched. A changed set of failed checks updates its description. When every check passes again, the monitor closes only its own issue and adds one brief recovery comment. Closure is confirmed first so a failed close cannot cause repeated recovery comments. GitHub assignment/email notifications depend on the owner's notification preferences; confirm those in GitHub Settings → Notifications. A missing notification credential or rejected GitHub request makes the workflow fail rather than claiming an alert was delivered.

Ownership checks require the dedicated label, unique HTML marker, owner assignment, and an author of `github-actions[bot]` or `MasonPrather`. Unrelated issues and pull requests are not changed. Duplicate matching incidents cause a failed run for operator review rather than arbitrary edits.

## Required configuration

The workflow must be merged into `main` to run on a schedule. Its job allows only this repository and `refs/heads/main`; it never runs from pull requests. The `monitoring` GitHub environment should allow only `main` and should not require approval for each hourly run. Scheduled jobs also require repository Actions variable `WEBSITE_MONITOR_ENABLED` to equal the literal string `true`. An unset or false value skips scheduled jobs while preserving manual runs on `main`.

- Worker secret: `HEALTHCHECK_TOKEN`, generated from 32 cryptographically random bytes and encoded as 64 hexadecimal characters.
- GitHub environment secret in `monitoring`: `WEBSITE_HEALTHCHECK_TOKEN`, containing the same value.
- Workflow token: automatic, ephemeral `GITHUB_TOKEN`, with only `contents: read` and `issues: write`.
- Repository label: `website-monitor`.
- Worker binding: environment-specific `MONITORING_STATE` KV namespaces, separate for staging and production.
- Activation switch: repository Actions variable `WEBSITE_MONITOR_ENABLED`, set to `true` only after the notification self-test and real manual monitor both pass.

Keep private values out of commands, chat, logs, and Git. Supply them through protected secret-management input. The monitor does not need a Cloudflare API token or stored GitHub personal token. The deployment workflow uses separate access.

## Contact incident state

KV stores only two fixed keys, `contact:delivery` and `contact:verification`. An incident value contains its fixed category and timestamp, without customer data. Gmail rejection or uncertain acceptance records a delivery incident. Only a later confirmed Gmail acceptance clears that incident. A Turnstile service outage records a verification incident; a later valid verdict clears that category. Ordinary invalid, expired, or replayed tokens do not create incidents.

Authenticated health checks return an unavailable result while either marker remains, while KV cannot be read, or while Google authorization fails. A successful authorization probe does not erase a delivery incident. Missing or failing KV does not change a visitor's independently verified mail-acceptance result. Production writes run through the Worker's background context.

KV propagation is eventually consistent, so incident visibility is not immediate. This small operational state fits the existing Workers/KV Free plan limits at the intended monitoring frequency; Free-plan limits can reject operations instead of adding paid capacity. No paid plan is enabled by this workflow.

## Run or test it

Keep `WEBSITE_MONITOR_ENABLED` unset or false during setup. After the reviewed workflow is merged and the approved private configuration is installed, open Actions → Website monitor → Run workflow and select `main`.

First set `self_test` true for a notification check. This creates a clearly named `[TEST]` incident, then closes it and records a simulated recovery. It uses a separate marker and cannot close a production incident. It performs no website probes or application changes. A green self-test confirms that notification cycle, not production health.

Next run manually with `self_test` false for a real check. Only after that run and the notification self-test pass, set repository variable `WEBSITE_MONITOR_ENABLED=true` as the last activation step. This enables hourly jobs. Clearing the variable or setting it false disables scheduled jobs without removing manual access. Do not describe scheduled monitoring as active until this flag is enabled and subsequent run history is verified.

Actual failed checks exit unsuccessfully even when issue notification also fails. Inspect Actions for the bounded failure summary. Fix the underlying problem; if a delivery incident remains, submit a new, clearly identified inquiry once after resolving the cause and confirm acceptance. Never retry an inquiry whose acceptance was uncertain without first checking its receipt.

## Free-service limits and upkeep

GitHub schedules are best effort and can be delayed or dropped under load. Public-repository schedules can be disabled after 60 days without repository activity. Check recent workflow history periodically and re-enable the workflow if needed. This is useful free operational monitoring, not a guaranteed response-time or email-delivery service.

Keep this repository public and retain standard `ubuntu-latest` runners to preserve the current free runner basis. Review costs before changing repository visibility, enabling larger runners, or adding artifact storage.

References: [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [scheduled workflow behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [Workers KV pricing and limits](https://developers.cloudflare.com/kv/platform/pricing/).
