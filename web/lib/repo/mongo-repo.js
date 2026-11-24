// MongoDB implementation of the data layer used by bookings-service.js.

import { connectDB } from '../db.js';
import { Booking, Notification, Counter, Admin } from '../models/index.js';

function clean(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export const mongoRepo = {
  async findBookings(query, sort) {
    await connectDB();
    const docs = await Booking.find(query).sort(sort).lean();
    return docs.map(clean);
  },

  async findBookingById(bookingId) {
    await connectDB();
    return clean(await Booking.findOne({ bookingId }).lean());
  },

  async nextBookingId() {
    await connectDB();
    const year = new Date().getFullYear();
    const counter = await Counter.findOneAndUpdate(
      { _id: `booking-${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    ).lean();
    return `AS-${year}-${String(counter.seq).padStart(4, '0')}`;
  },

  async createBooking(doc) {
    await connectDB();
    const created = await Booking.create(doc);
    return clean(created.toObject());
  },

  // Conditional update: only succeeds if the booking is still in `fromStatus`.
  async updateBookingStatus(bookingId, fromStatus, changes, historyEntry) {
    await connectDB();
    const updated = await Booking.findOneAndUpdate(
      { bookingId, status: fromStatus },
      { $set: changes, $push: { statusHistory: historyEntry } },
      { new: true },
    ).lean();
    return clean(updated);
  },

  async updateBooking(bookingId, changes) {
    await connectDB();
    const updated = await Booking.findOneAndUpdate({ bookingId }, { $set: changes }, { new: true }).lean();
    return clean(updated);
  },

  // Deletes the booking and its notification history; returns how many messages were removed.
  async deleteBooking(bookingId) {
    await connectDB();
    await Booking.deleteOne({ bookingId });
    const { deletedCount } = await Notification.deleteMany({ bookingId });
    return deletedCount;
  },

  async findAdminByUsername(username) {
    await connectDB();
    return clean(await Admin.findOne({ username }).lean());
  },

  async upsertAdmin(doc) {
    await connectDB();
    const admin = await Admin.findOneAndUpdate({ username: doc.username }, { $set: doc }, { upsert: true, new: true }).lean();
    return clean(admin);
  },

  async recordAdminLogin(username, at) {
    await connectDB();
    await Admin.updateOne({ username }, { $set: { lastLoginAt: at } });
  },

  async createNotification(doc) {
    await connectDB();
    const created = await Notification.create(doc);
    return clean(created.toObject());
  },

  async findNotifications(query) {
    await connectDB();
    const docs = await Notification.find(query).sort({ createdAt: -1, _id: -1 }).lean();
    return docs.map(clean);
  },
};
