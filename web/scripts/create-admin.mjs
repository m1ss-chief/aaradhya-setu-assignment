// Usage: npm run create-admin -- <admin-id> <password> "<Full name>" [--staff]
// Creates a login (owner by default, staff with --staff), or resets an existing one.
// Owners can also add people from the Team page in the dashboard.

import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import { mongoRepo } from '../lib/repo/mongo-repo.js';
import { saveAdmin } from '../lib/auth-service.js';

const args = process.argv.slice(2);
const role = args.includes('--staff') ? 'staff' : 'owner';
const [username, password, ...nameParts] = args.filter((a) => !a.startsWith('--'));
if (!username || !password) {
  console.error('Usage: npm run create-admin -- <admin-id> <password> "<Full name>" [--staff]');
  process.exit(1);
}

try {
  await connectDB();
  const admin = await saveAdmin(mongoRepo, { username, password, name: nameParts.join(' ') || username, role });
  console.log(`Saved: ${admin.username} (${admin.name}, ${admin.role})`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
