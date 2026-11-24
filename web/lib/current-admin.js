import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './session.js';

// The signed-in admin ({ sub, name, role }) for server components and route handlers.
// The middleware already blocks signed-out requests; this is for knowing *who* acted.
export async function currentAdmin() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}
