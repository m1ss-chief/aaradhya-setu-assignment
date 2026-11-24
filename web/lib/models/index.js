import mongoose from 'mongoose';
import { STATUSES } from '../workflow.js';

const { Schema } = mongoose;

const StatusEventSchema = new Schema(
  {
    status: { type: String, enum: STATUSES, required: true },
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
    amount: { type: Number, required: true, min: 0 },
    addOns: [AddOnSchema],
    status: { type: String, enum: STATUSES, default: 'Pending', index: true },
    videoUrl: String,
    statusHistory: [StatusEventSchema],
    source: { type: String, enum: ['admin', 'shopify', 'seed'], default: 'admin' },
    shopifyOrderId: String,
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true },
);

const NotificationSchema = new Schema(
  {
    bookingId: { type: String, required: true, index: true },
    status: { type: String, enum: STATUSES, required: true },
    channel: { type: String, default: 'whatsapp' },
    to: String,
    devoteeName: String,
    message: { type: String, required: true },
    delivery: {
      provider: String,
      messageId: String,
      status: String,
      sentAt: String,
    },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false },
);

// Atomic counter so booking IDs are sequential (AS-2026-0001, ...) even when
// two bookings are created at the same moment.
const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });

// Admin users of the dashboard. Passwords are stored only as scrypt hashes.
const AdminSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['admin'], default: 'admin' },
    passwordHash: { type: String, required: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

export const Booking = mongoose.models.Booking || mongoose.model('Booking', BookingSchema);
export const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export const Counter = mongoose.models.Counter || mongoose.model('Counter', CounterSchema);
export const Admin = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
