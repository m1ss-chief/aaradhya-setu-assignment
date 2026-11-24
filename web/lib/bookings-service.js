// Business logic for bookings and notifications.
//
// Every function takes a `repo` (the data layer) as its first argument. The app
// passes the MongoDB repo; the tests pass an in-memory one. That keeps the rules
// (search, filters, status changes, notifications) testable without a database.

import { STATUSES, canTransition, nextStatus, messageForStatus } from './workflow.js';
import { sendWhatsAppMock } from './notifier.js';

export class ServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const SORT_FIELDS = {
  date: 'pujaDate',
  amount: 'amount',
  devotee: 'devoteeName',
  created: 'createdAt',
  bookingId: 'bookingId',
};

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Turns the dashboard's search box and filters into a MongoDB query.
export function buildBookingQuery({ q, status, puja, from, to } = {}) {
  const query = {};
  if (q && q.trim()) {
    const pattern = { $regex: escapeRegex(q.trim()), $options: 'i' };
    query.$or = [
      { bookingId: pattern },
      { devoteeName: pattern },
      { pujaName: pattern },
      { templeName: pattern },
      { phone: pattern },
    ];
  }
  if (status && status !== 'all') {
    if (!STATUSES.includes(status)) throw new ServiceError(`Unknown status "${status}"`);
    query.status = status;
  }
  if (puja && puja !== 'all') query.pujaName = puja;
  if (from || to) {
    query.pujaDate = {};
    if (from) query.pujaDate.$gte = new Date(from);
    if (to) query.pujaDate.$lte = new Date(to);
  }
  return query;
}

export function buildSort({ sort = 'date', order = 'desc' } = {}) {
  const field = SORT_FIELDS[sort] || SORT_FIELDS.date;
  return { [field]: order === 'asc' ? 1 : -1 };
}

export async function listBookings(repo, params = {}) {
  return repo.findBookings(buildBookingQuery(params), buildSort(params));
}

export async function getBooking(repo, bookingId) {
  const booking = await repo.findBookingById(bookingId);
  if (!booking) throw new ServiceError(`Booking ${bookingId} not found`, 404);
  return booking;
}

const REQUIRED_FIELDS = ['devoteeName', 'phone', 'pujaName', 'templeName', 'pujaDate', 'amount'];
const OPTIONAL_FIELDS = ['email', 'gotra'];
// Fields an admin may edit after creation. Status is NOT here: it only changes
// through the workflow, so every step still sends its devotee notification.
export const EDITABLE_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

// Validates and normalises booking fields. With `partial`, only the fields
// present in `input` are checked and returned (used for edits).
function cleanBookingFields(input, { partial = false } = {}) {
  const out = {};
  for (const field of REQUIRED_FIELDS) {
    if (partial && !(field in input)) continue;
    if (isBlank(input[field])) throw new ServiceError(`${field} is required`);
  }
  for (const field of ['devoteeName', 'phone', 'pujaName', 'templeName']) {
    if (field in input) out[field] = String(input[field]).trim();
  }
  if ('amount' in input) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ServiceError('amount must be a positive number');
    out.amount = amount;
  }
  if ('pujaDate' in input) {
    const pujaDate = new Date(input.pujaDate);
    if (Number.isNaN(pujaDate.getTime())) throw new ServiceError('pujaDate is not a valid date');
    out.pujaDate = pujaDate;
  }
  if ('phone' in out && !/^\+?[\d\s()-]{7,20}$/.test(out.phone)) {
    throw new ServiceError('phone must be a valid phone number');
  }
  for (const field of OPTIONAL_FIELDS) {
    if (field in input) out[field] = isBlank(input[field]) ? (partial ? '' : undefined) : String(input[field]).trim();
  }
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) throw new ServiceError('email is not valid');
  return out;
}

export async function createBooking(repo, input, { source = 'admin', at, by } = {}) {
  const fields = cleanBookingFields(input);
  const now = at ? new Date(at) : new Date();
  const note = { shopify: 'Created from Shopify order', seed: 'Demo data' }[source] || `Created by ${by || 'admin'}`;
  return repo.createBooking({
    bookingId: await repo.nextBookingId(),
    ...fields,
    addOns: Array.isArray(input.addOns) ? input.addOns : [],
    status: 'Pending',
    statusHistory: [{ status: 'Pending', at: now, note, ...(by ? { by } : {}) }],
    source,
    shopifyOrderId: input.shopifyOrderId,
    ...(by ? { createdBy: by } : {}),
    createdAt: now,
  });
}

// Edits a booking's details (not its status).
export async function updateBooking(repo, bookingId, input = {}, { by } = {}) {
  await getBooking(repo, bookingId);
  if ('status' in input) {
    throw new ServiceError('Status cannot be edited directly. Use the workflow so the devotee is notified.');
  }
  const editable = Object.fromEntries(Object.entries(input).filter(([k]) => EDITABLE_FIELDS.includes(k)));
  if (Object.keys(editable).length === 0) throw new ServiceError('Nothing to update');
  const changes = cleanBookingFields(editable, { partial: true });
  const updated = await repo.updateBooking(bookingId, {
    ...changes,
    updatedAt: new Date(),
    ...(by ? { updatedBy: by } : {}),
  });
  if (!updated) throw new ServiceError(`Booking ${bookingId} not found`, 404);
  return updated;
}

