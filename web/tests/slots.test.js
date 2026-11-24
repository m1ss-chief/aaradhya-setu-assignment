import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBooking, changeStatus, cancelBooking, updateBooking, rescheduleBooking, deleteBooking, listBookings, listNotifications, createBookingsFromShopifyOrder, getBooking } from '../lib/bookings-service.js';
import { createSlots, planSlots, listSlots, updateSlot, deleteSlot, getSlot, istDateTime } from '../lib/slots-service.js';
import { createMemoryRepo } from '../lib/repo/memory-repo.js';

const NOW = new Date('2026-11-24T06:00:00.000Z'); // 11:30 IST
const TEMPLE = 'Kashi Vishwanath, Varanasi';
const devotee = (name, extra = {}) => ({
  devoteeName: name,
  phone: '+91 98765 43210',
  pujaName: 'Rudrabhishek',
  templeName: TEMPLE,
  amount: 2100,
  ...extra,
});

async function oneSlot(repo, { date = '2026-12-05', time = '10:00', capacity = 2, templeName = TEMPLE } = {}) {
  const { created } = await createSlots(repo, { templeName, from: date, to: date, times: [time], durationMinutes: 120, capacity }, { now: NOW });
  return created[0];
}

test('slots are planned in Indian time for the chosen weekdays and times', () => {
  // 1–7 Dec 2026, Mondays and Fridays (1 Dec is a Tuesday), at 07:00 and 10:00
  const planned = planSlots({ templeName: TEMPLE, from: '2026-12-01', to: '2026-12-07', weekdays: [1, 5], times: ['10:00', '07:00'], durationMinutes: 90, capacity: 3 });
  assert.deepEqual(
    planned.map((s) => s.startsAt.toISOString()),
    ['2026-12-04T01:30:00.000Z', '2026-12-04T04:30:00.000Z', '2026-12-07T01:30:00.000Z', '2026-12-07T04:30:00.000Z'],
  );
  assert.ok(planned.every((s) => s.capacity === 3 && s.durationMinutes === 90));
  assert.throws(() => planSlots({ templeName: TEMPLE, from: '2026-12-07', to: '2026-12-01', times: ['10:00'], durationMinutes: 60, capacity: 1 }), /before the start/);
  assert.throws(() => planSlots({ templeName: TEMPLE, from: '2026-12-01', times: ['25:00'], durationMinutes: 60, capacity: 1 }), /not a time/);
  assert.throws(() => planSlots({ templeName: TEMPLE, from: '2026-12-01', times: ['10:00'], durationMinutes: 60, capacity: 0 }), /Pandits available/);
});

test('overlapping slots at the same temple are skipped and reported; other temples are independent', async () => {
  const repo = createMemoryRepo();
  await oneSlot(repo, { time: '10:00' }); // 10:00–12:00
  const { created, skipped } = await createSlots(
    repo,
    { templeName: TEMPLE, from: '2026-12-05', times: ['07:00', '11:00', '12:00'], durationMinutes: 120, capacity: 2 },
    { now: NOW },
  );
  // 07:00–09:00 fits, 11:00 overlaps 10:00–12:00, 12:00–14:00 starts as 10:00 ends: fits
  assert.equal(created.length, 2);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /overlaps the 10:00 am–12:00 pm slot/);
  // Times in one request can't overlap each other either
  const { skipped: inner } = await createSlots(repo, { templeName: TEMPLE, from: '2026-12-06', times: ['06:00', '07:00'], durationMinutes: 120, capacity: 2 }, { now: NOW });
  assert.equal(inner.length, 1);
  // Past slots are skipped
  const { created: none, skipped: past } = await createSlots(repo, { templeName: TEMPLE, from: '2026-11-20', times: ['10:00'], durationMinutes: 60, capacity: 2 }, { now: NOW });
  assert.equal(none.length, 0);
  assert.match(past[0].reason, /past/);
  // Another temple at the same time is fine
  assert.ok(await oneSlot(repo, { templeName: 'Mahakaleshwar, Ujjain' }));
});

test('a slot can never be overbooked, even when bookings arrive at the same moment', async () => {
  const repo = createMemoryRepo();
  const slot = await oneSlot(repo, { capacity: 2 });
  const results = await Promise.allSettled(
    ['A', 'B', 'C', 'D'].map((n) => createBooking(repo, devotee(`Devotee ${n}`, { slotId: slot.id }), { at: NOW, requireSlot: true })),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => /full|filled up/.test(r.reason.message)));
  assert.equal((await getSlot(repo, slot.id, NOW)).state, 'full');
  assert.equal(repo.bookings.length, 2, 'no booking is saved without a seat');

  const booked = repo.bookings[0];
  assert.equal(new Date(booked.pujaDate).toISOString(), new Date(slot.startsAt).toISOString(), 'the puja date is the slot time');
});

