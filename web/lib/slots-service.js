// Puja slots: when a temple can perform pujas, and how many at once.
//
// A slot is a time window at a temple. Its capacity is the number of pujas that
// can run in parallel (the pandits available). Every booking holds one seat in a
// slot, so the temple is never promised more pujas than it has pandits for.
//
// Clash rules enforced here:
//   - a slot can't be overbooked, even when two bookings arrive at the same moment
//     (the seat is taken by one conditional database update, see repo.reserveSeat);
//   - slots at the same temple can't overlap (the same pandits would be counted twice);
//   - capacity can't drop below the bookings already made;
//   - only empty slots can be deleted (otherwise close them, so no new bookings come in);
//   - closed, full or already-started slots can't be booked.
// All times are Indian Standard Time.

import { ServiceError } from './errors.js';
import { istDay } from './workflow.js';

export const MAX_CAPACITY = 50;
export const MAX_SLOTS_PER_REQUEST = 300;
export const MAX_RANGE_DAYS = 92;
const DAY = 24 * 60 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// "2026-12-05" + "10:00" (in India) -> Date
export function istDateTime(date, time = '00:00') {
  if (!DATE_RE.test(String(date))) throw new ServiceError(`"${date}" is not a date (YYYY-MM-DD)`);
  if (!TIME_RE.test(String(time))) throw new ServiceError(`"${time}" is not a time (HH:MM)`);
  const d = new Date(`${date}T${time}:00+05:30`);
  if (Number.isNaN(d.getTime())) throw new ServiceError(`"${date}" is not a valid date`);
  return d;
}

export function slotEnd(slot) {
  return new Date(new Date(slot.startsAt).getTime() + slot.durationMinutes * 60 * 1000);
}

export function overlaps(a, b) {
  return new Date(a.startsAt) < slotEnd(b) && new Date(b.startsAt) < slotEnd(a);
}

function istTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}