// Permanently removes a booking and its notification history.
export async function deleteBooking(repo, bookingId) {
  await getBooking(repo, bookingId);
  const notificationsDeleted = await repo.deleteBooking(bookingId);
  return { bookingId, notificationsDeleted };
}

// Moves a booking one step forward and, for every step that has a template,
// generates and "sends" the devotee notification and saves it.
// `at` is only used by the seed script to backdate demo history; the API never passes it.
export async function changeStatus(repo, bookingId, to, { videoUrl, note, by, at: atOverride } = {}) {
  const booking = await getBooking(repo, bookingId);
  const from = booking.status;

  if (!STATUSES.includes(to)) throw new ServiceError(`Unknown status "${to}"`);
  if (!canTransition(from, to)) {
    const allowed = nextStatus(from);
    throw new ServiceError(
      allowed ? `A booking that is "${from}" can only move to "${allowed}"` : `"${from}" is the final status`,
      409,
    );
  }
  if (to === 'Video Available') {
    if (!videoUrl || !/^https?:\/\//i.test(videoUrl)) {
      throw new ServiceError('A valid video link (http/https) is required to mark the video as available');
    }
  }

  const at = atOverride ? new Date(atOverride) : new Date();
  const changes = { status: to, ...(to === 'Video Available' ? { videoUrl } : {}) };
  const historyEntry = { status: to, at, ...(note ? { note } : {}), ...(by ? { by } : {}) };

  // The repo only applies the update if the booking is still in `from`.
  // If two admins click at the same time, the second one gets a conflict
  // instead of skipping a step or sending a duplicate message.
  const updated = await repo.updateBookingStatus(bookingId, from, changes, historyEntry);
  if (!updated) throw new ServiceError('This booking was just updated by someone else. Refresh and try again.', 409);

  let notification = null;
  const message = messageForStatus(to, updated);
  if (message) {
    const delivery = await sendWhatsAppMock({ to: updated.phone, message });
    notification = await repo.createNotification({
      bookingId: updated.bookingId,
      status: to,
      channel: 'whatsapp',
      to: updated.phone,
      devoteeName: updated.devoteeName,
      message,
      delivery,
      createdAt: at,
    });
  }
  return { booking: updated, notification };
}

export async function listNotifications(repo, { bookingId, status } = {}) {
  const query = {};
  if (bookingId) query.bookingId = bookingId;
  if (status && status !== 'all') query.status = status;
  return repo.findNotifications(query);
}

export async function getStats(repo, now = new Date()) {
  const bookings = await repo.findBookings({}, { pujaDate: 1 });
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const byPuja = new Map();
  let revenue = 0;
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcoming = [];
  for (const b of bookings) {
    byStatus[b.status] = (byStatus[b.status] || 0) + 1;
    const amount = Number(b.amount) || 0;
    revenue += amount;
    const p = byPuja.get(b.pujaName) || { puja: b.pujaName, revenue: 0, count: 0 };
    p.revenue += amount;
    p.count += 1;
    byPuja.set(b.pujaName, p);
    const date = new Date(b.pujaDate);
    if (date >= now && date <= weekAhead && ['Pending', 'Confirmed'].includes(b.status)) upcoming.push(b);
  }
  const revenueByPuja = [...byPuja.values()].sort((a, b) => b.revenue - a.revenue);
  return {
    total: bookings.length,
    byStatus,
    revenue,
    averageAmount: bookings.length ? Math.round(revenue / bookings.length) : 0,
    pujas: revenueByPuja.map((p) => p.puja).sort(),
    revenueByPuja,
    upcomingCount: upcoming.length,
    upcoming: upcoming.slice(0, 6).map(({ bookingId, devoteeName, pujaName, templeName, pujaDate, status }) => ({
      bookingId,
      devoteeName,
      pujaName,
      templeName,
      pujaDate,
      status,
    })),
  };
}

// Shopify "orders/create" webhook -> one booking per puja line item.
// Devotee details come from the line item properties the product page collects.
export async function createBookingsFromShopifyOrder(repo, order) {
  const created = [];
  const lineItems = Array.isArray(order?.line_items) ? order.line_items : [];
  for (const item of lineItems) {
    const props = Object.fromEntries((item.properties || []).map((p) => [p.name, p.value]));
    if (!props['Puja date']) continue; // add-on items (diya, chunari...) are not bookings on their own
    const addOns = lineItems
      .filter((other) => other !== item && !(other.properties || []).some((p) => p.name === 'Puja date'))
      .map((other) => ({ name: other.title, price: Number(other.price) || 0, quantity: other.quantity || 1 }));
    const booking = await createBooking(
      repo,
      {
        devoteeName: props['Devotee name'] || order?.customer?.first_name || 'Devotee',
        phone: props['WhatsApp number'] || order?.phone || order?.customer?.phone || '',
        email: order?.email,
        gotra: props['Gotra'],
        pujaName: item.title,
        templeName: props['Temple'] || item.vendor || 'Aaradhya Setu',
        pujaDate: props['Puja date'],
        amount: (Number(item.price) || 0) * (item.quantity || 1) + addOns.reduce((sum, a) => sum + a.price * a.quantity, 0),
        addOns,
        shopifyOrderId: String(order?.id ?? ''),
      },
      { source: 'shopify' },
    );
    created.push(booking);
  }
  return created;
}
