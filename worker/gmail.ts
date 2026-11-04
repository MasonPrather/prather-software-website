import { inquiryCategories } from '../src/lib/contact';

/** Server-only Gmail transport. Never expose credentials or provider responses. */
export interface GmailEnvironment {
  CONTACT_FROM: string;
  CONTACT_TO: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
}

export interface GmailInquiry {
  name: string;
  email: string;
  categoryLabel: string;
  message: string;
}

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_PROVIDER_BYTES = 32_768;
const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
type GmailStage = 'oauth-refresh' | 'gmail-send';
type DiagnosticEvent =
  'contact_delivery_unavailable' | 'contact_authorization_unavailable';

function diagnostic(
  event: DiagnosticEvent,
  stage: GmailStage,
  reason: 'http' | 'invalid-response' | 'exception' | 'timeout',
  status?: number,
): void {
  // Never retain provider bodies, error messages, inquiry data, or credentials.
  try {
    console.warn(
      JSON.stringify({
        event,
        stage,
        reason,
        ...(typeof status === 'number' &&
        Number.isInteger(status) &&
        status >= 100 &&
        status <= 599
          ? { status }
          : {}),
      }),
    );
  } catch {
    // A diagnostic failure must not change delivery or retry behavior.
  }
}

function exceptionReason(
  error: unknown,
  signal: AbortSignal,
): 'exception' | 'timeout' {
  return signal.aborted ||
    (error instanceof Error && error.name === 'TimeoutError')
    ? 'timeout'
    : 'exception';
}
const atom = "[A-Za-z0-9!#$%&'*+/=?^_\\x60{|}~-]+";
const domainLabel = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const mailbox = new RegExp(
  '^' +
    atom +
    '(?:\\.' +
    atom +
    ')*@' +
    domainLabel +
    '(?:\\.' +
    domainLabel +
    ')+$',
);

/** Accept one ASCII mailbox, never a display name, address list, or header line. */
export function isMailboxAddress(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    !/[^\x21-\x7e]/.test(value) &&
    value.indexOf('@') >= 1 &&
    value.indexOf('@') <= 64 &&
    mailbox.test(value)
  );
}

export function gmailConfigured(env: GmailEnvironment): boolean {
  return (
    isMailboxAddress(env.CONTACT_FROM) &&
    isMailboxAddress(env.CONTACT_TO) &&
    [
      env.GMAIL_CLIENT_ID,
      env.GMAIL_CLIENT_SECRET,
      env.GMAIL_REFRESH_TOKEN,
    ].every((value) => typeof value === 'string' && value.trim().length > 0)
  );
}

