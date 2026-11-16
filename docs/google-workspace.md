# Google Workspace contact sender

The owner selected Google Workspace on October 30, 2026. The public contact address is `contact@prathersoftware.com`, an alternate address for the owner's Workspace mailbox. The fixed sender and delivery target are the primary address `mason@prathersoftware.com`. Production contact collection is active following real provider acceptance and staging replay verification. On November 4, the owner confirmed receipt of both staging test messages, including inbox placement of the primary-recipient test. The individual production test's inbox receipt has not been separately confirmed. Google DNS and the separate privacy Worker remain unchanged; staging has returned to ordinary disabled assets.

## Dedicated send-only authorization

Use a Google Cloud project inside the Prather Software Workspace organization. Enable Gmail API, configure Google Auth Platform branding, choose the Internal audience, and add only `https://www.googleapis.com/auth/gmail.send`. Do not add email-reading scopes or domain-wide delegation. Internal audience requires an organization-owned project; stop and resolve the organization if the project has no organization. External Testing tokens expire after seven days and are not suitable for the production sender.

Create a Web application OAuth client named Prather Software Website with exactly this authorized redirect URI:

```text
http://127.0.0.1:8977/oauth/callback
```

Google’s API User Data Policy agreement, credential creation, and send-mail consent require the owner’s review at the relevant Google screen. Download client JSON without putting its contents into chat or Git. The account that grants consent must own the fixed sender address or have it configured as an accepted Send Mail As alias. Cloudflare destination verification only verifies receipt at that address.

Run the local helper with the downloaded client file:

```sh
npm run gmail:authorize -- --client-file /absolute/path/to/client.json
```

While the helper is running, open `http://127.0.0.1:8977/start` in Safari, choose the approved Workspace mailbox, and review Google's send-only consent screen. This stable local URL redirects to the current authorization session without printing that session's URL. Complete authorization within ten minutes and return to Codex when the local completion page appears.

The helper listens only on IPv4 loopback, uses state and PKCE S256, requests offline send-only access, rejects duplicate/expired/replayed callbacks, uses fixed Google endpoints, and redirects to a clean local page before completing the exchange. It writes only the three Gmail credentials into ignored `.dev.vars.gmail` with exclusive creation and mode 0600. It refuses to overwrite an existing store. It does not print credentials or authorization codes. Do not commit or paste the downloaded JSON or credential file. Reconnection must preserve the old store until the new authorization is verified.

Store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as environment-specific Worker secrets using protected stdin/secret-management tooling. Keep `TURNSTILE_SECRET` separate for production/staging. Never use command-line secret values, expose credentials through `PUBLIC_` variables, or export connector credentials. Standard secret updates may deploy immediately: check the exact Worker and environment first. During initial setup or unverified reconnection, keep both contact gates off; preserve the approved active settings during routine maintenance.

## Sending behavior

