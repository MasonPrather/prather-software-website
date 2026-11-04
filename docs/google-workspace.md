# Google Workspace contact sender

The owner selected Google Workspace on October 30, 2026. The fixed inquiry destination is `contact@prathersoftware.com`. Google DNS and the separate privacy Worker remain unchanged. Contact collection stays disabled until the tests below pass.

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

Store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as environment-specific Worker secrets using protected stdin/secret-management tooling. Keep `TURNSTILE_SECRET` separate for production/staging. Never use command-line secret values, expose credentials through `PUBLIC_` variables, or export connector credentials. Standard secret updates may deploy immediately: check the exact Worker and environment first and leave both contact gates off.

## Sending behavior

The Worker validates all visitor fields, origin, rate limit, Turnstile action and exact hostname before sending. It refreshes through `https://oauth2.googleapis.com/token` and sends through `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, with a shared ten-second delivery deadline, bounded responses, no redirects and no retries. UTF-8 MIME has fixed From/To headers and only a validated visitor Reply-To. A successful HTTP response with a nonblank Gmail message ID is required for acceptance. Expired/revoked credentials, provider rejection and uncertain responses fail closed without claiming delivery or logging message/credential data.

## Activation checks

1. Confirm sender ownership/alias, complete OAuth consent, and store secrets in staging.
2. Keep the production public form and both server gates off. Use an owner-approved controlled staging verification session to submit a clearly identified test inquiry with a fresh real Turnstile token.
3. Confirm provider acceptance and actual receipt at the selected inbox, then verify replay rejection, invalid origins/action/hostname, validation, rate limiting, and failure states. Unit mocks do not establish real delivery.
4. Review the privacy notice against the selected live setup. Then configure production secrets, enable both server gates and the public build flag, build with the production sitekey recorded in `ops/turnstile-widgets.json`, and deploy with `--env production`.
5. Run `npm run test:production -- --contact-enabled` and `npm run test:production:browser -- --contact-enabled` against the matching active release build. These modes check the enabled UI and real widget loading without submitting inquiries or inspecting tokens; real delivery and replay evidence remain separate. Default modes still expect disabled collection. Record the deployed source/version and real acceptance evidence without storing tokens or inquiry content.

Google may invalidate refresh tokens following revocation, password changes or extended inactivity. The form will report unavailable/uncertain acceptance; the operator must reconnect through the same protected flow. Do not automatically retry an uncertain mail send.

## References

- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Consent configuration](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Gmail send scope](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gmail API limits and pricing](https://developers.google.com/workspace/gmail/api/reference/quota)

## Current state

Implementation and automated validation are complete. On November 3, 2026, the owner verified `mason@prathersoftware.com` in Safari. The dedicated project `prather-software-website` was created within the `prathersoftware.com` organization, Gmail API was enabled, and the owner completed the Internal Google Auth Platform configuration. The owner subsequently approved and created the Web application client, downloaded its JSON, and completed send-only mailbox consent. On November 4, controlled staging version `72406874-45cf-41d5-ae83-1f16e1276005` was deployed for real delivery and replay verification. Production contact collection remains disabled.

The existing client is named `Prather Software Website`, with no JavaScript origins and exactly `http://127.0.0.1:8977/oauth/callback` as its redirect. The downloaded JSON was validated against project `prather-software-website` and that exact callback, then imported into the current repository's ignored `.dev.vars.gmail-client.json` with mode 0600. The generated `.dev.vars.gmail` store was verified to contain exactly the three nonempty Gmail credential keys, remain ignored, and have mode 0600. Those three credentials were installed as staging Worker secret bindings while both contact gates were false. The controlled staging version temporarily enables both operator gates and uses the authorized Workspace primary address `mason@prathersoftware.com` as sender, with `contact@prathersoftware.com` as recipient. Its temporary verification assets are isolated under ignored `.wrangler/` and must be removed from staging after testing. Neither enabled gate is evidence of verified delivery: real acceptance, inbox receipt, and immediate replay rejection remain pending. Production still has no Gmail secret bindings and both contact gates remain false. Do not create a duplicate client or emit credentials into tool/chat output.

Earlier deployment history: the tested Gmail implementation source is `dabeecceaa1b788ce44ac03e08155150840c689f`. [Its CI passed](https://github.com/MasonPrather/prather-software-website/actions/runs/41151259118), and it was deployed to `prather-software-staging` as version `bceaa153-8a13-4d2b-9ac8-cc6e464f66bf`. The subsequent owner-approved branding release `e7a0a4c` also deployed the gated Gmail implementation to production as version `f3d1ff4b-4dbf-4e09-9b30-92fecaa7c10a`; see [production operations](production.md). The November 3 remote check confirmed both server gates were false in each environment, the separate Turnstile secrets remained configured, and Gmail secrets were absent at that time. Real staging verification is required before production activation.