function base64Utf8(value: string): string {
  // Inquiry and upstream limits keep this bounded; no Node Buffer dependency.
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function rawMessage(env: GmailEnvironment, inquiry: GmailInquiry): string {
  if (
    !isMailboxAddress(inquiry.email) ||
    !inquiryCategories.some(
      (category) => category.label === inquiry.categoryLabel,
    )
  )
    throw new Error('Invalid email headers');
  const subject = 'Website inquiry: ' + inquiry.categoryLabel;
  const text = (
    'Name: ' +
    inquiry.name +
    '\nEmail: ' +
    inquiry.email +
    '\nInquiry: ' +
    inquiry.categoryLabel +
    '\n\n' +
    inquiry.message
  ).replace(/\r\n?|\n/g, '\r\n');
  const body = base64Utf8(text)
    .match(/.{1,76}/g)!
    .join('\r\n');
  const headers = [
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' +
      crypto.randomUUID() +
      '@' +
      env.CONTACT_FROM.split('@')[1] +
      '>',
    'From: ' + env.CONTACT_FROM,
    'To: ' + env.CONTACT_TO,
    'Reply-To: ' + inquiry.email,
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ];
  return base64Utf8(headers.join('\r\n') + '\r\n\r\n' + body + '\r\n')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function providerObject(
  response: Response,
): Promise<Record<string, unknown>> {
  const length = response.headers.get('Content-Length');
  if (
    length &&
    (!/^\d+$/.test(length) || Number(length) > MAX_PROVIDER_BYTES)
  ) {
    await response.body?.cancel();
    throw new Error('Invalid provider response');
  }
  if (!response.body) throw new Error('Invalid provider response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROVIDER_BYTES) {
        await reader.cancel();
        throw new Error('Invalid provider response');
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
  const parsed: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes),
  );
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Invalid provider response');
  return parsed as Record<string, unknown>;
}

async function refreshAccessToken(
  env: GmailEnvironment,
  fetcher: typeof fetch,
  signal: AbortSignal,
  event: DiagnosticEvent,
  verifyScope = false,
): Promise<string | null> {
  let refreshed: Response;
  try {
    // Workers supports manual redirects; reject non-2xx without forwarding secrets.
    refreshed = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: env.GMAIL_CLIENT_ID!,
        client_secret: env.GMAIL_CLIENT_SECRET!,
        refresh_token: env.GMAIL_REFRESH_TOKEN!,
      }),
      redirect: 'manual',
      signal,
    });
  } catch (error) {
    diagnostic(event, 'oauth-refresh', exceptionReason(error, signal));
    throw error;
  }
  if (!refreshed.ok) {
    diagnostic(event, 'oauth-refresh', 'http', refreshed.status);
    await refreshed.body?.cancel();
    return null;
  }
  let token: Record<string, unknown>;
  try {
    token = await providerObject(refreshed);
  } catch (error) {
    diagnostic(
      event,
      'oauth-refresh',
      signal.aborted ? 'timeout' : 'invalid-response',
    );
    throw error;
  }
  if (
    typeof token.access_token !== 'string' ||
    /[^\x21-\x7e]/.test(token.access_token) ||
    !/^[A-Za-z0-9._~+\/-]+=*$/.test(token.access_token) ||
    (verifyScope &&
      (token.token_type !== 'Bearer' || token.scope !== SEND_SCOPE))
  ) {
    diagnostic(event, 'oauth-refresh', 'invalid-response');
    return null;
  }
  return token.access_token;
}

/** Confirms authorization only. This function never calls Gmail's send endpoint. */
export async function checkGmailAuthorization(
  env: GmailEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!gmailConfigured(env)) return false;
  try {
    return Boolean(
      await refreshAccessToken(
        env,
        fetcher,
        AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        'contact_authorization_unavailable',
        true,
      ),
    );
  } catch {
    return false;
  }
}

/** True means Gmail accepted the message, never a promise of inbox delivery. */
export async function sendGmailInquiry(
  env: GmailEnvironment,
  inquiry: GmailInquiry,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!gmailConfigured(env)) return false;
  const raw = rawMessage(env, inquiry);
  // One deadline covers token refresh, send, and response-body consumption.
  const signal = AbortSignal.timeout(DELIVERY_TIMEOUT_MS);
  const accessToken = await refreshAccessToken(
    env,
    fetcher,
    signal,
    'contact_delivery_unavailable',
  );
  if (!accessToken) return false;
  let sent: Response;
  try {
    sent = await fetcher(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
        redirect: 'manual',
        signal,
      },
    );
  } catch (error) {
    diagnostic(
      'contact_delivery_unavailable',
      'gmail-send',
      exceptionReason(error, signal),
    );
    throw error;
  }
  if (!sent.ok) {
    diagnostic(
      'contact_delivery_unavailable',
      'gmail-send',
      'http',
      sent.status,
    );
    await sent.body?.cancel();
    return false;
  }
  let receipt: Record<string, unknown>;
  try {
    receipt = await providerObject(sent);
  } catch (error) {
    diagnostic(
      'contact_delivery_unavailable',
      'gmail-send',
      signal.aborted ? 'timeout' : 'invalid-response',
    );
    throw error;
  }
  const accepted =
    typeof receipt.id === 'string' && receipt.id.trim().length > 0;
  if (!accepted)
    diagnostic(
      'contact_delivery_unavailable',
      'gmail-send',
      'invalid-response',
    );
  return accepted;
}
