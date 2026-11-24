// Usage: npm run seed   (reads MONGODB_URI from .env.local)
// Clears the demo data (slots, bookings, notifications, message templates), inserts
// slots for every temple, 21 bookings at different stages and creates (or resets) the admin login
// ADMIN_USERNAME / ADMIN_PASSWORD (default admin / Setu@2026).

import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import { Booking, Notification, Counter, Template, Slot } from '../lib/models/index.js';
import { mongoRepo } from '../lib/repo/mongo-repo.js';
import { seed } from '../lib/seed.js';
import { saveAdmin } from '../lib/auth-service.js';

await connectDB();
await Promise.all([Booking.deleteMany({}), Notification.deleteMany({}), Counter.deleteMany({}), Template.deleteMany({}), Slot.deleteMany({})]);
const bookings = await seed(mongoRepo);
const notifications = await Notification.countDocuments();
const failed = await Notification.countDocuments({ 'delivery.status': 'failed' });
console.log(`Seeded ${bookings.length} bookings and ${notifications} notifications (${failed} failed, to demo Resend).`);

const admin = await saveAdmin(mongoRepo, {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Setu@2026',
  name: process.env.ADMIN_NAME || 'Setu Admin',
});
console.log(`Login ready: ${admin.username}`);
await mongoose.disconnect();
