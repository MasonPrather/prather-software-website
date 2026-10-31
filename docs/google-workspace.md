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

The helper listens only on IPv4 loopback, uses state and PKCE S256, requests offline send-only access, rejects duplicate/expired/replayed callbacks, uses fixed Google endpoints, and redirects to a clean local page before completing the exchange. It writes only the three Gmail credentials into ignored `.dev.vars.gmail` with exclusive creation and mode 0600. It refuses to overwrite an existing store. It does not print credentials or authorization codes. Do not commit or paste the downloaded JSON or credential file. Reconnection must preserve the old store until the new authorization is verified.

Store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` as environment-specific Worker secrets using protected stdin/secret-management tooling. Keep `TURNSTILE_SECRET` separate for production/staging. Never use command-line secret values, expose credentials through `PUBLIC_` variables, or export connector credentials. Standard secret updates may deploy immediately: check the exact Worker and environment first and leave both contact gates off.

## Sending behavior

The Worker validates all visitor fields, origin, rate limit, Turnstile action and exact hostname before sending. It refreshes through `https://oauth2.googleapis.com/token` and sends through `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, with a shared ten-second delivery deadline, bounded responses, no redirects and no retries. UTF-8 MIME has fixed From/To headers and only a validated visitor Reply-To. A successful HTTP response with a nonblank Gmail message ID is required for acceptance. Expired/revoked credentials, provider rejection and uncertain responses fail closed without claiming delivery or logging message/credential data.

## Activation checks

1. Confirm sender ownership/alias, complete OAuth consent, and store secrets in staging.
2. Keep the production public form and both server gates off. Use an owner-approved controlled staging verification session to submit a clearly identified test inquiry with a fresh real Turnstile token.
3. Confirm provider acceptance and actual receipt at the selected inbox, then verify replay rejection, invalid origins/action/hostname, validation, rate limiting, and failure states. Unit mocks do not establish real delivery.
4. Review the privacy notice against the selected live setup. Then configure production secrets, enable both server gates and the public build flag, build with the production sitekey recorded in `ops/turnstile-widgets.json`, and deploy with `--env production`.
5. Run live HTTP/browser checks with the expected active contact state; do not send recurring test emails automatically. Record the deployed source/version and real acceptance evidence without storing tokens or inquiry content.

Google may invalidate refresh tokens following revocation, password changes or extended inactivity. The form will report unavailable/uncertain acceptance; the operator must reconnect through the same protected flow. Do not automatically retry an uncertain mail send.

## References

- [Google OAuth web-server flow](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Consent configuration](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Gmail send scope](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gmail API limits and pricing](https://developers.google.com/workspace/gmail/api/reference/quota)

## Current state

Implementation and automated validation are complete. Google project/client creation, owner consent, protected credential installation, and real staged delivery/replay tests are pending. The owner will unlock the Mac later so the signed-in browser can complete setup. No Gmail credentials have been generated or stored yet, and no live form activation has occurred. Production currently retains the gated, disabled contact service from the preceding release.