test('bookings need an open, future slot at the same temple', async () => {
  const repo = createMemoryRepo();
  const slot = await oneSlot(repo);
  await assert.rejects(createBooking(repo, devotee('X'), { requireSlot: true }), /Pick a slot/);
  await assert.rejects(createBooking(repo, devotee('X', { templeName: 'Mahakaleshwar, Ujjain', slotId: slot.id }), { at: NOW }), /is at Kashi/);
  await assert.rejects(createBooking(repo, devotee('X', { slotId: slot.id }), { at: new Date('2026-12-05T05:00:00Z') }), /already started/);
  await updateSlot(repo, slot.id, { status: 'closed' }, NOW);
  await assert.rejects(createBooking(repo, devotee('X', { slotId: slot.id }), { at: NOW }), /closed/);
  assert.equal((await getSlot(repo, slot.id, NOW)).booked, 0);
});

test('a booking without a slot cannot be confirmed; a puja cannot start before its day', async () => {
  const repo = createMemoryRepo();
  const loose = await createBooking(repo, devotee('Loose', { pujaDate: '2026-12-05' }), { at: NOW });
  assert.equal(loose.slotId, null);
  await assert.rejects(changeStatus(repo, loose.bookingId, 'Confirmed'), /Assign a slot/);

  const slot = await oneSlot(repo);
  const b = await createBooking(repo, devotee('Placed', { slotId: slot.id }), { at: NOW });
  await changeStatus(repo, b.bookingId, 'Confirmed', { at: NOW });
  await assert.rejects(changeStatus(repo, b.bookingId, 'In Progress', { at: new Date('2026-12-04T17:00:00Z') }), /scheduled for 5 Dec 2026/);
  // 4 Dec 18:30 UTC is already 5 Dec in India
  await changeStatus(repo, b.bookingId, 'In Progress', { at: new Date('2026-12-04T18:31:00Z') });
});

test('cancelling or deleting a booking frees its seat', async () => {
  const repo = createMemoryRepo();
  const slot = await oneSlot(repo, { capacity: 1 });
  const a = await createBooking(repo, devotee('A', { slotId: slot.id }), { at: NOW });
  await assert.rejects(createBooking(repo, devotee('B', { slotId: slot.id }), { at: NOW }), /full/);
  await cancelBooking(repo, a.bookingId, { reason: 'Devotee unwell' });
  assert.equal((await getSlot(repo, slot.id, NOW)).booked, 0);

  const b = await createBooking(repo, devotee('B', { slotId: slot.id }), { at: NOW });
  await deleteBooking(repo, a.bookingId); // already cancelled: must not free B's seat
  assert.equal((await getSlot(repo, slot.id, NOW)).booked, 1);
  await deleteBooking(repo, b.bookingId);
  assert.equal((await getSlot(repo, slot.id, NOW)).booked, 0);
});

test('rescheduling takes the new seat first, is recorded, and tells a confirmed devotee', async () => {
  const repo = createMemoryRepo();
  const first = await oneSlot(repo, { date: '2026-12-05' });
  const second = await oneSlot(repo, { date: '2026-12-06', capacity: 1 });
  const b = await createBooking(repo, devotee('Mover', { slotId: first.id }), { at: NOW });
  const blocker = await createBooking(repo, devotee('Blocker', { slotId: second.id }), { at: NOW });

  // The new slot is full: nothing changes
  await assert.rejects(rescheduleBooking(repo, b.bookingId, { slotId: second.id, now: NOW }), /full/);
  assert.equal((await getBooking(repo, b.bookingId)).slotId, first.id);
  assert.equal((await getSlot(repo, first.id, NOW)).booked, 1);
  await assert.rejects(rescheduleBooking(repo, b.bookingId, { slotId: first.id, now: NOW }), /already in this slot/);
  await assert.rejects(rescheduleBooking(repo, b.bookingId, { now: NOW }), /Pick the new slot/);
  // Slot changes don't sneak in through a normal edit
  await assert.rejects(updateBooking(repo, b.bookingId, { slotId: second.id }), /Reschedule/);

  // A pending booking moves quietly (the devotee hasn't been told a time yet)
  await cancelBooking(repo, blocker.bookingId, { reason: 'Changed plans' });
  const quiet = await rescheduleBooking(repo, b.bookingId, { slotId: second.id, now: NOW });
  assert.equal(quiet.notification, null);
  const back = await rescheduleBooking(repo, b.bookingId, { slotId: first.id, now: NOW });
  assert.equal((await getSlot(repo, second.id, NOW)).booked, 0, 'the seat it left is free again');

  // A confirmed booking: the devotee is told, and the move is recorded with its reason
  await changeStatus(repo, back.booking.bookingId, 'Confirmed', { at: NOW });
  const { booking: moved, notification } = await rescheduleBooking(repo, b.bookingId, {
    slotId: second.id,
    reason: 'Pandit ji unwell on the 5th',
    by: 'Setu Admin',
    now: NOW,
  });
  assert.equal(moved.slotId, second.id);
  assert.equal(new Date(moved.pujaDate).toISOString(), '2026-12-06T04:30:00.000Z');
  assert.equal((await getSlot(repo, first.id, NOW)).booked, 0);
  assert.equal((await getSlot(repo, second.id, NOW)).booked, 1);
  assert.equal(notification.status, 'Rescheduled');
  assert.match(notification.message, /moved to 6 Dec 2026, 10:00 am/);
  assert.equal(moved.scheduleHistory.length, 3);
  assert.deepEqual(
    { ...moved.scheduleHistory[2], at: undefined },
    { from: new Date('2026-12-05T04:30:00.000Z'), to: new Date('2026-12-06T04:30:00.000Z'), at: undefined, reason: 'Pandit ji unwell on the 5th', by: 'Setu Admin' },
  );

  // ...unless the admin chooses not to message them
  const silent = await rescheduleBooking(repo, b.bookingId, { slotId: first.id, notifyDevotee: false, now: NOW });
  assert.equal(silent.notification, null);

  // The temple can't change under a slot; a started puja can't move
  await assert.rejects(updateBooking(repo, b.bookingId, { templeName: 'Mahakaleshwar, Ujjain' }), /Cancel it and book/);
  await changeStatus(repo, b.bookingId, 'In Progress', { at: new Date('2026-12-05T04:00:00Z') });
  await assert.rejects(rescheduleBooking(repo, b.bookingId, { slotId: second.id, now: NOW }), /already started/);
});

