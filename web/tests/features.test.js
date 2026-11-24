import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createBooking,
  changeStatus,
  cancelBooking,
  updateBooking,
  resendNotification,
  listBookings,
  listNotifications,
  getStats,
  getTemplates,
  saveTemplate,
  resetTemplate,
  validateTemplate,
  bookingsToCsv,
  exportBookings,
} from '../lib/bookings-service.js';
import { saveAdmin, createAdmin, updateAdmin, removeAdmin, listAdmins, changeOwnPassword, authenticate, publicAdmin } from '../lib/auth-service.js';
import { can } from '../lib/permissions.js';
import { phoneProblem } from '../lib/notifier.js';
import { createMemoryRepo } from '../lib/repo/memory-repo.js';
import { seed } from '../lib/seed.js';

const sample = {
  devoteeName: 'Ananya Sharma',
  phone: '+91 98765 43210',
  pujaName: 'Rudrabhishek',
  templeName: 'Kashi Vishwanath, Varanasi',
  pujaDate: '2026-12-05T04:30:00.000Z',
  amount: 2100,
};

// ───────────── Cancel ─────────────

test('cancel keeps the booking, records the reason and optionally messages the devotee', async () => {
  const repo = createMemoryRepo();
  const { bookingId } = await createBooking(repo, sample);
  await changeStatus(repo, bookingId, 'Confirmed');

  await assert.rejects(cancelBooking(repo, bookingId, { reason: '  ' }), /reason/);
  const { booking, notification } = await cancelBooking(repo, bookingId, {
    reason: 'Devotee travelling',
    notifyDevotee: true,
    by: 'Setu Admin',
  });
  assert.equal(booking.status, 'Cancelled');
  assert.equal(booking.cancelReason, 'Devotee travelling');
  assert.equal(booking.cancelledBy, 'Setu Admin');
  assert.deepEqual(booking.statusHistory.map((h) => h.status), ['Pending', 'Confirmed', 'Cancelled']);
  assert.match(notification.message, /cancelled/);
  assert.match(notification.message, /Devotee travelling/);

  await assert.rejects(cancelBooking(repo, bookingId, { reason: 'again' }), /already cancelled/);
  await assert.rejects(changeStatus(repo, bookingId, 'In Progress'), /cancelled/);
  await assert.rejects(changeStatus(repo, bookingId, 'Cancelled'), /Cancel booking/);
});

test('cancel without notifying sends nothing; completed pujas cannot be cancelled', async () => {
  const repo = createMemoryRepo();
  const a = await createBooking(repo, sample);
  const { notification } = await cancelBooking(repo, a.bookingId, { reason: 'Duplicate booking' });
  assert.equal(notification, null);
  assert.equal((await listNotifications(repo, { bookingId: a.bookingId })).length, 0);

  const b = await createBooking(repo, sample);
  for (const s of ['Confirmed', 'In Progress', 'Completed']) await changeStatus(repo, b.bookingId, s);
  await assert.rejects(cancelBooking(repo, b.bookingId, { reason: 'too late' }), /no longer be cancelled/);
});

test('cancelled bookings are counted but excluded from booking value', async () => {
  const repo = createMemoryRepo();
  await createBooking(repo, sample);
  const b = await createBooking(repo, { ...sample, amount: 5000 });
  await cancelBooking(repo, b.bookingId, { reason: 'Refunded' });
  const stats = await getStats(repo);
  assert.equal(stats.total, 2);
  assert.equal(stats.byStatus.Cancelled, 1);
  assert.equal(stats.revenue, 2100);
  const { bookings } = await listBookings(repo, { status: 'Cancelled' });
  assert.equal(bookings.length, 1);
});

// ───────────── Roles ─────────────

test('owners can do everything; staff can only run the workflow and resend messages', () => {
  for (const p of ['bookings:create', 'bookings:edit', 'bookings:cancel', 'bookings:delete', 'admins:manage', 'templates:edit', 'workflow:advance', 'notifications:resend']) {
    assert.ok(can('owner', p), `owner ${p}`);
  }
  assert.ok(can('staff', 'workflow:advance'));
  assert.ok(can('staff', 'notifications:resend'));
  for (const p of ['bookings:create', 'bookings:edit', 'bookings:cancel', 'bookings:delete', 'admins:manage', 'templates:edit']) {
    assert.ok(!can('staff', p), `staff must not ${p}`);
  }
  assert.ok(!can('nobody', 'workflow:advance'));
  assert.equal(publicAdmin({ username: 'old', role: 'admin', passwordHash: 'x' }).role, 'owner', 'pre-roles accounts become owners');
});

