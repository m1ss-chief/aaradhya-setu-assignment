// MongoDB implementation of the data layer used by the services.

import mongoose from 'mongoose';
import { connectDB } from '../db.js';
import { Booking, Notification, Counter, Admin, Template, Slot } from '../models/index.js';

function clean(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

export const mongoRepo = {
  // ── Bookings ──
  async findBookings(query, sort, { skip = 0, limit = 0 } = {}) {
    await connectDB();
    let cursor = Booking.find(query).sort(sort).skip(skip);
    if (limit) cursor = cursor.limit(limit);
    return (await cursor.lean()).map(clean);
  },

  async countBookings(query) {
    await connectDB();
    return Booking.countDocuments(query);
  },

  // [{ puja, revenue, count }] computed in the database.
  async sumByPuja(query) {
    await connectDB();
    const rows = await Booking.aggregate([
      { $match: query },
      { $group: { _id: '$pujaName', revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    return rows.map((r) => ({ puja: r._id, revenue: r.revenue, count: r.count }));
  },

  async distinctPujas() {
    await connectDB();
    return Booking.distinct('pujaName');
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

  // ── Notifications ──
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

  async countNotifications(query) {
    await connectDB();
    return Notification.countDocuments(query);
  },

  async findNotificationById(id) {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    return clean(await Notification.findById(id).lean());
  },

  // Conditional: only updates if the delivery status is still `expectedStatus`
  // (two admins pressing Resend at once send the message only once).
  async updateNotification(id, expectedStatus, changes) {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    const updated = await Notification.findOneAndUpdate(
      { _id: id, 'delivery.status': expectedStatus },
      { $set: changes },
      { new: true },
    ).lean();
    return clean(updated);
  },

  // ── Slots ──
  async createSlots(docs) {
    await connectDB();
    if (!docs.length) return [];
    return (await Slot.insertMany(docs)).map((d) => clean(d.toObject()));
  },

  async findSlots(query, sort = { startsAt: 1 }) {
    await connectDB();
    return (await Slot.find(query).sort(sort).lean()).map(clean);
  },

  async findSlotById(id) {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    return clean(await Slot.findById(id).lean());
  },

  // Takes one seat, in a single atomic update: only if the slot is open, has not
  // started, and booked < capacity. Two devotees can never get the last seat.
  async reserveSeat(id, notBefore) {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    const slot = await Slot.findOneAndUpdate(
      { _id: id, status: 'open', startsAt: { $gt: notBefore }, $expr: { $lt: ['$booked', '$capacity'] } },
      { $inc: { booked: 1 } },
      { new: true },
    ).lean();
    return clean(slot);
  },

  async releaseSeat(id) {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    return clean(await Slot.findOneAndUpdate({ _id: id, booked: { $gt: 0 } }, { $inc: { booked: -1 } }, { new: true }).lean());
  },

  // Changes capacity/status/note. A new capacity only applies if it is still >= booked.
  async updateSlot(id, changes) {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return null;
    const guard = 'capacity' in changes ? { booked: { $lte: changes.capacity } } : {};
    return clean(await Slot.findOneAndUpdate({ _id: id, ...guard }, { $set: changes }, { new: true }).lean());
  },

  // Only deletes an empty slot.
  async deleteSlot(id) {
    await connectDB();
    if (!mongoose.isValidObjectId(id)) return false;
    const { deletedCount } = await Slot.deleteOne({ _id: id, booked: 0 });
    return deletedCount === 1;
  },

  // ── Message templates ──
  async findTemplates() {
    await connectDB();
    return (await Template.find({}).lean()).map(clean);
  },

  async upsertTemplate(doc) {
    await connectDB();
    await Template.findOneAndUpdate({ status: doc.status }, { $set: doc }, { upsert: true });
  },

  async deleteTemplate(status) {
    await connectDB();
    await Template.deleteOne({ status });
  },

  // ── Admins ──

  async findAdminByUsername(username) {
    await connectDB();
    return clean(await Admin.findOne({ username }).lean());
  },

  async upsertAdmin(doc) {
    await connectDB();
    const admin = await Admin.findOneAndUpdate({ username: doc.username }, { $set: doc }, { upsert: true, new: true }).lean();
    return clean(admin);
  },

  async updateAdmin(username, changes) {
    await connectDB();
    return clean(await Admin.findOneAndUpdate({ username }, { $set: changes }, { new: true }).lean());
  },


  async recordAdminLogin(username, at) {
    await connectDB();
    await Admin.updateOne({ username }, { $set: { lastLoginAt: at } });
  },
};
