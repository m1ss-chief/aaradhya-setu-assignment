// The booking lifecycle, shared by the API, the dashboard and the tests.
//
// Option 2 asks for Pending / Confirmed / In Progress / Completed.
// Option 3 asks for Booking Confirmed -> Puja Started -> Puja Completed -> Video Available.
// They describe the same journey, so we use ONE ordered list of statuses and give
// each one a devotee-facing "stage" name for the workflow view.

export const STATUSES = ['Pending', 'Confirmed', 'In Progress', 'Completed', 'Video Available'];

export const STATUS_META = {
  Pending: { stage: 'Booking Received', tone: 'neutral' },
  Confirmed: { stage: 'Booking Confirmed', tone: 'info' },
  'In Progress': { stage: 'Puja Started', tone: 'warn' },
  Completed: { stage: 'Puja Completed', tone: 'success' },
  'Video Available': { stage: 'Video Available', tone: 'done' },
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

// WhatsApp-style message templates. {{placeholders}} are filled from the booking.
// Pending has no template: the devotee hears from us once the booking is confirmed.
export const TEMPLATES = {
  Confirmed:
    '🙏 Namaste {{devoteeName}}, your {{pujaName}} at {{templeName}} is confirmed for {{pujaDate}}. Booking ID: {{bookingId}}. We will message you when the puja begins.',
  'In Progress':
    '🪔 {{devoteeName}}, your {{pujaName}} has started at {{templeName}}. Pandit ji is performing the rituals in your name. Booking ID: {{bookingId}}.',
  Completed:
    '✅ {{devoteeName}}, your {{pujaName}} (Booking ID: {{bookingId}}) has been completed. Your prasad will be dispatched soon and the puja video will follow.',
  'Video Available':
    '📹 {{devoteeName}}, the video of your {{pujaName}} is ready. Watch it here: {{videoUrl}} (Booking ID: {{bookingId}}). Thank you for choosing Aaradhya Setu 🙏',
};

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

export function messageForStatus(status, booking) {
  const template = TEMPLATES[status];
  if (!template) return null;
  return renderTemplate(template, {
    devoteeName: booking.devoteeName,
    pujaName: booking.pujaName,
    templeName: booking.templeName,
    bookingId: booking.bookingId,
    pujaDate: formatPujaDate(booking.pujaDate),
    videoUrl: booking.videoUrl,
  });
}
