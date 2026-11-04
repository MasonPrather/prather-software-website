import {
  checkGmailAuthorization,
  gmailConfigured,
  type GmailEnvironment,
} from './gmail';
import {
  monitoringStateHealthy,
  type MonitoringEnvironment,
} from './monitoring-state';

export type HealthEnvironment = Pick<
  Env,
  | 'CONTACT_ENABLED'
  | 'CONTACT_DELIVERY_VERIFIED'
  | 'ALLOWED_ORIGIN'
  | 'TURNSTILE_HOSTNAME'
  | 'CONTACT_FROM'
  | 'CONTACT_TO'
  | 'CONTACT_RATE_LIMITER'
> &
  MonitoringEnvironment &
  GmailEnvironment & { TURNSTILE_SECRET?: string; HEALTHCHECK_TOKEN?: string };

export function contactAvailable(env: HealthEnvironment): boolean {
  return (
    env.CONTACT_ENABLED === 'true' &&
    env.CONTACT_DELIVERY_VERIFIED === 'true' &&
    Boolean(
      env.TURNSTILE_SECRET?.trim() &&
      gmailConfigured(env) &&
      env.CONTACT_RATE_LIMITER &&
      env.CONTACT_FROM?.trim() &&
      env.CONTACT_TO?.trim() &&
      env.TURNSTILE_HOSTNAME?.trim(),
    )
  );
}

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...(status === 405 ? { Allow: 'GET, POST' } : {}),
    },
  });
}

async function authorized(
  provided: string,
  expected: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  // Fixed-size hashes avoid revealing the expected secret's length.
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

async function emptyBody(request: Request): Promise<boolean> {
  const length = request.headers.get('Content-Length');
  if (length !== null && !/^0+$/.test(length)) return false;
  if (!request.body) return true;
  // Incoming HTTP can expose a stream even for Content-Length: 0.
  // Inspect actual bytes after authorization without buffering a payload.
  const reader = request.body.getReader();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let cancelDeadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const empty = await Promise.race([
      (async () => {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return true;
          if (value.byteLength > 0) return false;
        }
      })(),
      new Promise<false>((resolve) => {
        deadline = setTimeout(() => resolve(false), 1000);
      }),
    ]);
    if (!empty) {
      // Cancel pending reads, but never wait indefinitely for cancellation I/O.
      await Promise.race([
        reader.cancel().catch(() => {}),
        new Promise<void>((resolve) => {
          cancelDeadline = setTimeout(resolve, 50);
        }),
      ]);
    }
    return empty;
  } catch {
    return false;
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
    if (cancelDeadline !== undefined) clearTimeout(cancelDeadline);
    try {
      reader.releaseLock();
    } catch {}
  }
}

/** Public liveness never touches Google; only an authenticated probe refreshes. */
export async function handleHealth(
  request: Request,
  env: HealthEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (!['GET', 'POST'].includes(request.method))
    return reply(405, { ok: false });
  const url = new URL(request.url);
  if (url.search) return reply(400, { ok: false });
  if (request.method === 'GET')
    return reply(200, { ok: true, contactAvailable: contactAvailable(env) });

  const expected = env.HEALTHCHECK_TOKEN;
  const header = request.headers.get('Authorization') ?? '';
  if (!expected || !/^[a-fA-F0-9]{64}$/.test(expected))
    return reply(503, { ok: false });
  if (!header.startsWith('Bearer ') || header.length > 520)
    return reply(401, { ok: false });
  let authenticated = false;
  try {
    authenticated = await authorized(header.slice(7), expected);
  } catch {
    return reply(503, { ok: false });
  }
  if (!authenticated) return reply(401, { ok: false });
  if (!(await emptyBody(request))) return reply(400, { ok: false });
  if (!contactAvailable(env)) return reply(503, { ok: false });
  if (!(await monitoringStateHealthy(env))) return reply(503, { ok: false });
  const available = await checkGmailAuthorization(env, fetcher);
  return reply(available ? 200 : 503, { ok: available });
}
