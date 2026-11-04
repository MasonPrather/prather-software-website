import { inquiryCategories, validateContact } from '../src/lib/contact';
import { isMailboxAddress, sendGmailInquiry } from './gmail';
import {
  contactAvailable,
  handleHealth,
  type HealthEnvironment,
} from './health';
import { updateContactIncident } from './monitoring-state';

export type ContactEnvironment = HealthEnvironment;
const MAX_BODY_BYTES = 16_384;
const REQUEST_TIMEOUT_MS = 10_000;
function json(
  status: number,
  message: string,
  extra: Record<string, unknown> = {},
): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (status === 405) headers.Allow = 'POST';
  if (status === 429) headers['Retry-After'] = '60';
  return new Response(
    JSON.stringify({ ok: status === 200, message, ...extra }),
    { status, headers },
  );
}
async function verificationUnavailable(
  env: ContactEnvironment,
  stage: 'request' | 'response',
  reason: 'http' | 'exception' | 'timeout',
  status?: number,
  context?: Pick<ExecutionContext, 'waitUntil'>,
): Promise<Response> {
  // Fixed enums and a bounded status are the only diagnostic data retained.
  try {
    console.warn('contact_verification_unavailable', {
      stage,
      reason,
      ...(typeof status === 'number' &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
        ? { status }
        : {}),
    });
  } catch {
    // Diagnostics must never alter the fail-closed response.
  }
  await updateContactIncident(env, 'verification', true, context);
  return json(502, 'Security verification is unavailable. Please try again.');
}

