// Business logic for bookings, notifications and message templates.
//
// Every function takes a `repo` (the data layer) as its first argument. The app
// passes the MongoDB repo; the tests pass an in-memory one. That keeps the rules
// (search, filters, status changes, notifications) testable without a database.

import {
  STATUSES,
  ALL_STATUSES,
  CANCELLED,
  CANCELLABLE_STATUSES,
  TEMPLATES,
  TEMPLATE_STATUSES,
  TEMPLATE_RULES,
  placeholdersIn,
  canTransition,
  nextStatus,
  messageForStatus,
} from './workflow.js';
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

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

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
    if (!ALL_STATUSES.includes(status)) throw new ServiceError(`Unknown status "${status}"`);
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

// The booking ID is a tie-breaker so paging is stable when many rows share a date or amount.
export function buildSort({ sort = 'date', order = 'desc' } = {}) {
  const field = SORT_FIELDS[sort] || SORT_FIELDS.date;
  const dir = order === 'asc' ? 1 : -1;
  return field === 'bookingId' ? { bookingId: dir } : { [field]: dir, bookingId: dir };
}

export function parsePaging({ page, pageSize } = {}) {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(pageSize, 10) || DEFAULT_PAGE_SIZE));
  const p = Math.max(1, Number.parseInt(page, 10) || 1);
  return { page: p, pageSize: size };
}

// Server-side pagination: the database returns one page plus the total count,
// so the dashboard stays fast however many bookings there are.
export async function listBookings(repo, params = {}) {
  const query = buildBookingQuery(params);
  const { page, pageSize } = parsePaging(params);
  const total = await repo.countBookings(query);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  const bookings = await repo.findBookings(query, buildSort(params), { skip: (current - 1) * pageSize, limit: pageSize });
  return { bookings, total, page: current, pageSize, pages };
}

// Every matching booking (no paging), for CSV export.
export async function exportBookings(repo, params = {}) {
  return repo.findBookings(buildBookingQuery(params), buildSort(params));
}

const CSV_COLUMNS = ['bookingId', 'devoteeName', 'phone', 'email', 'gotra', 'pujaName', 'templeName', 'pujaDate', 'amount', 'status', 'cancelReason', 'source', 'createdAt'];

