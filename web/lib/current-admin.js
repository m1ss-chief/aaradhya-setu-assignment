import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './session.js';
import { mongoRepo } from './repo/mongo-repo.js';
import { publicAdmin } from './auth-service.js';
import { ServiceError } from './bookings-service.js';

// The signed session payload ({ sub, name }), or null.
export async function currentSession() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

// The signed-in admin, loaded fresh from the database, so a removed account is
// refused immediately, not when the 8-hour session runs out.
export async function requireAdmin() {
  const session = await currentSession();
  if (!session) throw new ServiceError('Please sign in', 401);
  const admin = publicAdmin(await mongoRepo.findAdminByUsername(session.sub));
  if (!admin) throw new ServiceError('Your account no longer exists. Please sign in again.', 401);
  return admin;
}

// For server components: the admin or null (never throws).
export async function currentAdmin() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}
