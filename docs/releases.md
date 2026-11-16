# Website releases

The website stays on the existing Cloudflare setup. The public GitHub repository uses standard Ubuntu runners; this workflow introduces no paid runner, hosting plan, database, or additional service subscription. Cloudflare account and domain renewal costs remain governed by the existing accounts.

## One-time setup

1. Review and merge the implementation pull request into `main`. This workflow does not merge changes and cannot publish a feature-branch commit.
2. In the repository's **Settings → Environments**, create `staging` and `production`. Limit deployments to `main`. Configure `production` with the owner as a required reviewer. A sole owner must leave **Prevent self-review** off to approve their own requested releases. Keep the review step enabled; a manual workflow click alone does not replace environment protection.
3. Create separate account-owned Cloudflare API tokens with **Workers Editor** scoped to the existing target Worker only: `prather-software-staging` for staging and `prather-software-website` for production. Store each token privately as `CLOUDFLARE_API_TOKEN` in its matching GitHub environment. Exclude the separate privacy Worker, account-wide Worker access, KV access, DNS, billing, and token-administration permissions. Existing KV bindings require no separate KV permission. Do not use a Global API Key, expose a token in source, or place Gmail/Turnstile credentials in GitHub. Those application secrets already remain on the two Workers and are preserved during deployment.
4. Confirm repository Actions are enabled. The workflow only runs manually from `main`; it does not publish on pushes or pull requests. GitHub environment protections must be configured remotely before treating the production review gate as operational.

Cloudflare documents Workers Editor as sufficient for deploying an existing Worker without changing its domain connections. Adding, changing, or removing a route/domain requires Workers Routes Write for the affected zone. Custom Domains do not yet support per-Worker roles, so validate the narrow token against this unchanged-domain deployment before declaring CI publishing configured. If that restriction prevents deployment, stop and review the exact missing permission; do not silently broaden the token to include the privacy Worker or unrelated resources. Credential creation and storage require the owner's specific approval.

## Prepare a release

Open **Actions → Website release → Run workflow**. Use the `main` branch, choose `staging` or `production`, and enter the full 40-character SHA of the reviewed commit on `main`. Leave **Check the release without uploading it** enabled first.

The workflow checks that the exact commit belongs to `main`, installs locked dependencies, runs the existing quality suite and audit, then builds the selected target and performs a Wrangler dry run. This preview does not upload a Worker, send inquiries, change DNS, or require deployment secrets.

Review the green result and selected target before requesting an actual release. Commits must include the release helper; use the Cloudflare version rollback procedure for older releases that predate it.

## Publish

Run the workflow again with the same full SHA and target, then clear the dry-run option. It repeats verification. The production environment's required reviewer must approve the publishing job before GitHub exposes its deployment secret.

The release helper always rebuilds ordinary `dist/` assets. Production uses the recorded production Turnstile key, enables the public form and both server contact gates, and sets `PUBLIC_WEB_ANALYTICS_ENABLED=true` for the manually configured production analytics component. Staging uses its own key, keeps contact collection and visitor analytics disabled, and remains nonindexable. This prevents an ordinary update from accidentally disabling the live contact form or enabling staging analytics. Test-probe assets, symlinks, private configuration filenames, wrong widget metadata, unexpected Worker names, routing, or account overrides stop the release.

When `ops/web-analytics.json` is present, the helper checks its account, exact apex hostname, public 32-character hexadecimal embed token, manual mode, disabled automatic installation, official script/collection origins, and Do Not Track setting before building. The analytics embed identifier is public metadata, not a deployment credential. The component separately enforces production enablement and its runtime hostname restriction.

The helper uses only the configured Wrangler environment; it never combines production with a `--name` override. Build subprocesses exclude all `CLOUDFLARE_*` and `CF_*` variables, as well as token, secret, password, Gmail, and private contact variables; only the approved public release settings are restored for the build. The deployment subprocess retains its approved authentication. The helper preserves remote application secrets and cannot target the separate privacy Worker or add unrelated domains through its guarded configuration. A failed command is not automatically retried.

After upload, production runs the existing enabled-mode HTTP/build-parity checks. Staging checks ordinary pages, disabled contact markup, build parity, security headers, and noindex behavior. These checks submit no inquiries and do not prove email receipt. Keep the existing real contact verification procedure for mail changes.

## Local preparation

From a clean checkout with dependencies installed, first refresh `origin/main` with `git fetch origin main`. An authorized operator can then prepare a pinned commit without uploading:

```sh
node scripts/release.mjs --environment production --source-sha FULL_40_CHARACTER_SHA --dry-run
```

Local dry runs may inspect an unmerged feature commit; actual local deployments and all Actions releases require the commit to belong to `origin/main`. For an authorized local publish, replace `--dry-run` with `--deploy` and use the existing approved Cloudflare authentication. The script never prints credential values or stores them in build metadata.

## Failure and recovery

If verification fails, fix the reported problem in a pull request and publish a reviewed commit. If upload succeeds but the live check fails, inspect the actual Cloudflare deployment before another attempt; never blindly repeat an uncertain action. Record the source SHA and Worker version in [production operations](production.md).

For rollback, inspect the verified prior versions using the [production runbook](production.md#rollback). Application rollback does not roll back DNS or other Cloudflare resources. The privacy Worker and Google mail DNS remain separate.

References: [GitHub manual workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch), [GitHub environments and required reviewers](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [GitHub workflow security](https://docs.github.com/en/actions/reference/security/secure-use), [public-repository runner billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Workers permissions and bindings](https://developers.cloudflare.com/workers/authorization/), [Workers domain permissions](https://developers.cloudflare.com/workers/authorization/workers/), and [Wrangler deploy commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/).
