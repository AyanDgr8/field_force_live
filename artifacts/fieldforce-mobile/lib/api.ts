/**
 * Lightweight fetch wrapper for the FieldForce mobile API.
 * All mobile endpoints live under /api/* on the same domain as the admin panel.
 *
 * Auth: mobile endpoints trust a caller-supplied `userId` in the body (JWT is
 * stored but currently not enforced server-side — acceptable for MVP).
 */

let _token: string | null = null;

export function setApiToken(t: string | null) {
  _token = t;
}

/**
 * Resolution order:
 *   1. EXPO_PUBLIC_API_URL  — explicit full origin, e.g. https://mwmcrm.voicemeetme.net
 *                             or http://192.168.1.50:7070 when testing on a real device.
 *   2. EXPO_PUBLIC_DOMAIN   — bare host (Replit-style); assumed https.
 *   3. localhost:<API_PORT> — local dev. Must match API_PORT in the root .env (7070).
 *
 * A physical phone cannot reach the dev machine over `localhost`, so set
 * EXPO_PUBLIC_API_URL to the LAN IP when running on-device.
 */
export function baseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain.replace(/\/+$/, '')}`;

  const port = process.env.EXPO_PUBLIC_API_PORT ?? '7070';
  return `http://localhost:${port}`;
}

/**
 * Carries the HTTP status so callers (notably the offline queue) can tell a
 * retryable server/network fault from a permanent rejection of the payload.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** 4xx means the request itself is bad — replaying it will fail identically. */
  get isPermanent(): boolean {
    return (
      this.status >= 400 &&
      this.status < 500 &&
      // These two are explicitly transient despite being 4xx.
      this.status !== 408 &&
      this.status !== 429
    );
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body?.error ?? body?.message ?? message;
    } catch {
      // ignore parse error
    }
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  token?: string | null,
): Promise<T> {
  const tok = token !== undefined ? token : _token;
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export async function apiGet<T>(
  path: string,
  params?: Record<string, string | number>,
  token?: string | null,
): Promise<T> {
  const tok = token !== undefined ? token : _token;
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString() : '';
  const res = await fetch(`${baseUrl()}${path}${qs}`, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  return handleResponse<T>(res);
}