function verificationFailureReason(
  error: unknown,
  signal: AbortSignal,
): 'exception' | 'timeout' {
  return signal.aborted ||
    (error instanceof Error && error.name === 'TimeoutError')
    ? 'timeout'
    : 'exception';
}
/** Bounds actual bytes even if Content-Length is absent or dishonest. */
async function readBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get('Content-Length');
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)
  )
    return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
    bytes,
  );
}
/** Tests inject fetch; visitor input never chooses an external destination. */
export async function handleContact(
  request: Request,
  env: ContactEnvironment,
  fetcher: typeof fetch = fetch,
  context?: Pick<ExecutionContext, 'waitUntil'>,
): Promise<Response> {
  if (request.method !== 'POST')
    return json(405, 'Use the contact form to submit an inquiry.');
  if (!contactAvailable(env))
    return json(
      503,
      'Contact submissions are not available yet. No message was sent.',
    );
  let configuredOrigin: URL;
  try {
    configuredOrigin = new URL(env.ALLOWED_ORIGIN);
  } catch {
    return json(503, 'Contact submissions are temporarily unavailable.');
  }
  const requestUrl = new URL(request.url);
  if (
    configuredOrigin.origin !== requestUrl.origin ||
    request.headers.get('Origin') !== configuredOrigin.origin ||
    env.TURNSTILE_HOSTNAME !== configuredOrigin.hostname ||
    !['https:', 'http:'].includes(configuredOrigin.protocol) ||
    (configuredOrigin.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(configuredOrigin.hostname))
  )
    return json(403, 'Please submit this form from this website.');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site')
    return json(403, 'Please submit this form from this website.');
  if (
    request.headers
      .get('Content-Type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() !== 'application/json'
  )
    return json(415, 'The inquiry must be submitted as JSON.');
  try {
    const clientIp = request.headers.get('CF-Connecting-IP') || 'local';
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`contact:${clientIp}`),
    );
    const key = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const limit = await env.CONTACT_RATE_LIMITER.limit({ key });
    if (!limit.success)
      return json(
        429,
        'Too many attempts. Please wait a minute before trying again.',
      );
  } catch {
    return json(
      503,
      'Security protection is temporarily unavailable. No message was sent.',
    );
  }
  let input: unknown;
  try {
    const body = await readBody(request);
    if (body === null)
      return json(
        413,
        'Your inquiry is too large. Please shorten it and try again.',
      );
    input = JSON.parse(body);
  } catch {
    return json(400, 'The inquiry could not be read. Please try again.');
  }
  if (
    input &&
    typeof input === 'object' &&
    'website' in input &&
    (typeof input.website !== 'string' || input.website.trim().length > 0)
  )
    return json(400, 'The inquiry could not be accepted. No message was sent.');
  const result = validateContact(input);
  if (!result.valid)
    return json(422, 'Please check the highlighted fields.', {
      errors: result.errors,
    });
  const submission = result.value;
  if (!isMailboxAddress(submission.email))
    return json(422, 'Please check the highlighted fields.', {
      errors: { email: 'Enter a valid single email address.' },
    });
  const verificationSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let verification: Response;
  try {
    verification = await fetcher(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          secret: env.TURNSTILE_SECRET!,
          response: submission.token,
        }),
        // Workers supports manual redirects; non-2xx responses fail closed below.
        redirect: 'manual',
        signal: verificationSignal,
      },
    );
  } catch (error) {
    return verificationUnavailable(
      env,
      'request',
      verificationFailureReason(error, verificationSignal),
      undefined,
      context,
    );
  }
  if (!verification.ok)
    return verificationUnavailable(
      env,
      'response',
      'http',
      verification.status,
      context,
    );
  let verdict: unknown;
  try {
    verdict = await verification.json();
  } catch (error) {
    return verificationUnavailable(
      env,
      'response',
      verificationFailureReason(error, verificationSignal),
      undefined,
      context,
    );
  }
  if (
    !verdict ||
    typeof verdict !== 'object' ||
    !('success' in verdict) ||
    verdict.success !== true ||
    !('action' in verdict) ||
    verdict.action !== 'contact' ||
    !('hostname' in verdict) ||
    verdict.hostname !== env.TURNSTILE_HOSTNAME
  )
    return json(
      403,
      'Security verification expired or failed. Please try again.',
      {
        errors: {
          verification:
            'Complete a new security verification before submitting.',
        },
      },
    );
  await updateContactIncident(env, 'verification', false, context);
  try {
    const category = inquiryCategories.find(
      (item) => item.value === submission.category,
    )!.label;
    const accepted = await sendGmailInquiry(
      env,
      {
        name: submission.name,
        email: submission.email,
        categoryLabel: category,
        message: submission.message,
      },
      fetcher,
    );
    if (!accepted) {
      await updateContactIncident(env, 'delivery', true, context);
      return json(
        502,
        'The email service did not confirm acceptance. Please try again later.',
      );
    }
    await updateContactIncident(env, 'delivery', false, context);
    return json(
      200,
      'Your inquiry was accepted by our email service. Thank you for getting in touch.',
    );
  } catch {
    await updateContactIncident(env, 'delivery', true, context);
    return json(
      502,
      'We could not confirm email acceptance. Please wait before trying again.',
    );
  }
}
export function canonicalRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (
    url.hostname !== 'www.prathersoftware.com' &&
    !(url.hostname === 'prathersoftware.com' && url.protocol === 'http:')
  )
    return null;
  url.protocol = 'https:';
  url.host = 'prathersoftware.com';
  url.port = '';
  return Response.redirect(url.toString(), 308);
}

export function applySecurityHeaders(
  response: Response,
  allowIndexing = false,
): Response {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  result.headers.set('X-Frame-Options', 'DENY');
  if (!allowIndexing || response.status >= 400)
    result.headers.set('X-Robots-Tag', 'noindex, nofollow');
  result.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  result.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com/beacon.min.js",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com",
      'frame-src https://challenges.cloudflare.com',
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  );
  return result;
}
export default {
  async fetch(request, env, context): Promise<Response> {
    try {
      const indexingEnabled = env.SITE_INDEXING === 'enabled';
      const redirect = indexingEnabled ? canonicalRedirect(request) : null;
      if (redirect) return applySecurityHeaders(redirect, true);
      const pathname = new URL(request.url).pathname;
      const response =
        pathname === '/api/contact' || pathname === '/api/contact/'
          ? await handleContact(request, env, fetch, context)
          : pathname === '/api/health' || pathname === '/api/health/'
            ? await handleHealth(request, env)
            : pathname.startsWith('/api/')
              ? json(404, 'Endpoint not found.')
              : await env.ASSETS.fetch(request);
      return applySecurityHeaders(
        response,
        indexingEnabled && !pathname.startsWith('/api/'),
      );
    } catch {
      console.error(JSON.stringify({ event: 'request_failed' }));
      return applySecurityHeaders(
        json(500, 'Something went wrong. Please try again later.'),
      );
    }
  },
} satisfies ExportedHandler<Env>;
