// In-memory implementation of the same data layer, used by the tests.
// It understands the query shapes the services produce:
// equality, $or, $regex, $gt/$gte/$lt/$lte, $ne, $in and dotted paths ("delivery.status").

function get(doc, path) {
  return path.split('.').reduce((v, key) => (v == null ? undefined : v[key]), doc);
}

function matches(doc, query) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matches(doc, sub));
    const value = get(doc, key);
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$regex' in cond) return new RegExp(cond.$regex, cond.$options || '').test(String(value ?? ''));
      if ('$ne' in cond && value === cond.$ne) return false;
      if ('$in' in cond && !cond.$in.includes(value)) return false;
      if ('$gte' in cond && !(new Date(value) >= cond.$gte)) return false;
      if ('$lte' in cond && !(new Date(value) <= cond.$lte)) return false;
      if ('$gt' in cond && !(new Date(value) > cond.$gt)) return false;
      if ('$lt' in cond && !(new Date(value) < cond.$lt)) return false;
      return true;
    }
    return value === cond;
  });
}

function sorter(sort) {
  const keys = Object.entries(sort);
  return (a, b) => {
    for (const [field, dir] of keys) {
      const x = a[field] instanceof Date ? a[field].getTime() : a[field];
      const y = b[field] instanceof Date ? b[field].getTime() : b[field];
      if (x < y) return -1 * dir;
      if (x > y) return 1 * dir;
    }
    return 0;
  };
}

const copy = (o) => structuredClone(o);

export function createMemoryRepo() {
  const bookings = [];
  const notifications = [];
  const admins = [];
  const templates = [];
  const slots = [];
  let seq = 0;
  let slotSeq = 0;
  let notificationSeq = 0;

  return {
    bookings,
    notifications,
    admins,
    templates,
    slots,

    // ── Bookings ──
    async findBookings(query, sort, { skip = 0, limit = 0 } = {}) {
      const all = bookings.filter((b) => matches(b, query)).sort(sorter(sort));
      return all.slice(skip, limit ? skip + limit : undefined).map(copy);
    },
    async countBookings(query) {
      return bookings.filter((b) => matches(b, query)).length;
    },
    async sumByPuja(query) {
      const byPuja = new Map();
      for (const b of bookings.filter((x) => matches(x, query))) {
        const row = byPuja.get(b.pujaName) || { puja: b.pujaName, revenue: 0, count: 0 };
        row.revenue += Number(b.amount) || 0;
        row.count += 1;
        byPuja.set(b.pujaName, row);
      }
      return [...byPuja.values()];
    },
    async distinctPujas() {
      return [...new Set(bookings.map((b) => b.pujaName))];
    },
    async findBookingById(bookingId) {
      const b = bookings.find((x) => x.bookingId === bookingId);
      return b ? copy(b) : null;
    },
    async nextBookingId() {
      seq += 1;
      return `AS-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;
    },
    async createBooking(doc) {
      const stored = { id: String(bookings.length + 1), createdAt: new Date(), ...copy(doc) };
      bookings.push(stored);
      return copy(stored);
    },
    async updateBookingStatus(bookingId, fromStatus, changes, historyEntry) {
      const b = bookings.find((x) => x.bookingId === bookingId && x.status === fromStatus);
      if (!b) return null;
      Object.assign(b, copy(changes));
      b.statusHistory = [...(b.statusHistory || []), copy(historyEntry)];
      return copy(b);
    },
    async updateBooking(bookingId, changes) {
      const b = bookings.find((x) => x.bookingId === bookingId);
      if (!b) return null;
      Object.assign(b, copy(changes));
      return copy(b);
    },
    async deleteBooking(bookingId) {
      const i = bookings.findIndex((x) => x.bookingId === bookingId);
      if (i !== -1) bookings.splice(i, 1);
      let removed = 0;
      for (let j = notifications.length - 1; j >= 0; j--) {
        if (notifications[j].bookingId === bookingId) {
          notifications.splice(j, 1);
          removed += 1;
        }
      }
      return removed;
    },

    // ── Notifications ──
    async createNotification(doc) {
      notificationSeq += 1;
      const stored = { id: `n${notificationSeq}`, ...copy(doc) };
      notifications.push(stored);
      return copy(stored);
    },
    async findNotifications(query) {
      return notifications
        .filter((n) => matches(n, query))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(copy);
    },
    async countNotifications(query) {
      return notifications.filter((n) => matches(n, query)).length;
    },
    async findNotificationById(id) {
      const n = notifications.find((x) => x.id === id);
      return n ? copy(n) : null;
    },
    async updateNotification(id, expectedStatus, changes) {
      const n = notifications.find((x) => x.id === id && x.delivery?.status === expectedStatus);
      if (!n) return null;
      Object.assign(n, copy(changes));
      return copy(n);
    },

    // ── Slots ── (JavaScript is single-threaded, so each method below is atomic)
    async createSlots(docs) {
      return docs.map((doc) => {
        slotSeq += 1;
        const stored = { id: `s${slotSeq}`, booked: 0, status: 'open', ...copy(doc) };
        slots.push(stored);
        return copy(stored);
      });
    },
    async findSlots(query, sort = { startsAt: 1 }) {
      return slots.filter((s) => matches(s, query)).sort(sorter(sort)).map(copy);
    },
    async findSlotById(id) {
      const s = slots.find((x) => x.id === id);
      return s ? copy(s) : null;
    },
    async reserveSeat(id, notBefore) {
      const s = slots.find((x) => x.id === id);
      if (!s || s.status !== 'open' || !(new Date(s.startsAt) > notBefore) || s.booked >= s.capacity) return null;
      s.booked += 1;
      return copy(s);
    },
    async releaseSeat(id) {
      const s = slots.find((x) => x.id === id);
      if (!s || s.booked <= 0) return null;
      s.booked -= 1;
      return copy(s);
    },
    async updateSlot(id, changes) {
      const s = slots.find((x) => x.id === id);
      if (!s || ('capacity' in changes && s.booked > changes.capacity)) return null;
      Object.assign(s, copy(changes));
      return copy(s);
    },
    async deleteSlot(id) {
      const i = slots.findIndex((x) => x.id === id && x.booked === 0);
      if (i === -1) return false;
      slots.splice(i, 1);
      return true;
    },

    // ── Message templates ──
    async findTemplates() {
      return templates.map(copy);
    },
    async upsertTemplate(doc) {
      const i = templates.findIndex((t) => t.status === doc.status);
      if (i === -1) templates.push(copy(doc));
      else templates[i] = copy(doc);
    },
    async deleteTemplate(status) {
      const i = templates.findIndex((t) => t.status === status);
      if (i !== -1) templates.splice(i, 1);
    },

    // ── Admins ──
    async findAdminByUsername(username) {
      const a = admins.find((x) => x.username === username);
      return a ? copy(a) : null;
    },
    async upsertAdmin(doc) {
      let a = admins.find((x) => x.username === doc.username);
      if (!a) {
        a = { id: String(admins.length + 1), createdAt: new Date() };
        admins.push(a);
      }
      Object.assign(a, copy(doc));
      return copy(a);
    },
    async updateAdmin(username, changes) {
      const a = admins.find((x) => x.username === username);
      if (!a) return null;
      Object.assign(a, copy(changes));
      return copy(a);
    },
    async recordAdminLogin(username, at) {
      const a = admins.find((x) => x.username === username);
      if (a) a.lastLoginAt = at;
    },
  };
}
