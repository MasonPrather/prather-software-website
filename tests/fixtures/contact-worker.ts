import { handleContact, type ContactEnvironment } from '../../worker/index';

// Inert fixtures only. This entry point is used exclusively by the local harness.
const origin = 'https://staging.example.com';
const endpoints = [
  'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  'https://oauth2.googleapis.com/token',
  'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
] as const;
const scenarios = [
  'accepted',
  'verification-redirect',
  'refresh-redirect',
  'send-redirect',
] as const;
type Scenario = (typeof scenarios)[number];

const environment = {
  CONTACT_ENABLED: 'true',
  CONTACT_DELIVERY_VERIFIED: 'true',
  ALLOWED_ORIGIN: origin,
  TURNSTILE_HOSTNAME: 'staging.example.com',
  CONTACT_FROM: 'site@example.com',
  CONTACT_TO: 'hello@example.com',
  TURNSTILE_SECRET: 'unit-test-secret',
  GMAIL_CLIENT_ID: 'unit-test-client-id',
  GMAIL_CLIENT_SECRET: 'unit-test-client-secret',
  GMAIL_REFRESH_TOKEN: 'unit-test-refresh-token',
  CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) },
} as ContactEnvironment;

async function run(scenario: Scenario) {
  let calls = 0;
  let endpointsMatch = true;
  let manualRedirects = true;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // Native construction inside workerd must run before any fake response.
    // In particular, workerd rejects redirect: 'error' although Node accepts it.
    const nativeRequest = new Request(input, init);
    const index = calls++;
    endpointsMatch &&=
      nativeRequest.url === endpoints[index] && nativeRequest.method === 'POST';
    manualRedirects &&= nativeRequest.redirect === 'manual';
    if (!endpointsMatch || !manualRedirects)
      throw new Error('Unexpected fixture upstream request.');
    const redirectIndex = {
      accepted: -1,
      'verification-redirect': 0,
      'refresh-redirect': 1,
      'send-redirect': 2,
    }[scenario];
    if (index === redirectIndex)
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://redirect.invalid/not-followed' },
      });
    if (index === 0)
      return Response.json({
        success: true,
        action: 'contact',
        hostname: 'staging.example.com',
      });
    if (index === 1)
      return Response.json({ access_token: 'unit-test-access-token' });
    return Response.json({ id: 'unit-test-accepted-message' });
  }) as typeof fetch;
  const response = await handleContact(
    new Request(`${origin}/api/contact`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Runtime Fixture',
        email: 'fixture@example.com',
        category: 'project',
        message: 'Inert local runtime test inquiry; no email is transmitted.',
        website: '',
        'cf-turnstile-response': 'unit-test-token',
      }),
    }),
    environment,
    fetcher,
  );
  // Never return request bodies, tokens, credentials, or provider responses.
  return Response.json({
    status: response.status,
    calls,
    endpointsMatch,
    manualRedirects,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    if (pathname === '/health')
      return new Response(null, {
        status: 204,
        headers: { 'X-Contact-Fixture': 'workerd-runtime' },
      });
    const scenario = pathname.slice('/case/'.length) as Scenario;
    if (!pathname.startsWith('/case/') || !scenarios.includes(scenario))
      return new Response(null, { status: 404 });
    return run(scenario);
  },
};
