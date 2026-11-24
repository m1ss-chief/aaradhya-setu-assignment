import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession } from './session.js';
import { mongoRepo } from './repo/mongo-repo.js';
import { publicAdmin } from './auth-service.js';
import { ServiceError } from './bookings-service.js';
import { can } from './permissions.js';

// The signed session payload ({ sub, name, role }), or null.
export async function currentSession() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

// The signed-in admin, loaded fresh from the database, optionally checking a permission.
// Reading the role from the database (not the cookie) means a role change or a removed
// account takes effect immediately, not when the 8-hour session runs out.
export async function requireAdmin(permission) {
  const session = await currentSession();
  if (!session) throw new ServiceError('Please sign in', 401);
  const admin = publicAdmin(await mongoRepo.findAdminByUsername(session.sub));
  if (!admin) throw new ServiceError('Your account no longer exists. Please sign in again.', 401);
  if (permission && !can(admin.role, permission)) {
    throw new ServiceError("Your role doesn't allow this. Ask an owner.", 403);
  }
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
