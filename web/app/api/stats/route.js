import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { getStats } from '../../../lib/bookings-service.js';
import { requireAdmin } from '../../../lib/current-admin.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/stats -> { total, byStatus, revenue, revenueByPuja, upcoming, failedMessages, ... }
export const GET = handle(async () => {
  await requireAdmin();
  return NextResponse.json(await getStats(mongoRepo));
});
