import mongoose from 'mongoose';
import { ALL_STATUSES } from '../workflow.js';

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
    status: { type: String, enum: ALL_STATUSES, required: true },
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

// Atomic counter so booking IDs are sequential (AS-2026-0001, ...) even when
// two bookings are created at the same moment.
const CounterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } }, { versionKey: false });

// Admin users of the dashboard. Passwords are stored only as scrypt hashes.
const AdminSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    // "admin" is the pre-roles value; it is treated as "owner".
    role: { type: String, enum: ['owner', 'staff', 'admin'], default: 'staff' },
    passwordHash: { type: String, required: true },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    createdBy: String,
  },
  { timestamps: true },
);

// Owner-edited WhatsApp message wording (one document per status). Missing = default text.
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
export const Template = mongoose.models.Template || mongoose.model('Template', TemplateSchema);