function istDayLabel(date) {
  return new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

function wholeNumber(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new ServiceError(`${name} must be a whole number from ${min} to ${max}`);
  return n;
}

// Adds a slot's live state for the dashboard.
export function slotView(slot, now = new Date()) {
  const remaining = Math.max(0, slot.capacity - slot.booked);
  const started = new Date(slot.startsAt) <= now;
  const state = started ? 'past' : slot.status === 'closed' ? 'closed' : remaining === 0 ? 'full' : 'open';
  return { ...slot, endsAt: slotEnd(slot), remaining, state, bookable: state === 'open' };
}

// Turns "every Mon/Wed/Fri at 07:00 and 10:00 from 1 to 31 Dec" into slot documents.
export function planSlots({ templeName, from, to, weekdays, times, durationMinutes, capacity, note } = {}) {
  const temple = String(templeName || '').trim();
  if (!temple) throw new ServiceError('Choose a temple');
  const start = istDateTime(from);
  const end = istDateTime(to || from);
  if (end < start) throw new ServiceError('The end date is before the start date');
  const days = Math.round((end - start) / DAY) + 1;
  if (days > MAX_RANGE_DAYS) throw new ServiceError(`Create at most ${MAX_RANGE_DAYS} days of slots at a time`);

  const dayList = (Array.isArray(weekdays) && weekdays.length ? weekdays : [0, 1, 2, 3, 4, 5, 6]).map(Number);
  if (dayList.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ServiceError('Weekdays must be 0 (Sunday) to 6 (Saturday)');
  const timeList = [...new Set((Array.isArray(times) ? times : [times]).filter(Boolean).map(String))].sort();
  if (!timeList.length) throw new ServiceError('Add at least one start time');
  for (const t of timeList) istDateTime(from, t); // validates the format
  const duration = wholeNumber(durationMinutes, 'Duration (minutes)', 15, 720);
  const seats = wholeNumber(capacity, 'Pandits available', 1, MAX_CAPACITY);
  const cleanNote = String(note || '').trim().slice(0, 200);

  const planned = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(start.getTime() + i * DAY + 330 * 60 * 1000).toISOString().slice(0, 10);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (!dayList.includes(weekday)) continue;
    for (const t of timeList) {
      planned.push({
        templeName: temple,
        startsAt: istDateTime(day, t),
        durationMinutes: duration,
        capacity: seats,
        ...(cleanNote ? { note: cleanNote } : {}),
      });
    }
  }
  if (planned.length > MAX_SLOTS_PER_REQUEST) {
    throw new ServiceError(`That would create ${planned.length} slots. Create at most ${MAX_SLOTS_PER_REQUEST} at a time.`);
  }
  return planned;
}

// Creates the planned slots, skipping (and reporting) any in the past or clashing
// with an existing slot at the same temple, or with each other.
export async function createSlots(repo, input, { by, now = new Date() } = {}) {
  const planned = planSlots(input);
  if (!planned.length) throw new ServiceError('No days in that range match the chosen weekdays');
  const first = planned[0].startsAt;
  const lastEnd = slotEnd(planned[planned.length - 1]);
  const existing = await repo.findSlots({
    templeName: planned[0].templeName,
    startsAt: { $gt: new Date(first.getTime() - DAY), $lt: lastEnd },
  });

  const toCreate = [];
  const skipped = [];
  for (const slot of planned) {
    const label = `${istDayLabel(slot.startsAt)}, ${istTime(slot.startsAt)}`;
    if (slot.startsAt <= now) {
      skipped.push({ startsAt: slot.startsAt, reason: `${label}: already in the past` });
      continue;
    }
    const clash = existing.find((o) => overlaps(o, slot)) || toCreate.find((o) => overlaps(o, slot));
    if (clash) {
      skipped.push({
        startsAt: slot.startsAt,
        reason: `${label}: overlaps the ${istTime(clash.startsAt)}–${istTime(slotEnd(clash))} slot`,
      });
      continue;
    }
    toCreate.push({ ...slot, booked: 0, status: 'open', ...(by ? { createdBy: by } : {}) });
  }
  const created = await repo.createSlots(toCreate);
  return { created: created.map((s) => slotView(s, now)), skipped };
}

// Slots between two Indian dates (inclusive). Defaults to today + 13 days.
export async function listSlots(repo, { temple, from, to, available } = {}, now = new Date()) {
  const start = from ? istDateTime(from) : istDateTime(istDay(now));
  const end = to ? new Date(istDateTime(to).getTime() + DAY) : new Date(start.getTime() + 14 * DAY);
  if (end - start > (MAX_RANGE_DAYS + 1) * DAY) throw new ServiceError(`Show at most ${MAX_RANGE_DAYS} days at a time`);
  const query = { startsAt: { $gte: start, $lt: end } };
  if (temple && temple !== 'all') query.templeName = temple;
  const slots = (await repo.findSlots(query, { startsAt: 1, templeName: 1 })).map((s) => slotView(s, now));
  return available ? slots.filter((s) => s.bookable) : slots;
}

export async function getSlot(repo, id, now = new Date()) {
  const slot = await repo.findSlotById(id);
  if (!slot) throw new ServiceError('Slot not found', 404);
  return slotView(slot, now);
}

// Change how many pandits are available, open/close the slot, or edit its note.
// The time can't change: devotees were told it. Move bookings, then delete the slot instead.
export async function updateSlot(repo, id, input = {}, now = new Date()) {
  const slot = await getSlot(repo, id, now);
  const changes = {};
  if (input.capacity !== undefined) {
    const capacity = wholeNumber(input.capacity, 'Pandits available', 1, MAX_CAPACITY);
    if (capacity < slot.booked) {
      throw new ServiceError(
        `${slot.booked} booking(s) already hold seats in this slot, so capacity can't go below ${slot.booked}. Move or cancel bookings first.`,
        409,
      );
    }
    changes.capacity = capacity;
  }
  if (input.status !== undefined) {
    if (!['open', 'closed'].includes(input.status)) throw new ServiceError('Status must be "open" or "closed"');
    changes.status = input.status;
  }
  if (input.note !== undefined) changes.note = String(input.note).trim().slice(0, 200);
  if (!Object.keys(changes).length) throw new ServiceError('Nothing to update');
  const updated = await repo.updateSlot(id, changes);
  if (!updated) throw new ServiceError('A booking just came in for this slot. Refresh and try again.', 409);
  return slotView(updated, now);
}

export async function deleteSlot(repo, id) {
  const slot = await getSlot(repo, id);
  if (slot.booked > 0) {
    throw new ServiceError(
      `${slot.booked} booking(s) hold seats in this slot. Move or cancel them first, or close the slot to stop new bookings.`,
      409,
    );
  }
  if (!(await repo.deleteSlot(id))) throw new ServiceError('A booking just came in for this slot, so it was not deleted.', 409);
  return { id };
}

// ───────────────────────── Seats (used by the booking service) ─────────────────────────

// Takes a seat in a slot for a booking at `templeName`, or explains why it can't.
export async function takeSeat(repo, slotId, { templeName, now = new Date() } = {}) {
  const slot = await repo.findSlotById(String(slotId));
  if (!slot) throw new ServiceError('That slot no longer exists. Pick another time.', 404);
  if (templeName && slot.templeName !== templeName) {
    throw new ServiceError(`That slot is at ${slot.templeName}, not ${templeName}. Pick a slot at the booking's temple.`);
  }
  if (new Date(slot.startsAt) <= now) throw new ServiceError('That slot has already started. Pick a later time.', 409);
  if (slot.status === 'closed') throw new ServiceError('That slot is closed for bookings. Pick another time.', 409);
  if (slot.booked >= slot.capacity) throw new ServiceError('That slot is full. Pick another time.', 409);
  const reserved = await repo.reserveSeat(slot.id, now);
  if (!reserved) throw new ServiceError('That slot just filled up. Pick another time.', 409);
  return reserved;
}

export async function freeSeat(repo, slotId) {
  if (slotId) await repo.releaseSeat(String(slotId));
}

// For Shopify orders: takes the earliest free seat at the temple on an Indian date.
// Returns the slot, or null if that day has no free slot.
export async function takeFirstFreeSeat(repo, templeName, day, now = new Date()) {
  const start = istDateTime(day);
  const candidates = await repo.findSlots(
    { templeName, status: 'open', startsAt: { $gte: start, $lt: new Date(start.getTime() + DAY) } },
    { startsAt: 1 },
  );
  for (const slot of candidates) {
    if (new Date(slot.startsAt) <= now || slot.booked >= slot.capacity) continue;
    const reserved = await repo.reserveSeat(slot.id, now);
    if (reserved) return reserved;
  }
  return null;
}

// Seats in the next 7 days, for the overview.
export async function slotStats(repo, now = new Date()) {
  const slots = await repo.findSlots({ startsAt: { $gte: now, $lt: new Date(now.getTime() + 7 * DAY) } });
  const open = slots.filter((s) => s.status === 'open');
  return {
    slots: open.length,
    seats: open.reduce((sum, s) => sum + s.capacity, 0),
    booked: slots.reduce((sum, s) => sum + s.booked, 0),
    full: open.filter((s) => s.booked >= s.capacity).length,
    closed: slots.length - open.length,
  };
}
