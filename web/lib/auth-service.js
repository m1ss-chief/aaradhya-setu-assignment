// Admin accounts: creating them and checking a login.
// Like bookings-service.js, every function takes a `repo`, so it is tested
// with the in-memory repo and runs on MongoDB in the app.

import { hashPassword, verifyPassword } from './passwords.js';
import { ServiceError } from './bookings-service.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 8;

// A real hash of a random password, checked when the username does not exist,
// so a wrong username takes as long as a wrong password (no user enumeration by timing).
let dummyHash = null;

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export function publicAdmin(admin) {
  if (!admin) return null;
  const { passwordHash, ...rest } = admin;
  return rest;
}

function validateCredentials(username, password) {
  if (!USERNAME_PATTERN.test(username)) {
    throw new ServiceError('Admin ID must be 3–32 characters: lowercase letters, numbers, dot, dash or underscore');
  }
  if (String(password || '').length < MIN_PASSWORD_LENGTH) {
    throw new ServiceError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
}

// Creates an admin, or resets the password/name of an existing one (used by the seed and CLI scripts).
export async function saveAdmin(repo, { username, password, name, role = 'admin' }) {
  const id = normalizeUsername(username);
  validateCredentials(id, password);
  const admin = await repo.upsertAdmin({
    username: id,
    name: String(name || id).trim(),
    role,
    passwordHash: await hashPassword(password),
  });
  return publicAdmin(admin);
}

// Returns the admin (without the password hash) or null for wrong credentials.
export async function authenticate(repo, username, password) {
  const id = normalizeUsername(username);
  const admin = id ? await repo.findAdminByUsername(id) : null;
  if (!admin) {
    dummyHash ||= await hashPassword(crypto.randomUUID());
    await verifyPassword(String(password || ''), dummyHash);
    return null;
  }
  if (!(await verifyPassword(String(password || ''), admin.passwordHash))) return null;
  const at = new Date();
  await repo.recordAdminLogin(id, at);
  return publicAdmin({ ...admin, lastLoginAt: at });
}
