// The booking lifecycle, shared by the API, the dashboard and the tests.
//
// Option 2 asks for Pending / Confirmed / In Progress / Completed.
// Option 3 asks for Booking Confirmed -> Puja Started -> Puja Completed -> Video Available.
// They describe the same journey, so we use ONE ordered list of statuses and give
// each one a devotee-facing "stage" name for the workflow view.
//
// "Cancelled" is not part of that forward journey: it is a final side-exit that a
// booking can take before the puja is completed.

export const STATUSES = ['Pending', 'Confirmed', 'In Progress', 'Completed', 'Video Available'];
export const CANCELLED = 'Cancelled';
export const ALL_STATUSES = [...STATUSES, CANCELLED];
export const CANCELLABLE_STATUSES = ['Pending', 'Confirmed', 'In Progress'];

export const STATUS_META = {
  Pending: { stage: 'Booking Received', tone: 'neutral' },
  Confirmed: { stage: 'Booking Confirmed', tone: 'info' },
  'In Progress': { stage: 'Puja Started', tone: 'warn' },
  Completed: { stage: 'Puja Completed', tone: 'success' },
  'Video Available': { stage: 'Video Available', tone: 'done' },
  Cancelled: { stage: 'Cancelled', tone: 'cancel' },
};

// A booking may only move one step forward. Skipping a step would skip the
// devotee notification for that step, and moving backwards would send
// confusing messages, so neither is allowed.
export function nextStatus(current) {
  const i = STATUSES.indexOf(current);
  if (i === -1 || i === STATUSES.length - 1) return null;
  return STATUSES[i + 1];
}

export function canTransition(from, to) {
  return nextStatus(from) === to;
}

export function canCancel(status) {
  return CANCELLABLE_STATUSES.includes(status);
}

// Default WhatsApp-style message templates. {{placeholders}} are filled from the booking.
// Pending has no template: the devotee hears from us once the booking is confirmed.
// Owners can override these from Settings; overrides are stored in the database.
export const TEMPLATES = {
  Confirmed:
    '🙏 Namaste {{devoteeName}}, your {{pujaName}} at {{templeName}} is confirmed for {{pujaDate}}. Booking ID: {{bookingId}}. We will message you when the puja begins.',
  'In Progress':
    '🪔 {{devoteeName}}, your {{pujaName}} has started at {{templeName}}. Pandit ji is performing the rituals in your name. Booking ID: {{bookingId}}.',
  Completed:
    '✅ {{devoteeName}}, your {{pujaName}} (Booking ID: {{bookingId}}) has been completed. Your prasad will be dispatched soon and the puja video will follow.',
  'Video Available':
    '📹 {{devoteeName}}, the video of your {{pujaName}} is ready. Watch it here: {{videoUrl}} (Booking ID: {{bookingId}}). Thank you for choosing Aaradhya Setu 🙏',
  Cancelled:
    '🙏 {{devoteeName}}, your {{pujaName}} at {{templeName}} (Booking ID: {{bookingId}}) has been cancelled. Reason: {{reason}}. Our team will contact you about your refund.',
};

export const TEMPLATE_STATUSES = Object.keys(TEMPLATES);

// Which placeholders each template may use, and which it must use.
const COMMON = ['devoteeName', 'pujaName', 'templeName', 'bookingId', 'pujaDate'];
export const TEMPLATE_RULES = Object.fromEntries(
  TEMPLATE_STATUSES.map((s) => {
    const allowed = [...COMMON, ...(s === 'Video Available' ? ['videoUrl'] : []), ...(s === CANCELLED ? ['reason'] : [])];
    const required = ['devoteeName', 'pujaName', 'bookingId', ...(s === 'Video Available' ? ['videoUrl'] : [])];
    return [s, { allowed, required }];
  }),
);

export function placeholdersIn(template) {
  return [...String(template).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
}

export function formatPujaDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return String(date ?? '');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

// Fills a template. Throws if a placeholder has no value, so we never send a
// message with "{{videoUrl}}" left in it.
export function renderTemplate(template, vars) {
  const missing = [];
  const text = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    if (value === undefined || value === null || value === '') {
      missing.push(key);
      return '';
    }
    return String(value);
  });
  if (missing.length) {
    throw new Error(`Template is missing values for: ${missing.join(', ')}`);
  }
  return text;
}

// `templates` lets callers pass the owner-edited versions; defaults otherwise.
export function messageForStatus(status, booking, templates = TEMPLATES, extra = {}) {
  const template = templates[status] ?? TEMPLATES[status];
  if (!template) return null;
  return renderTemplate(template, {
    devoteeName: booking.devoteeName,
    pujaName: booking.pujaName,
    templeName: booking.templeName,
    bookingId: booking.bookingId,
    pujaDate: formatPujaDate(booking.pujaDate),
    videoUrl: booking.videoUrl,
    reason: booking.cancelReason,
    ...extra,
  });
}
