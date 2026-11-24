import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { getStats } from '../../../lib/bookings-service.js';
import { slotStats } from '../../../lib/slots-service.js';
import { requireAdmin } from '../../../lib/current-admin.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/stats -> { total, byStatus, revenue, revenueByPuja, upcoming, failedMessages, needsSlot, slots, ... }
// `slots` covers the next 7 days: open slots, seats, seats booked, full and closed slots.
export const GET = handle(async () => {
  await requireAdmin();
  const [stats, slots] = await Promise.all([getStats(mongoRepo), slotStats(mongoRepo)]);
  return NextResponse.json({ ...stats, slots });
});