test('a booking that needs a slot gets its first one through Reschedule', async () => {
  const repo = createMemoryRepo();
  const slot = await oneSlot(repo);
  const loose = await createBooking(repo, devotee('Loose', { pujaDate: '2026-12-05', slotNote: 'No free slot' }), { at: NOW });
  const { booking } = await rescheduleBooking(repo, loose.bookingId, { slotId: slot.id, now: NOW });
  assert.equal(booking.slotId, slot.id);
  assert.equal(booking.slotNote, '');
  assert.equal(booking.scheduleHistory[0].from, null);
  await changeStatus(repo, booking.bookingId, 'Confirmed', { at: NOW });
});

test('capacity cannot drop below bookings; only empty slots can be deleted', async () => {
  const repo = createMemoryRepo();
  const slot = await oneSlot(repo, { capacity: 3 });
  await createBooking(repo, devotee('A', { slotId: slot.id }), { at: NOW });
  await createBooking(repo, devotee('B', { slotId: slot.id }), { at: NOW });
  await assert.rejects(updateSlot(repo, slot.id, { capacity: 1 }, NOW), /can't go below 2/);
  assert.equal((await updateSlot(repo, slot.id, { capacity: 2 }, NOW)).state, 'full');
  await assert.rejects(deleteSlot(repo, slot.id), /2 booking\(s\) hold seats/);
  const empty = await oneSlot(repo, { date: '2026-12-07' });
  await deleteSlot(repo, empty.id);
  await assert.rejects(getSlot(repo, empty.id), /not found/);
});

test('slots list shows live state; the bookings list filters by slot and "needs a slot"', async () => {
  const repo = createMemoryRepo();
  const slot = await oneSlot(repo, { capacity: 1 });
  await oneSlot(repo, { date: '2026-12-06' });
  const b = await createBooking(repo, devotee('A', { slotId: slot.id }), { at: NOW });
  await createBooking(repo, devotee('Waiting', { pujaDate: '2026-12-08' }), { at: NOW });
  const slots = await listSlots(repo, { from: '2026-12-01', to: '2026-12-10' }, NOW);
  assert.deepEqual(slots.map((s) => [s.state, s.remaining]), [['full', 0], ['open', 2]]);
  assert.equal((await listSlots(repo, { from: '2026-12-01', to: '2026-12-10', available: 1 }, NOW)).length, 1);
  assert.deepEqual((await listBookings(repo, { slot: slot.id })).bookings.map((x) => x.bookingId), [b.bookingId]);
  assert.deepEqual((await listBookings(repo, { slot: 'none' })).bookings.map((x) => x.devoteeName), ['Waiting']);
});

test('Shopify orders get the first free slot that day, or wait for one (never rejected)', async () => {
  const repo = createMemoryRepo();
  const early = await oneSlot(repo, { time: '07:00', capacity: 1 });
  const late = await oneSlot(repo, { time: '10:00', capacity: 1 });
  const order = (name, date) => ({
    id: 1,
    line_items: [
      {
        title: 'Rudrabhishek',
        vendor: TEMPLE,
        price: '2100',
        quantity: 1,
        properties: [
          { name: 'Devotee name', value: name },
          { name: 'WhatsApp number', value: '+91 98765 43210' },
          { name: 'Puja date', value: date },
        ],
      },
    ],
  });
  const [a] = await createBookingsFromShopifyOrder(repo, order('A', '2026-12-05'), { now: NOW });
  const [b] = await createBookingsFromShopifyOrder(repo, order('B', '2026-12-05'), { now: NOW });
  const [c] = await createBookingsFromShopifyOrder(repo, order('C', '2026-12-05'), { now: NOW });
  assert.equal(a.slotId, early.id);
  assert.equal(b.slotId, late.id);
  assert.equal(c.slotId, null);
  assert.match(c.slotNote, /no free slot at Kashi Vishwanath, Varanasi/);
  assert.equal(new Date(c.pujaDate).toISOString(), istDateTime('2026-12-05').toISOString(), 'keeps the requested day');
});