test('team management: no duplicate IDs, no self-demotion/removal, always one owner', async () => {
  const repo = createMemoryRepo();
  await saveAdmin(repo, { username: 'admin', password: 'Setu@2026', name: 'Setu Admin', role: 'owner' });
  const staff = await createAdmin(repo, { username: 'priya', password: 'Temple123', name: 'Priya', role: 'staff' }, { by: 'Setu Admin' });
  assert.equal(staff.role, 'staff');
  assert.equal(staff.passwordHash, undefined);
  await assert.rejects(createAdmin(repo, { username: 'PRIYA', password: 'Temple123' }), /already taken/);
  await assert.rejects(createAdmin(repo, { username: 'ravi', password: 'onlyletters' }), /letters and numbers/);
  await assert.rejects(createAdmin(repo, { username: 'ravi', password: 'Temple123', role: 'god' }), /Role/);

  await assert.rejects(updateAdmin(repo, 'admin', 'admin', { role: 'staff' }), /own role/);
  await assert.rejects(removeAdmin(repo, 'admin', 'admin'), /own account/);

  // Promote Priya, then she can demote the original owner; but not leave zero owners.
  await updateAdmin(repo, 'admin', 'priya', { role: 'owner' });
  await updateAdmin(repo, 'priya', 'admin', { role: 'staff' });
  await assert.rejects(removeAdmin(repo, 'admin', 'priya'), /at least one owner/);
  assert.deepEqual((await listAdmins(repo)).map((a) => [a.username, a.role]), [['priya', 'owner'], ['admin', 'staff']]);

  // Owner resets a password; the old one stops working.
  await updateAdmin(repo, 'priya', 'admin', { password: 'Fresh-pass-1' });
  assert.equal(await authenticate(repo, 'admin', 'Setu@2026'), null);
  assert.ok(await authenticate(repo, 'admin', 'Fresh-pass-1'));

  await removeAdmin(repo, 'priya', 'admin');
  assert.equal((await listAdmins(repo)).length, 1);
});

test('changing your own password needs the current one', async () => {
  const repo = createMemoryRepo();
  await saveAdmin(repo, { username: 'admin', password: 'Setu@2026', name: 'Setu Admin' });
  await assert.rejects(changeOwnPassword(repo, 'admin', 'wrong', 'Brand-new-1'), /current password/);
  await assert.rejects(changeOwnPassword(repo, 'admin', 'Setu@2026', 'short1'), /at least 8/);
  await assert.rejects(changeOwnPassword(repo, 'admin', 'Setu@2026', 'Setu@2026'), /different/);
  await changeOwnPassword(repo, 'admin', 'Setu@2026', 'Brand-new-1');
  assert.ok(await authenticate(repo, 'admin', 'Brand-new-1'));
  assert.equal(await authenticate(repo, 'admin', 'Setu@2026'), null);
});

// ───────────── Failed messages & resend ─────────────

test('the mock provider rejects malformed numbers', () => {
  assert.equal(phoneProblem('+91 98765 43210'), null);
  assert.match(phoneProblem('+91 98765 4321'), /10 digits/);
  assert.match(phoneProblem('12345'), /valid/);
  assert.equal(phoneProblem('+1 415 555 0100'), null);
});

test('a failed message can be resent after fixing the number; only once even if clicked twice', async () => {
  const repo = createMemoryRepo();
  const { bookingId } = await createBooking(repo, { ...sample, phone: '+91 98765 4321' });
  const { notification } = await changeStatus(repo, bookingId, 'Confirmed');
  assert.equal(notification.delivery.status, 'failed');
  assert.match(notification.delivery.error, /10 digits/);
  assert.equal((await getStats(repo)).failedMessages, 1);
  assert.equal((await listNotifications(repo, { delivery: 'failed' })).length, 1);

  // Resending to the same wrong number fails again and counts the attempt.
  const retry = await resendNotification(repo, notification.id, { by: 'Temple Staff' });
  assert.equal(retry.delivery.status, 'failed');
  assert.equal(retry.attempts, 2);

  // Fix the number, resend: delivered to the NEW number.
  await updateBooking(repo, bookingId, { phone: '+91 98765 43210' });
  const [first, second] = await Promise.allSettled([
    resendNotification(repo, notification.id, { by: 'Temple Staff' }),
    resendNotification(repo, notification.id, { by: 'Temple Staff' }),
  ]);
  const ok = [first, second].filter((r) => r.status === 'fulfilled');
  assert.equal(ok.length, 1, 'only one resend goes through');
  assert.equal(ok[0].value.delivery.status, 'sent');
  assert.equal(ok[0].value.to, '+91 98765 43210');
  assert.equal(ok[0].value.attempts, 3);
  assert.equal(ok[0].value.lastAttemptBy, 'Temple Staff');
  await assert.rejects(resendNotification(repo, notification.id), /Only failed/);
  await assert.rejects(resendNotification(repo, 'nope'), /not found/);
  assert.equal((await getStats(repo)).failedMessages, 0);
});

