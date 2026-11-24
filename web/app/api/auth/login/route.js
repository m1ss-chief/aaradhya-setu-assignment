import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../lib/repo/mongo-repo.js';
import { authenticate } from '../../../../lib/auth-service.js';
import { ServiceError } from '../../../../lib/bookings-service.js';
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '../../../../lib/session.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// Slow down password guessing: 5 failed attempts per admin ID + IP, then a 15 minute lock.
// Kept in memory, which is enough for a single-server prototype.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = globalThis._loginFailures || (globalThis._loginFailures = new Map());

// POST /api/auth/login  { username, password }
export const POST = handle(async (request) => {
  const { username, password } = await request.json().catch(() => ({}));
  if (!username || !password) throw new ServiceError('Enter your admin ID and password');

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  const key = `${ip}:${String(username).trim().toLowerCase()}`;
  const entry = failures.get(key);
  if (entry && entry.count >= MAX_FAILURES && Date.now() - entry.last < LOCK_MS) {
    const minutes = Math.ceil((LOCK_MS - (Date.now() - entry.last)) / 60000);
    throw new ServiceError(`Too many failed attempts. Try again in ${minutes} minute(s).`, 429);
  }

  const admin = await authenticate(mongoRepo, username, password);
  if (!admin) {
    const count = entry && Date.now() - entry.last < LOCK_MS ? entry.count + 1 : 1;
    failures.set(key, { count, last: Date.now() });
    throw new ServiceError('Incorrect admin ID or password', 401);
  }
  failures.delete(key);

  const token = await createSession({ sub: admin.username, name: admin.name, role: admin.role });
  const res = NextResponse.json({ admin: { username: admin.username, name: admin.name, role: admin.role } });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
});
