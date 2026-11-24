import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STATUSES, nextStatus, canTransition, renderTemplate, messageForStatus } from '../lib/workflow.js';
import {
  buildBookingQuery,
  buildSort,
  listBookings,
  createBooking,
  changeStatus,
  listNotifications,
  getStats,
  createBookingsFromShopifyOrder,
} from '../lib/bookings-service.js';
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

test('statuses move forward one step at a time', () => {
  assert.deepEqual(STATUSES, ['Pending', 'Confirmed', 'In Progress', 'Completed', 'Video Available']);
  assert.equal(nextStatus('Pending'), 'Confirmed');
  assert.equal(nextStatus('Video Available'), null);
  assert.ok(canTransition('Confirmed', 'In Progress'));
  assert.ok(!canTransition('Pending', 'Completed'), 'cannot skip steps');
  assert.ok(!canTransition('Completed', 'Confirmed'), 'cannot go backwards');
});

test('templates fill every placeholder and refuse to send a half-filled message', () => {
  assert.equal(renderTemplate('Hi {{name}}, ID {{id}}', { name: 'Mili', id: 'AS-1' }), 'Hi Mili, ID AS-1');
  assert.throws(() => renderTemplate('Watch {{videoUrl}}', {}), /videoUrl/);
  const msg = messageForStatus('Confirmed', { ...sample, bookingId: 'AS-2026-0001' });
  assert.match(msg, /Ananya Sharma/);
  assert.match(msg, /Rudrabhishek/);
  assert.match(msg, /AS-2026-0001/);
  assert.doesNotMatch(msg, /\{\{/);
  assert.equal(messageForStatus('Pending', sample), null, 'no message while pending');
});

test('search query escapes special characters and filters by status/puja/date', () => {
  const q = buildBookingQuery({ q: 'AS-2026 (1)', status: 'Confirmed', puja: 'Lakshmi Puja', from: '2026-12-01' });
  assert.equal(q.status, 'Confirmed');
  assert.equal(q.pujaName, 'Lakshmi Puja');
  assert.equal(q.$or[0].bookingId.$regex, 'AS-2026 \\(1\\)');
  assert.ok(q.pujaDate.$gte instanceof Date);
  assert.throws(() => buildBookingQuery({ status: 'Teleported' }), /Unknown status/);
  assert.deepEqual(buildSort({ sort: 'amount', order: 'asc' }), { amount: 1 });
  assert.deepEqual(buildSort({ sort: 'nonsense' }), { pujaDate: -1 }, 'unknown sort falls back to date');
});

test('createBooking validates input and starts as Pending with sequential IDs', async () => {
  const repo = createMemoryRepo();
  const a = await createBooking(repo, sample);
  const b = await createBooking(repo, { ...sample, devoteeName: 'Rohit Verma' });
  assert.equal(a.status, 'Pending');
  assert.match(a.bookingId, /^AS-\d{4}-0001$/);
  assert.match(b.bookingId, /^AS-\d{4}-0002$/);
  assert.equal(a.statusHistory.length, 1);
  await assert.rejects(createBooking(repo, { ...sample, phone: '' }), /phone is required/);
  await assert.rejects(createBooking(repo, { ...sample, amount: -5 }), /positive/);
  await assert.rejects(createBooking(repo, { ...sample, pujaDate: 'not a date' }), /valid date/);
});

test('changing status records history and creates a WhatsApp notification', async () => {
  const repo = createMemoryRepo();
  const { bookingId } = await createBooking(repo, sample);

  const { booking, notification } = await changeStatus(repo, bookingId, 'Confirmed');
  assert.equal(booking.status, 'Confirmed');
  assert.equal(booking.statusHistory.at(-1).status, 'Confirmed');
  assert.equal(notification.channel, 'whatsapp');
  assert.equal(notification.to, sample.phone);
  assert.equal(notification.delivery.status, 'sent');
  assert.match(notification.message, new RegExp(bookingId));

  await assert.rejects(changeStatus(repo, bookingId, 'Completed'), /can only move to "In Progress"/);
  await changeStatus(repo, bookingId, 'In Progress');
  await changeStatus(repo, bookingId, 'Completed');
  await assert.rejects(changeStatus(repo, bookingId, 'Video Available'), /video link/);
  const last = await changeStatus(repo, bookingId, 'Video Available', { videoUrl: 'https://example.com/v/1' });
  assert.match(last.notification.message, /https:\/\/example\.com\/v\/1/);
  await assert.rejects(changeStatus(repo, bookingId, 'Pending'), /final status/);

  const history = await listNotifications(repo, { bookingId });
  assert.equal(history.length, 4);
  assert.deepEqual(history.map((n) => n.status).sort(), ['Completed', 'Confirmed', 'In Progress', 'Video Available']);
});

test('two admins clicking at once cannot both advance the same booking', async () => {
  const repo = createMemoryRepo();
  const { bookingId } = await createBooking(repo, sample);
  const results = await Promise.allSettled([
    changeStatus(repo, bookingId, 'Confirmed'),
    changeStatus(repo, bookingId, 'Confirmed'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await listNotifications(repo, { bookingId })).length, 1, 'only one message sent');
});

test('dashboard search, filters and sorting work on seeded data', async () => {
  const repo = createMemoryRepo();
  await seed(repo, new Date('2026-11-24T00:00:00Z'));
  const all = await listBookings(repo, {});
  assert.equal(all.length, 20);

  const byName = await listBookings(repo, { q: 'ananya' });
  assert.equal(byName.length, 1);
  assert.equal(byName[0].devoteeName, 'Ananya Sharma');

  const byId = await listBookings(repo, { q: all[0].bookingId });
  assert.equal(byId[0].bookingId, all[0].bookingId);

  const confirmed = await listBookings(repo, { status: 'Confirmed' });
  assert.ok(confirmed.length > 0 && confirmed.every((b) => b.status === 'Confirmed'));

  const cheapestFirst = await listBookings(repo, { sort: 'amount', order: 'asc' });
  for (let i = 1; i < cheapestFirst.length; i++) assert.ok(cheapestFirst[i - 1].amount <= cheapestFirst[i].amount);

  const stats = await getStats(repo);
  assert.equal(stats.total, 20);
  assert.equal(Object.values(stats.byStatus).reduce((a, b) => a + b, 0), 20);
  assert.ok(stats.revenue > 0);

  const videos = await listBookings(repo, { status: 'Video Available' });
  assert.ok(videos.every((b) => b.videoUrl && b.statusHistory.length === 5));
});

test('a Shopify order becomes a booking, with add-ons included in the amount', async () => {
  const repo = createMemoryRepo();
  const order = {
    id: 5550001,
    email: 'ananya@example.com',
    line_items: [
      {
        title: 'Rudrabhishek',
        vendor: 'Kashi Vishwanath, Varanasi',
        price: '2100.00',
        quantity: 1,
        properties: [
          { name: 'Devotee name', value: 'Ananya Sharma' },
          { name: 'WhatsApp number', value: '+91 98765 43210' },
          { name: 'Gotra', value: 'Kashyap' },
          { name: 'Puja date', value: '2026-12-05' },
        ],
      },
      { title: 'Diya & Chunari offering', price: '251.00', quantity: 1, properties: [] },
    ],
  };
  const [booking] = await createBookingsFromShopifyOrder(repo, order);
  assert.equal(booking.source, 'shopify');
  assert.equal(booking.amount, 2351);
  assert.equal(booking.addOns[0].name, 'Diya & Chunari offering');
  assert.equal(booking.shopifyOrderId, '5550001');
  assert.equal((await listBookings(repo, {})).length, 1, 'add-on line is not a separate booking');
});
