import { test } from 'node:test';
import assert from 'node:assert/strict';

import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { saveAdmin, authenticate } from '../lib/auth-service.js';
import { createSession, verifySession } from '../lib/session.js';
import { createBooking, changeStatus, updateBooking, deleteBooking, getBooking, listNotifications, getStats } from '../lib/bookings-service.js';
import { createMemoryRepo } from '../lib/repo/memory-repo.js';

const sample = {
  devoteeName: 'Ananya Sharma',
  phone: '+91 98765 43210',
  pujaName: 'Rudrabhishek',
  templeName: 'Kashi Vishwanath, Varanasi',
  pujaDate: '2026-12-05T04:30:00.000Z',
  amount: 2100,
};

test('passwords are salted scrypt hashes and verify correctly', async () => {
  const a = await hashPassword('Setu@2026');
  const b = await hashPassword('Setu@2026');
  assert.match(a, /^scrypt\$/);
  assert.notEqual(a, b, 'same password, different salt');
  assert.ok(!a.includes('Setu@2026'));
  assert.ok(await verifyPassword('Setu@2026', a));
  assert.ok(!(await verifyPassword('setu@2026', a)));
  assert.ok(!(await verifyPassword('anything', 'not-a-hash')));
});

test('admin login: right password works, wrong password or unknown ID fails', async () => {
  const repo = createMemoryRepo();
  const saved = await saveAdmin(repo, { username: ' Admin ', password: 'Setu@2026', name: 'Setu Admin' });
  assert.equal(saved.username, 'admin', 'IDs are case-insensitive');
  assert.equal(saved.passwordHash, undefined, 'hash never leaves the service');

  const ok = await authenticate(repo, 'ADMIN', 'Setu@2026');
  assert.equal(ok.name, 'Setu Admin');
  assert.ok(ok.lastLoginAt instanceof Date);
  assert.equal(ok.passwordHash, undefined);

  assert.equal(await authenticate(repo, 'admin', 'wrong-password'), null);
  assert.equal(await authenticate(repo, 'nobody', 'Setu@2026'), null);
  assert.equal(await authenticate(repo, '', ''), null);

  await assert.rejects(saveAdmin(repo, { username: 'x', password: 'Setu@2026' }), /Admin ID/);
  await assert.rejects(saveAdmin(repo, { username: 'staff', password: 'short' }), /at least 8/);

  // Saving again resets the password.
  await saveAdmin(repo, { username: 'admin', password: 'New-pass-123', name: 'Setu Admin' });
  assert.equal(await authenticate(repo, 'admin', 'Setu@2026'), null);
  assert.ok(await authenticate(repo, 'admin', 'New-pass-123'));
  assert.equal(repo.admins.length, 1);
});

test('session tokens are signed, expire, and reject tampering', async () => {
  const now = Date.now();
  const token = await createSession({ sub: 'admin', name: 'Setu Admin', role: 'admin' }, { now, ttlSeconds: 60 });
  const session = await verifySession(token, { now });
  assert.equal(session.sub, 'admin');
  assert.equal(session.name, 'Setu Admin');

  assert.equal(await verifySession(token, { now: now + 61_000 }), null, 'expired');
  const [data, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'hacker', exp: 9e9 })).toString('base64url');
  assert.equal(await verifySession(`${forged}.${sig}`), null, 'payload swapped');
  assert.equal(await verifySession(`${data}.${sig.slice(0, -2)}xx`), null, 'signature altered');
  assert.equal(await verifySession('garbage'), null);
  assert.equal(await verifySession(undefined), null);
});

test('updateBooking edits details, validates, and never changes status', async () => {
  const repo = createMemoryRepo();
  const { bookingId } = await createBooking(repo, sample, { by: 'Setu Admin' });

  const updated = await updateBooking(repo, bookingId, { devoteeName: '  Ananya S. Sharma ', amount: '2500', gotra: 'Kashyap' }, { by: 'Setu Admin' });
  assert.equal(updated.devoteeName, 'Ananya S. Sharma');
  assert.equal(updated.amount, 2500);
  assert.equal(updated.gotra, 'Kashyap');
  assert.equal(updated.updatedBy, 'Setu Admin');
  assert.equal(updated.status, 'Pending');
  assert.equal(updated.phone, sample.phone, 'untouched fields stay the same');

  await assert.rejects(updateBooking(repo, bookingId, { status: 'Completed' }), /workflow/);
  await assert.rejects(updateBooking(repo, bookingId, { devoteeName: '' }), /devoteeName is required/);
  await assert.rejects(updateBooking(repo, bookingId, { amount: 0 }), /positive/);
  await assert.rejects(updateBooking(repo, bookingId, { email: 'not-an-email' }), /email/);
  await assert.rejects(updateBooking(repo, bookingId, { phone: 'call me' }), /phone/);
  await assert.rejects(updateBooking(repo, bookingId, { bookingId: 'AS-HACK' }), /Nothing to update/);
  await assert.rejects(updateBooking(repo, 'AS-0000-0000', { amount: 10 }), /not found/);
});

test('deleteBooking removes the booking and its notification history', async () => {
  const repo = createMemoryRepo();
  const keep = await createBooking(repo, sample);
  const gone = await createBooking(repo, { ...sample, devoteeName: 'Rohit Verma' });
  await changeStatus(repo, gone.bookingId, 'Confirmed', { by: 'Setu Admin' });
  await changeStatus(repo, keep.bookingId, 'Confirmed');

  const result = await deleteBooking(repo, gone.bookingId);
  assert.deepEqual(result, { bookingId: gone.bookingId, notificationsDeleted: 1 });
  await assert.rejects(getBooking(repo, gone.bookingId), /not found/);
  assert.equal((await listNotifications(repo, { bookingId: gone.bookingId })).length, 0);
  assert.equal((await listNotifications(repo, {})).length, 1, 'other bookings keep their messages');
  await assert.rejects(deleteBooking(repo, gone.bookingId), /not found/);
});

test('status history records which admin made each change', async () => {
  const repo = createMemoryRepo();
  const { bookingId } = await createBooking(repo, sample, { by: 'Setu Admin' });
  const { booking } = await changeStatus(repo, bookingId, 'Confirmed', { by: 'Priya (Ops)' });
  assert.equal(booking.statusHistory[0].note, 'Created by Setu Admin');
  assert.equal(booking.statusHistory[1].by, 'Priya (Ops)');
});

test('overview stats: revenue by puja and pujas in the next 7 days', async () => {
  const repo = createMemoryRepo();
  const now = new Date('2026-11-24T00:00:00Z');
  await createBooking(repo, { ...sample, pujaDate: '2026-11-26' });
  await createBooking(repo, { ...sample, pujaName: 'Lakshmi Puja', amount: 1500, pujaDate: '2026-11-28' });
  await createBooking(repo, { ...sample, pujaDate: '2026-12-20' }); // too far ahead
  const stats = await getStats(repo, now);
  assert.equal(stats.upcomingCount, 2);
  assert.deepEqual(stats.revenueByPuja.map((p) => [p.puja, p.revenue, p.count]), [
    ['Rudrabhishek', 4200, 2],
    ['Lakshmi Puja', 1500, 1],
  ]);
  assert.equal(stats.averageAmount, 1900);
});
