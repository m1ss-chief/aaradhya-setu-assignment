// Signed session tokens for the admin login.
//
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature).
// Uses only the Web Crypto API, so the same code runs in the middleware
// (Edge runtime), in route handlers and in the tests.

export const SESSION_COOKIE = 'as_admin_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // one working shift

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toB64url(bytes) {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET must be set (at least 32 characters) in production.');
  }
  return 'dev-only-insecure-secret-change-me-0123456789';
}

let keyCache = { secret: null, key: null };
async function hmacKey() {
  const s = secret();
  if (keyCache.secret !== s) {
    const key = await crypto.subtle.importKey('raw', encoder.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ]);
    keyCache = { secret: s, key };
  }
  return keyCache.key;
}

// payload: { sub: username, name, role }
export async function createSession(payload, { now = Date.now(), ttlSeconds = SESSION_TTL_SECONDS } = {}) {
  const body = { ...payload, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + ttlSeconds };
  const data = toB64url(encoder.encode(JSON.stringify(body)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(data));
  return `${data}.${toB64url(sig)}`;
}

// Returns the payload, or null if the token is missing, tampered with or expired.
export async function verifySession(token, { now = Date.now() } = {}) {
  if (!token || typeof token !== 'string') return null;
  const [data, sig, extra] = token.split('.');
  if (!data || !sig || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), encoder.encode(data));
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(fromB64url(data)));
    if (!payload.exp || payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}
