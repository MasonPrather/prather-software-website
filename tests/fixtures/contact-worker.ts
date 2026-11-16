import { handleContact, type ContactEnvironment } from '../../worker/index';
import { handleHealth, type HealthEnvironment } from '../../worker/health';

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
const healthScenarios = [
  'health-public',
  'health-authorized',
  'health-denied',
  'health-incident',
  'health-refresh-redirect',
  'health-state-unavailable',
] as const;
type HealthScenario = (typeof healthScenarios)[number];

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

async function runHealth(scenario: HealthScenario, incoming?: Request) {
  let calls = 0;
  let endpointsMatch = true;
  let manualRedirects = true;
  const credential = 'a'.repeat(64); // Inert fixture only, never a deployed secret.
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const nativeRequest = new Request(input, init);
    calls++;
    endpointsMatch &&=
      nativeRequest.url === endpoints[1] && nativeRequest.method === 'POST';
    manualRedirects &&= nativeRequest.redirect === 'manual';
    if (!endpointsMatch || !manualRedirects)
      throw new Error('Unexpected health fixture upstream request.');
    if (scenario === 'health-refresh-redirect')
      return new Response(null, {
        status: 302,
        headers: { Location: 'https://redirect.invalid/not-followed' },
      });
    return Response.json({
      access_token: 'unit-test-access-token',
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/gmail.send',
    });
  }) as typeof fetch;
  const env: HealthEnvironment = {
    ...environment,
    HEALTHCHECK_TOKEN: credential,
    MONITORING_STATE: {
      get: async (key: string) => {
        if (scenario === 'health-state-unavailable')
          throw new Error('Fixture store unavailable');
        return scenario === 'health-incident' && key === 'contact:delivery'
          ? 'fixture incident'
          : null;
      },
      put: async () => {},
      delete: async () => {},
    } as HealthEnvironment['MONITORING_STATE'],
  };
  const publicProbe = scenario === 'health-public';
  const response = await handleHealth(
    incoming ??
      new Request(`${origin}/api/health`, {
        method: publicProbe ? 'GET' : 'POST',
        headers: publicProbe
          ? {}
          : {
              Authorization:
                'Bearer ' +
                (scenario === 'health-denied' ? 'b'.repeat(64) : credential),
            },
      }),
    env,
    fetcher,
  );
  const result = (await response.json()) as {
    ok?: unknown;
    contactAvailable?: unknown;
  };
  if (publicProbe && (result.ok !== true || result.contactAvailable !== true))
    throw new Error('Unexpected public health fixture response.');
  if (!publicProbe && result.ok !== (response.status === 200))
    throw new Error('Unexpected private health fixture response.');
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
    if (pathname === '/incoming-health' && request.method === 'POST')
      return runHealth('health-authorized', request);
    if (request.method !== 'GET') return new Response(null, { status: 405 });
    if (pathname === '/health')
      return new Response(null, {
        status: 204,
        headers: { 'X-Contact-Fixture': 'workerd-runtime' },
      });
    const scenario = pathname.slice('/case/'.length);
    if (!pathname.startsWith('/case/'))
      return new Response(null, { status: 404 });
    if (healthScenarios.includes(scenario as HealthScenario))
      return runHealth(scenario as HealthScenario);
    if (scenarios.includes(scenario as Scenario))
      return run(scenario as Scenario);
    return new Response(null, { status: 404 });
  },
};
