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
import { saveAdmin, changeOwnPassword, authenticate } from '../lib/auth-service.js';
import { phoneProblem } from '../lib/notifier.js';
import { createMemoryRepo } from '../lib/repo/memory-repo.js';
import { bookInSlot } from './helpers.js';
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
  const { bookingId } = await bookInSlot(repo, sample);
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
  const a = await bookInSlot(repo, sample);
  const { notification } = await cancelBooking(repo, a.bookingId, { reason: 'Duplicate booking' });
  assert.equal(notification, null);
  assert.equal((await listNotifications(repo, { bookingId: a.bookingId })).length, 0);

  const b = await bookInSlot(repo, sample);
  for (const s of ['Confirmed', 'In Progress', 'Completed']) await changeStatus(repo, b.bookingId, s, { at: '2026-12-05T05:00:00.000Z' });
  await assert.rejects(cancelBooking(repo, b.bookingId, { reason: 'too late' }), /no longer be cancelled/);
});

test('cancelled bookings are counted but excluded from booking value', async () => {
  const repo = createMemoryRepo();
  await bookInSlot(repo, sample);
  const b = await bookInSlot(repo, { ...sample, amount: 5000 });
  await cancelBooking(repo, b.bookingId, { reason: 'Refunded' });
  const stats = await getStats(repo);
  assert.equal(stats.total, 2);
  assert.equal(stats.byStatus.Cancelled, 1);
  assert.equal(stats.revenue, 2100);
  const { bookings } = await listBookings(repo, { status: 'Cancelled' });
  assert.equal(bookings.length, 1);
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
  const { bookingId } = await bookInSlot(repo, { ...sample, phone: '+91 98765 4321' });
  const { notification } = await changeStatus(repo, bookingId, 'Confirmed');
  assert.equal(notification.delivery.status, 'failed');
  assert.match(notification.delivery.error, /10 digits/);
  assert.equal((await getStats(repo)).failedMessages, 1);
  assert.equal((await listNotifications(repo, { delivery: 'failed' })).length, 1);

  // Resending to the same wrong number fails again and counts the attempt.
  const retry = await resendNotification(repo, notification.id, { by: 'Setu Admin' });
  assert.equal(retry.delivery.status, 'failed');
  assert.equal(retry.attempts, 2);

  // Fix the number, resend: delivered to the NEW number.
  await updateBooking(repo, bookingId, { phone: '+91 98765 43210' });
  const [first, second] = await Promise.allSettled([
    resendNotification(repo, notification.id, { by: 'Setu Admin' }),
    resendNotification(repo, notification.id, { by: 'Setu Admin' }),
  ]);
  const ok = [first, second].filter((r) => r.status === 'fulfilled');
  assert.equal(ok.length, 1, 'only one resend goes through');
  assert.equal(ok[0].value.delivery.status, 'sent');
  assert.equal(ok[0].value.to, '+91 98765 43210');
  assert.equal(ok[0].value.attempts, 3);
  assert.equal(ok[0].value.lastAttemptBy, 'Setu Admin');
  await assert.rejects(resendNotification(repo, notification.id), /Only failed/);
  await assert.rejects(resendNotification(repo, 'nope'), /not found/);
  assert.equal((await getStats(repo)).failedMessages, 0);
});

test('seed data includes a failed message and a cancelled booking for the demo', async () => {
  const repo = createMemoryRepo();
  await seed(repo, new Date('2026-11-24T00:00:00Z'));
  const stats = await getStats(repo);
  assert.equal(stats.total, 21);
  assert.equal(stats.byStatus.Cancelled, 1);
  assert.equal(stats.failedMessages, 1);
  assert.equal(stats.needsSlot, 1, 'the Shopify order for the closed day waits for a slot');
  // Every active booking with a slot holds exactly one seat.
  const active = repo.bookings.filter((b) => b.slotId && b.status !== 'Cancelled').length;
  assert.equal(repo.slots.reduce((sum, s) => sum + s.booked, 0), active);
  assert.ok(repo.slots.every((s) => s.booked <= s.capacity));
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

test('admins can reword messages; placeholders are checked; reset restores the default', async () => {
  const repo = createMemoryRepo();
  const custom = 'Jai Shri Ram {{devoteeName}}! {{pujaName}} confirmed. ID {{bookingId}}';
  await saveTemplate(repo, 'Confirmed', custom, { by: 'Setu Admin' });
  const { templates, meta } = await getTemplates(repo);
  assert.equal(templates.Confirmed, custom);
  assert.equal(meta.Confirmed.updatedBy, 'Setu Admin');

  const { bookingId } = await bookInSlot(repo, sample);
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
