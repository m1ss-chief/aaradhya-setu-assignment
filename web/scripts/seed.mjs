// Usage: npm run seed   (reads MONGODB_URI from .env.local)
// Clears the demo collections, inserts 20 bookings at different stages and
// creates (or resets) the admin login from ADMIN_USERNAME / ADMIN_PASSWORD.

import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import { Booking, Notification, Counter } from '../lib/models/index.js';
import { mongoRepo } from '../lib/repo/mongo-repo.js';
import { seed } from '../lib/seed.js';
import { saveAdmin } from '../lib/auth-service.js';

await connectDB();
await Promise.all([Booking.deleteMany({}), Notification.deleteMany({}), Counter.deleteMany({})]);
const bookings = await seed(mongoRepo);
const notifications = await Notification.countDocuments();
console.log(`Seeded ${bookings.length} bookings and ${notifications} notifications.`);

const admin = await saveAdmin(mongoRepo, {
  username: process.env.ADMIN_USERNAME || 'admin',
  password: process.env.ADMIN_PASSWORD || 'Setu@2026',
  name: process.env.ADMIN_NAME || 'Setu Admin',
});
console.log(`Admin login ready: ${admin.username} (${admin.name})`);
await mongoose.disconnect();
