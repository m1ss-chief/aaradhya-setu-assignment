// Admin accounts: login and passwords.
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
  delete rest.role; // left over from an earlier version with roles
  return rest;
}

function validateUsername(username) {
  if (!USERNAME_PATTERN.test(username)) {
    throw new ServiceError('Admin ID must be 3–32 characters: lowercase letters, numbers, dot, dash or underscore');
  }
}

function validatePassword(password) {
  const p = String(password || '');
  if (p.length < MIN_PASSWORD_LENGTH) throw new ServiceError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (p.length > 128) throw new ServiceError('Password is too long');
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw new ServiceError('Password must contain letters and numbers');
}

function cleanName(name, fallback) {
  const n = String(name || '').trim();
  if (n.length > 60) throw new ServiceError('Name is too long');
  return n || fallback;
}

// Creates an admin, or resets the password/name/role of an existing one (seed and CLI scripts).
export async function saveAdmin(repo, { username, password, name }) {
  const id = normalizeUsername(username);
  validateUsername(id);
  validatePassword(password);
  const admin = await repo.upsertAdmin({
    username: id,
    name: cleanName(name, id),
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

// ───────────────────────── Own account ─────────────────────────

export async function changeOwnPassword(repo, username, currentPassword, newPassword) {
  const admin = await repo.findAdminByUsername(normalizeUsername(username));
  if (!admin) throw new ServiceError('Admin not found', 404);
  if (!(await verifyPassword(String(currentPassword || ''), admin.passwordHash))) {
    throw new ServiceError('Your current password is not correct', 400);
  }
  validatePassword(newPassword);
  if (currentPassword === newPassword) throw new ServiceError('Choose a password different from the current one');
  await repo.updateAdmin(admin.username, { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() });
  return { ok: true };
}