The Worker validates all visitor fields, origin, rate limit, Turnstile action and exact hostname before sending. It refreshes through `https://oauth2.googleapis.com/token` and sends through `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, with a shared ten-second delivery deadline, bounded responses, manual redirect handling, and no retries. Non-2xx responses are rejected without following redirects or forwarding credentials. UTF-8 MIME has fixed From/To headers and only a validated visitor Reply-To. A successful HTTP response with a nonblank Gmail message ID is required for acceptance. Expired/revoked credentials, provider rejection and uncertain responses fail closed without claiming delivery or logging message/credential data.

Google documents that messages sent to one's own alias can appear in Sent Mail or All Mail without reaching the inbox. The controlled test initially addressed the owner's alternate `contact@prathersoftware.com`; provider acceptance alone did not establish inbox delivery. The owner subsequently confirmed receipt of that alias test and inbox placement of the primary-recipient staging test. Production addresses the same owner's primary mailbox directly, while the public contact address remains unchanged. No Gmail settings or reading scope is being requested. See [Google's alias troubleshooting guidance](https://knowledge.workspace.google.com/admin/support/troubleshooting/messages-sent-to-email-alias-or-group-arent-in-my-inbox).

## Activation checks

1. Confirm sender ownership/alias, complete OAuth consent, and store secrets in staging.
2. Keep the production public form and both server gates off. Use an owner-approved controlled staging verification session to submit a clearly identified test inquiry with a fresh real Turnstile token.
3. Confirm real provider acceptance and immediate token replay rejection, plus invalid origins/action/hostname, validation, rate limiting, and failure states. Record inbox placement as a separate verification result; provider acceptance does not establish inbox delivery. Unit mocks do not establish real acceptance.
4. Review the privacy notice against the selected live setup. Then verify production secrets, enable both server gates and the public build flag, build with the production sitekey recorded in `ops/turnstile-widgets.json`, and deploy with `--env production`. Do not also pass `--name`: use the configured production environment's exact Worker name and verify the target before applying any deployment or secret update.
5. Run `npm run test:production -- --contact-enabled` and `npm run test:production:browser -- --contact-enabled` against the matching active release build. These modes check the enabled UI and real widget loading without submitting inquiries or inspecting tokens. Separately record a real production inquiry's provider acceptance and that inquiry's inbox-placement result. Default check modes still expect disabled collection. Record the deployed source/version and real acceptance evidence without storing tokens or inquiry content.

The checked-in gates intentionally remain false. For each authorized production release, use the exact build/deploy sequence in the [README](../README.md#contact-and-deployment-gates): public enable flag and production key at build time, then `--env production --var CONTACT_ENABLED:true --var CONTACT_DELIVERY_VERIFIED:true` at deployment. Omitting the overrides deactivates the contact service on the next deployment. `CONTACT_DELIVERY_VERIFIED` records the operator's provider-acceptance verification; it is not evidence of inbox placement.

Google may invalidate refresh tokens following revocation, password changes or extended inactivity. The form will report unavailable/uncertain acceptance; the operator must reconnect through the same protected flow. Do not automatically retry an uncertain mail send.

## References

- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Consent configuration](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Gmail send scope](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gmail API limits and pricing](https://developers.google.com/workspace/gmail/api/reference/quota)
- [Google Workspace self-alias delivery behavior](https://knowledge.workspace.google.com/admin/support/troubleshooting/messages-sent-to-email-alias-or-group-arent-in-my-inbox)
- [Workers Request redirect modes](https://developers.cloudflare.com/workers/runtime-apis/request/)

## Current state

On November 3, 2026, the owner verified `mason@prathersoftware.com` in Safari. The dedicated project `prather-software-website` was created within the `prathersoftware.com` organization, Gmail API was enabled, and the owner completed the Internal Google Auth Platform configuration. The owner subsequently approved and created the Web application client, downloaded its JSON, and completed send-only mailbox consent. Authorization is complete. The existing launch/contact authorization covers the live activation recorded below, and owner-confirmed staging receipt is now recorded separately from production provider acceptance.

The existing client is named `Prather Software Website`, with no JavaScript origins and exactly `http://127.0.0.1:8977/oauth/callback` as its redirect. The downloaded JSON was validated against project `prather-software-website` and that exact callback, then imported into the current repository's ignored `.dev.vars.gmail-client.json` with mode 0600. The generated `.dev.vars.gmail` store was verified to contain exactly the three nonempty Gmail credential keys, remain ignored, and have mode 0600. All three Gmail secrets are installed and remotely verified in the correct staging and production Workers, alongside each environment's existing Turnstile secret. Production was deployed with both server gates true and the public form enabled. Do not create a duplicate client or emit credentials into tool/chat output.

The first controlled staging version `72406874-45cf-41d5-ae83-1f16e1276005` exposed an outbound request compatibility defect: Workers does not support `redirect: 'error'`. Source `ad4ba542b60d79a8d3df7a3be25df16953511d42` changes Siteverify and Gmail requests to `manual`, rejecting non-2xx responses. Its actual workerd regression covers accepted delivery and redirects at all three upstream phases; negative controls with the old unsupported mode fail as expected. Both [push CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41855407358) and [PR CI](https://github.com/MasonPrather/prather-software-website/actions/runs/41855415137) passed.

Fixed staging version `a679360b-e878-4a77-98db-4023c008ef33` accepted a real fresh-token inquiry with HTTP 200 and rejected its immediate replay with the contact-verification HTTP 403 response, observed through the browser. Controlled staging version `d7fc431e-e69f-448e-8524-7afe44c3612a` repeated those results with the primary mailbox as recipient. Staging was then restored to ordinary disabled assets as version `692dbebf` (abbreviated; full identifier in production operations), removing the temporary probe.

On November 4, the owner confirmed receipt of alias-recipient staging test `d2d9fd05-dea5-4d72-922f-674d93f065f9` and confirmed that primary-recipient staging test `468c6130-0653-4d08-95ac-1985fe278f02` reached the primary inbox. These confirmations establish receipt of those two test messages; they do not guarantee future delivery.

On November 4, source `4daf17776404ec355ca9005222a8f83fb7b77a99` was activated in production as Worker version `510d1a8e-e9be-43dc-89ca-960429e07278`. The ordinary production form uses the recorded production sitekey, with no temporary probe assets. A fresh real inquiry identified as `PS-COM-20261104-01` returned HTTP 200 through the browser; this success path requires Gmail's nonblank acceptance message ID. Live checks passed for all 13 public pages, 13 assets, security/privacy preservation, and Chromium at 375/768/1440 px with automated WCAG checks. That individual production test's inbox receipt has not been separately confirmed. Do not equate provider acceptance with inbox delivery or mark the whole milestone fully verified.

Earlier deployment history: the tested Gmail implementation source is `dabeecceaa1b788ce44ac03e08155150840c689f`. [Its CI passed](https://github.com/MasonPrather/prather-software-website/actions/runs/41151259118), and it was deployed to `prather-software-staging` as version `bceaa153-8a13-4d2b-9ac8-cc6e464f66bf`. The subsequent owner-approved branding release `e7a0a4c` also deployed the gated Gmail implementation to production as version `f3d1ff4b-4dbf-4e09-9b30-92fecaa7c10a`; see [production operations](production.md). The November 3 remote check confirmed both server gates were false in each environment, the separate Turnstile secrets remained configured, and Gmail secrets were absent at that time. The newer setup and verification record above supersedes those historical dependencies.
