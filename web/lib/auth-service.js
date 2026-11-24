// Admin accounts: login, team management and passwords.
// Like bookings-service.js, every function takes a `repo`, so it is tested
// with the in-memory repo and runs on MongoDB in the app.

import { hashPassword, verifyPassword } from './passwords.js';
import { ServiceError } from './bookings-service.js';
import { ROLES } from './permissions.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 8;

// A real hash of a random password, checked when the username does not exist,
// so a wrong username takes as long as a wrong password (no user enumeration by timing).
let dummyHash = null;

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

// Accounts created before roles existed had role "admin": treat them as owners.
export function normalizeRole(role) {
  return role === 'admin' ? 'owner' : role;
}

export function publicAdmin(admin) {
  if (!admin) return null;
  const { passwordHash, ...rest } = admin;
  return { ...rest, role: normalizeRole(rest.role) };
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

function validateRole(role) {
  if (!ROLES.includes(role)) throw new ServiceError(`Role must be one of: ${ROLES.join(', ')}`);
}

function cleanName(name, fallback) {
  const n = String(name || '').trim();
  if (n.length > 60) throw new ServiceError('Name is too long');
  return n || fallback;
}

// Creates an admin, or resets the password/name/role of an existing one (seed and CLI scripts).
export async function saveAdmin(repo, { username, password, name, role = 'owner' }) {
  const id = normalizeUsername(username);
  validateUsername(id);
  validatePassword(password);
  validateRole(role);
  const admin = await repo.upsertAdmin({
    username: id,
    name: cleanName(name, id),
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

// ───────────────────────── Team management (owners) ─────────────────────────

export async function listAdmins(repo) {
  const admins = await repo.listAdmins();
  return admins.map(publicAdmin).sort((a, b) => (a.role === b.role ? a.username.localeCompare(b.username) : a.role === 'owner' ? -1 : 1));
}

export async function createAdmin(repo, { username, password, name, role = 'staff' }, { by } = {}) {
  const id = normalizeUsername(username);
  validateUsername(id);
  validatePassword(password);
  validateRole(role);
  if (await repo.findAdminByUsername(id)) throw new ServiceError(`The admin ID "${id}" is already taken`, 409);
  const admin = await repo.upsertAdmin({
    username: id,
    name: cleanName(name, id),
    role,
    passwordHash: await hashPassword(password),
    ...(by ? { createdBy: by } : {}),
  });
  return publicAdmin(admin);
}

async function ownerCount(repo) {
  return (await repo.listAdmins()).filter((a) => normalizeRole(a.role) === 'owner').length;
}

async function getAdmin(repo, username) {
  const admin = await repo.findAdminByUsername(normalizeUsername(username));
  if (!admin) throw new ServiceError('Admin not found', 404);
  return admin;
}

// Owners can change another admin's name, role or set a new (temporary) password.
export async function updateAdmin(repo, actorUsername, username, { name, role, password } = {}) {
  const admin = await getAdmin(repo, username);
  const changes = {};
  if (name !== undefined) changes.name = cleanName(name, admin.username);
  if (role !== undefined && role !== normalizeRole(admin.role)) {
    validateRole(role);
    if (admin.username === actorUsername) throw new ServiceError("You can't change your own role", 409);
    if (normalizeRole(admin.role) === 'owner' && (await ownerCount(repo)) <= 1) {
      throw new ServiceError('There must always be at least one owner', 409);
    }
    changes.role = role;
  }
  if (password !== undefined && password !== '') {
    validatePassword(password);
    changes.passwordHash = await hashPassword(password);
  }
  if (Object.keys(changes).length === 0) throw new ServiceError('Nothing to update');
  return publicAdmin(await repo.updateAdmin(admin.username, changes));
}

export async function removeAdmin(repo, actorUsername, username) {
  const admin = await getAdmin(repo, username);
  if (admin.username === actorUsername) throw new ServiceError("You can't remove your own account", 409);
  if (normalizeRole(admin.role) === 'owner' && (await ownerCount(repo)) <= 1) {
    throw new ServiceError('There must always be at least one owner', 409);
  }
  await repo.deleteAdmin(admin.username);
  return { username: admin.username };
}

// ───────────────────────── Own account ─────────────────────────

export async function changeOwnPassword(repo, username, currentPassword, newPassword) {
  const admin = await getAdmin(repo, username);
  if (!(await verifyPassword(String(currentPassword || ''), admin.passwordHash))) {
    throw new ServiceError('Your current password is not correct', 400);
  }
  validatePassword(newPassword);
  if (currentPassword === newPassword) throw new ServiceError('Choose a password different from the current one');
  await repo.updateAdmin(admin.username, { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() });
  return { ok: true };
}