test('seed data includes a failed message and a cancelled booking for the demo', async () => {
  const repo = createMemoryRepo();
  await seed(repo, new Date('2026-11-24T00:00:00Z'));
  const stats = await getStats(repo);
  assert.equal(stats.total, 20);
  assert.equal(stats.byStatus.Cancelled, 1);
  assert.equal(stats.failedMessages, 1);
});

// ───────────── Server-side pagination ─────────────

test('bookings are paged by the data layer with stable order and totals', async () => {
  const repo = createMemoryRepo();
  for (let i = 0; i < 25; i++) await createBooking(repo, { ...sample, devoteeName: `Devotee ${i}`, amount: 1000 });

  const p1 = await listBookings(repo, { sort: 'amount', pageSize: 10, page: 1 });
  const p3 = await listBookings(repo, { sort: 'amount', pageSize: 10, page: 3 });
  assert.equal(p1.total, 25);
  assert.equal(p1.pages, 3);
  assert.equal(p1.bookings.length, 10);
  assert.equal(p3.bookings.length, 5);

  const all = [];
  for (let page = 1; page <= 3; page++) all.push(...(await listBookings(repo, { sort: 'amount', pageSize: 10, page })).bookings);
  assert.equal(new Set(all.map((b) => b.bookingId)).size, 25, 'same amounts, but no row repeated or skipped');

  assert.equal((await listBookings(repo, { page: 99, pageSize: 10 })).page, 3, 'page past the end shows the last page');
  assert.equal((await listBookings(repo, { pageSize: 5000 })).pageSize, 100, 'page size is capped');
  assert.equal((await listBookings(repo, { page: 'abc' })).page, 1);
  assert.equal((await exportBookings(repo, {})).length, 25, 'export is not paged');
});

test('CSV export escapes quotes and defuses spreadsheet formulas', () => {
  const csv = bookingsToCsv([{ bookingId: 'AS-1', devoteeName: '=HYPERLINK("x")', phone: '+91 98765 43210', pujaName: 'Puja "Special"' }]);
  const [header, row] = csv.split('\n');
  assert.match(header, /^bookingId,devoteeName,phone/);
  assert.match(row, /"'=HYPERLINK\(""x""\)"/);
  assert.match(row, /"\+91 98765 43210"/, 'phone numbers are left alone');
  assert.match(row, /"Puja ""Special"""/);
});

// ───────────── Editable message templates ─────────────

test('owners can reword messages; placeholders are checked; reset restores the default', async () => {
  const repo = createMemoryRepo();
  const custom = 'Jai Shri Ram {{devoteeName}}! {{pujaName}} confirmed. ID {{bookingId}}';
  await saveTemplate(repo, 'Confirmed', custom, { by: 'Setu Admin' });
  const { templates, meta } = await getTemplates(repo);
  assert.equal(templates.Confirmed, custom);
  assert.equal(meta.Confirmed.updatedBy, 'Setu Admin');

  const { bookingId } = await createBooking(repo, sample);
  const { notification } = await changeStatus(repo, bookingId, 'Confirmed');
  assert.equal(notification.message, `Jai Shri Ram Ananya Sharma! Rudrabhishek confirmed. ID ${bookingId}`);

  assert.throws(() => validateTemplate('Confirmed', 'Hi {{name}} {{devoteeName}} {{pujaName}} {{bookingId}}'), /Unknown placeholder/);
  assert.throws(() => validateTemplate('Confirmed', 'Hi {{devoteeName}}'), /must include/);
  assert.throws(() => validateTemplate('Video Available', 'Hi {{devoteeName}} {{pujaName}} {{bookingId}}'), /videoUrl/);
  assert.throws(() => validateTemplate('Confirmed', 'Hi {{devoteeName}} {{pujaName}} {{bookingId}} {{oops'), /not closed/);
  assert.throws(() => validateTemplate('Pending', 'x'), /no message template/);
  assert.throws(() => validateTemplate('Confirmed', ''), /empty/);

  await resetTemplate(repo, 'Confirmed');
  assert.match((await getTemplates(repo)).templates.Confirmed, /^🙏 Namaste/);
});
