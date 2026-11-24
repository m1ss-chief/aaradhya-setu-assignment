// Usage: npm run create-admin -- <admin-id> <password> "<Full name>"
// Creates an admin login, or resets the password of an existing one.

import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import { mongoRepo } from '../lib/repo/mongo-repo.js';
import { saveAdmin } from '../lib/auth-service.js';

const [username, password, ...nameParts] = process.argv.slice(2);
if (!username || !password) {
  console.error('Usage: npm run create-admin -- <admin-id> <password> "<Full name>"');
  process.exit(1);
}

try {
  await connectDB();
  const admin = await saveAdmin(mongoRepo, { username, password, name: nameParts.join(' ') || username });
  console.log(`Admin saved: ${admin.username} (${admin.name})`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