export function bookingsToCsv(bookings) {
  const cell = (v) => {
    const text = v instanceof Date ? v.toISOString() : String(v ?? '');
    // Prefix formula-like values so spreadsheets don't execute them.
    const safe = /^[=+\-@]/.test(text) && !/^\+?\d[\d\s]*$/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [CSV_COLUMNS.join(','), ...bookings.map((b) => CSV_COLUMNS.map((c) => cell(b[c])).join(','))].join('\n');
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

// Permanently removes a booking and its notification history (owner only).
// Day-to-day, bookings should be cancelled instead, which keeps the record.
export async function deleteBooking(repo, bookingId) {
  await getBooking(repo, bookingId);
  const notificationsDeleted = await repo.deleteBooking(bookingId);
  return { bookingId, notificationsDeleted };
}

// ───────────────────────── Message templates ─────────────────────────

// Defaults from workflow.js, overridden by whatever owners saved in Settings.
export async function getTemplates(repo) {
  const saved = await repo.findTemplates();
  const merged = { ...TEMPLATES };
  const meta = {};
  for (const t of saved) {
    if (TEMPLATE_STATUSES.includes(t.status)) {
      merged[t.status] = t.body;
      meta[t.status] = { updatedBy: t.updatedBy, updatedAt: t.updatedAt };
    }
  }
  return { templates: merged, meta };
}

export function validateTemplate(status, body) {
  if (!TEMPLATE_STATUSES.includes(status)) throw new ServiceError(`There is no message template for "${status}"`, 404);
  const text = String(body ?? '').trim();
  if (!text) throw new ServiceError('The message cannot be empty');
  if (text.length > 1000) throw new ServiceError('Keep the message under 1000 characters');
  const used = placeholdersIn(text);
  const { allowed, required } = TEMPLATE_RULES[status];
  const unknown = [...new Set(used.filter((p) => !allowed.includes(p)))];
  if (unknown.length) {
    throw new ServiceError(`Unknown placeholder(s): ${unknown.map((p) => `{{${p}}}`).join(', ')}. You can use: ${allowed.map((p) => `{{${p}}}`).join(', ')}`);
  }
  const missing = required.filter((p) => !used.includes(p));
  if (missing.length) throw new ServiceError(`The message must include ${missing.map((p) => `{{${p}}}`).join(', ')}`);
  if (/\{\{|\}\}/.test(text.replace(/\{\{\s*\w+\s*\}\}/g, ''))) throw new ServiceError('A placeholder is not closed properly, e.g. {{devoteeName}}');
  return text;
}

export async function saveTemplate(repo, status, body, { by } = {}) {
  const text = validateTemplate(status, body);
  await repo.upsertTemplate({ status, body: text, updatedBy: by, updatedAt: new Date() });
  return getTemplates(repo);
}

export async function resetTemplate(repo, status) {
  validateTemplate(status, TEMPLATES[status]);
  await repo.deleteTemplate(status);
  return getTemplates(repo);
}

// ───────────────────────── Workflow & notifications ─────────────────────────

async function notify(repo, booking, status, at, templates) {
  const message = messageForStatus(status, booking, templates);
  if (!message) return null;
  const delivery = await sendWhatsAppMock({ to: booking.phone, message });
  return repo.createNotification({
    bookingId: booking.bookingId,
    status,
    channel: 'whatsapp',
    to: booking.phone,
    devoteeName: booking.devoteeName,
    message,
    delivery,
    attempts: 1,
    createdAt: at,
  });
}

// Moves a booking one step forward and, for every step that has a template,
// generates and "sends" the devotee notification and saves it.
// `at` is only used by the seed script to backdate demo history; the API never passes it.
export async function changeStatus(repo, bookingId, to, { videoUrl, note, by, at: atOverride } = {}) {
  const booking = await getBooking(repo, bookingId);
  const from = booking.status;

  if (to === CANCELLED) throw new ServiceError('Use "Cancel booking" to cancel, so a reason is recorded');
  if (!STATUSES.includes(to)) throw new ServiceError(`Unknown status "${to}"`);
  if (from === CANCELLED) throw new ServiceError('This booking was cancelled and cannot move forward', 409);
  if (!canTransition(from, to)) {
    const allowed = nextStatus(from);
    throw new ServiceError(
      allowed ? `A booking that is "${from}" can only move to "${allowed}"` : `"${from}" is the final status`,
      409,
    );
  }
  if (to === 'Video Available') {
    if (!videoUrl || !/^https?:\/\/\S+$/i.test(videoUrl)) {
      throw new ServiceError('A valid video link (http/https) is required to mark the video as available');
    }
  }

  const { templates } = await getTemplates(repo);
  const at = atOverride ? new Date(atOverride) : new Date();
  const changes = { status: to, ...(to === 'Video Available' ? { videoUrl } : {}) };
  const historyEntry = { status: to, at, ...(note ? { note } : {}), ...(by ? { by } : {}) };

  // The repo only applies the update if the booking is still in `from`.
  // If two admins click at the same time, the second one gets a conflict
  // instead of skipping a step or sending a duplicate message.
  const updated = await repo.updateBookingStatus(bookingId, from, changes, historyEntry);
  if (!updated) throw new ServiceError('This booking was just updated by someone else. Refresh and try again.', 409);

  const notification = await notify(repo, updated, to, at, templates);
  return { booking: updated, notification };
}

// Cancels a booking that has not been completed yet. The booking and its history
// are kept (unlike delete); the devotee is messaged only if `notifyDevotee` is set.
export async function cancelBooking(repo, bookingId, { reason, notifyDevotee = false, by, at: atOverride } = {}) {
  const booking = await getBooking(repo, bookingId);
  const from = booking.status;
  if (!CANCELLABLE_STATUSES.includes(from)) {
    throw new ServiceError(
      from === CANCELLED ? 'This booking is already cancelled' : `A booking that is "${from}" can no longer be cancelled`,
      409,
    );
  }
  const why = String(reason ?? '').trim();
  if (!why) throw new ServiceError('Please give a reason for the cancellation');
  if (why.length > 300) throw new ServiceError('Keep the reason under 300 characters');

  const at = atOverride ? new Date(atOverride) : new Date();
  const changes = { status: CANCELLED, cancelReason: why, cancelledAt: at, ...(by ? { cancelledBy: by } : {}) };
  const historyEntry = { status: CANCELLED, at, note: why, ...(by ? { by } : {}) };
  const updated = await repo.updateBookingStatus(bookingId, from, changes, historyEntry);
  if (!updated) throw new ServiceError('This booking was just updated by someone else. Refresh and try again.', 409);

  const { templates } = notifyDevotee ? await getTemplates(repo) : { templates: null };
  const notification = notifyDevotee ? await notify(repo, updated, CANCELLED, at, templates) : null;
  return { booking: updated, notification };
}

// Sends a failed WhatsApp message again, to the booking's CURRENT number
// (so fixing a mistyped number and pressing Resend works).
export async function resendNotification(repo, notificationId, { by } = {}) {
  const notification = await repo.findNotificationById(notificationId);
  if (!notification) throw new ServiceError('Message not found', 404);
  if (notification.delivery?.status !== 'failed') throw new ServiceError('Only failed messages can be resent', 409);
  const booking = await repo.findBookingById(notification.bookingId);
  const to = booking?.phone || notification.to;

  const delivery = await sendWhatsAppMock({ to, message: notification.message });
  const updated = await repo.updateNotification(notificationId, notification.delivery.status, {
    to,
    delivery,
    attempts: (notification.attempts || 1) + 1,
    lastAttemptAt: new Date(),
    ...(by ? { lastAttemptBy: by } : {}),
  });
  if (!updated) throw new ServiceError('This message was just resent by someone else. Refresh to see it.', 409);
  return updated;
}

export async function listNotifications(repo, { bookingId, status, delivery } = {}) {
  const query = {};
  if (bookingId) query.bookingId = bookingId;
  if (status && status !== 'all') query.status = status;
  if (delivery === 'failed' || delivery === 'sent') query['delivery.status'] = delivery;
  return repo.findNotifications(query);
}

// ───────────────────────── Stats ─────────────────────────

// Uses count / sum queries rather than loading every booking.
// Cancelled bookings are counted, but not included in the booking value.
export async function getStats(repo, now = new Date()) {
  const counts = await Promise.all(ALL_STATUSES.map((s) => repo.countBookings({ status: s })));
  const byStatus = Object.fromEntries(ALL_STATUSES.map((s, i) => [s, counts[i]]));
  const total = counts.reduce((a, b) => a + b, 0);

  const active = { status: { $ne: CANCELLED } };
  const revenueByPuja = (await repo.sumByPuja(active)).sort((a, b) => b.revenue - a.revenue || a.puja.localeCompare(b.puja));
  const revenue = revenueByPuja.reduce((sum, p) => sum + p.revenue, 0);
  const activeCount = revenueByPuja.reduce((sum, p) => sum + p.count, 0);
  const pujas = (await repo.distinctPujas()).sort();

  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingQuery = { status: { $in: ['Pending', 'Confirmed'] }, pujaDate: { $gte: now, $lte: weekAhead } };
  const [upcomingCount, upcoming, failedMessages] = await Promise.all([
    repo.countBookings(upcomingQuery),
    repo.findBookings(upcomingQuery, { pujaDate: 1, bookingId: 1 }, { limit: 6 }),
    repo.countNotifications({ 'delivery.status': 'failed' }),
  ]);

  return {
    total,
    byStatus,
    revenue,
    averageAmount: activeCount ? Math.round(revenue / activeCount) : 0,
    pujas,
    revenueByPuja,
    upcomingCount,
    upcoming: upcoming.map(({ bookingId, devoteeName, pujaName, templeName, pujaDate, status }) => ({
      bookingId,
      devoteeName,
      pujaName,
      templeName,
      pujaDate,
      status,
    })),
    failedMessages,
  };
}

// ───────────────────────── Shopify ─────────────────────────

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
