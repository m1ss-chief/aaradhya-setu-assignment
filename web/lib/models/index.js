import mongoose from 'mongoose';
import { ALL_STATUSES, NOTIFICATION_TYPES } from '../workflow.js';

const { Schema } = mongoose;

const StatusEventSchema = new Schema(
  {
    status: { type: String, enum: ALL_STATUSES, required: true },
    at: { type: Date, required: true },
    note: String,
    by: String, // admin who made the change
  },
  { _id: false },
);

const AddOnSchema = new Schema(
  { name: String, price: Number, quantity: { type: Number, default: 1 } },
  { _id: false },
);

const BookingSchema = new Schema(
  {
    bookingId: { type: String, required: true, unique: true, index: true },
    devoteeName: { type: String, required: true, index: true },
    phone: { type: String, required: true },
    email: String,
    gotra: String,
    pujaName: { type: String, required: true, index: true },
    templeName: { type: String, required: true },
    pujaDate: { type: Date, required: true, index: true },
    // The slot this booking holds a seat in. Empty = "needs a slot" (e.g. a Shopify
    // order for a day with no free slot); slotNote says why.
    slotId: { type: String, default: null, index: true },
    slotNote: String,
    // Every move to another slot: when, from/to which time, by whom and why.
    scheduleHistory: [
      new Schema({ from: Date, to: Date, at: Date, reason: String, by: String }, { _id: false }),
    ],
    amount: { type: Number, required: true, min: 0 },
    addOns: [AddOnSchema],
    status: { type: String, enum: ALL_STATUSES, default: 'Pending', index: true },
    videoUrl: String,
    cancelReason: String,
    cancelledAt: Date,
    cancelledBy: String,
    statusHistory: [StatusEventSchema],
    source: { type: String, enum: ['admin', 'shopify', 'seed'], default: 'admin' },
    shopifyOrderId: String,
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true },
);
// Supports the default dashboard sort (status filter + puja date) when paging.
BookingSchema.index({ status: 1, pujaDate: -1 });

const NotificationSchema = new Schema(
  {
    bookingId: { type: String, required: true, index: true },
    status: { type: String, enum: NOTIFICATION_TYPES, required: true },
    channel: { type: String, default: 'whatsapp' },
    to: String,
    devoteeName: String,
    message: { type: String, required: true },
    delivery: {
      provider: String,
      messageId: String,
      status: { type: String, enum: ['sent', 'failed'], index: true },
      error: String,
      sentAt: String,
    },
    attempts: { type: Number, default: 1 },
    lastAttemptAt: Date,
    lastAttemptBy: String,
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

// A bookable time at a temple. `capacity` is how many pujas can run at once
// (the pandits available); `booked` is only changed atomically by reserve/release.
const SlotSchema = new Schema(
  {
    templeName: { type: String, required: true },
    startsAt: { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 15 },
    capacity: { type: Number, required: true, min: 1 },
    booked: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    note: String,
    createdBy: String,
  },
  { timestamps: true },
);
SlotSchema.index({ templeName: 1, startsAt: 1 });

// Atomic counter so booking IDs are sequential (AS-2026-0001, ...) even when
// two bookings are created at the same moment.
const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });

// Admin users of the dashboard. Passwords are stored only as scrypt hashes.
const AdminSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    lastLoginAt: Date,
    passwordChangedAt: Date,
  },
  { timestamps: true },
);

// Admin-edited WhatsApp message wording (one document per status). Missing = default text.
const TemplateSchema = new Schema(
  {
    status: { type: String, required: true, unique: true },
    body: { type: String, required: true },
    updatedBy: String,
    updatedAt: Date,
  },
  { versionKey: false },
);

export const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);
export const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);
export const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
export const Slot = mongoose.models.Slot || mongoose.model('Slot', SlotSchema);
export const Template = mongoose.models.Template || mongoose.model('Template', TemplateSchema);
