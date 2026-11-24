// Usage: npm run seed   (reads MONGODB_URI from .env.local)
// Clears the demo data (bookings, notifications, message templates), inserts 20
// bookings at different stages and creates (or resets) two logins:
//   owner: ADMIN_USERNAME / ADMIN_PASSWORD   (default admin / Setu@2026)
//   staff: STAFF_USERNAME / STAFF_PASSWORD   (default staff / Staff@2026)

import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import { Booking, Notification, Counter, Template } from '../lib/models/index.js';
import { mongoRepo } from '../lib/repo/mongo-repo.js';
import { seed } from '../lib/seed.js';
import { saveAdmin } from '../lib/auth-service.js';

await connectDB();
await Promise.all([Booking.deleteMany({}), Notification.deleteMany({}), Counter.deleteMany({}), Template.deleteMany({})]);
const bookings = await seed(mongoRepo);
const notifications = await Notification.countDocuments();
const failed = await Notification.countDocuments({ 'delivery.status': 'failed' });
console.log(`Seeded ${bookings.length} bookings and ${notifications} notifications (${failed} failed, to demo Resend).`);

const owner = await saveAdmin(mongoRepo, {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Setu@2026',
  name: process.env.ADMIN_NAME || 'Setu Admin',
  role: 'owner',
});
const staff = await saveAdmin(mongoRepo, {
  username: process.env.STAFF_USERNAME || 'staff',
  password: process.env.STAFF_PASSWORD || 'Staff@2026',
  name: process.env.STAFF_NAME || 'Temple Staff',
  role: 'staff',
});
console.log(`Logins ready: ${owner.username} (owner), ${staff.username} (staff)`);
await mongoose.disconnect();
