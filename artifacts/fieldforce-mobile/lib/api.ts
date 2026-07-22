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

function baseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  // local dev fallback
  return 'http://localhost:8080';
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
    throw new Error(message);
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
