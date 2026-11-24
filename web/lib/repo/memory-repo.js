// In-memory implementation of the same data layer, used by the tests.
// It understands just the query shapes buildBookingQuery produces.

function matches(doc, query) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matches(doc, sub));
    const value = doc[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$regex' in cond) return new RegExp(cond.$regex, cond.$options || '').test(String(value ?? ''));
      if ('$gte' in cond && !(new Date(value) >= cond.$gte)) return false;
      if ('$lte' in cond && !(new Date(value) <= cond.$lte)) return false;
      return true;
    }
    return value === cond;
  });
}

function sorter(sort) {
  const [[field, dir]] = Object.entries(sort);
  return (a, b) => {
    const x = a[field] instanceof Date ? a[field].getTime() : a[field];
    const y = b[field] instanceof Date ? b[field].getTime() : b[field];
    if (x < y) return -1 * dir;
    if (x > y) return 1 * dir;
    return 0;
  };
}

const copy = (o) => structuredClone(o);

export function createMemoryRepo() {
  const bookings = [];
  const notifications = [];
  const admins = [];
  let seq = 0;

  return {
    bookings,
    notifications,
    admins,
    async findBookings(query, sort) {
      return bookings.filter((b) => matches(b, query)).sort(sorter(sort)).map(copy);
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
      Object.assign(b, changes);
      b.statusHistory = [...(b.statusHistory || []), historyEntry];
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
    async recordAdminLogin(username, at) {
      const a = admins.find((x) => x.username === username);
      if (a) a.lastLoginAt = at;
    },
    async createNotification(doc) {
      const stored = { id: String(notifications.length + 1), ...copy(doc) };
      notifications.push(stored);
      return copy(stored);
    },
    async findNotifications(query) {
      return notifications
        .filter((n) => matches(n, query))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(copy);
    },
  };
}
