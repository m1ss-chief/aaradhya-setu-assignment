import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { listNotifications } from '../../../lib/bookings-service.js';
import { requireAdmin } from '../../../lib/current-admin.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/notifications?bookingId=&status=&delivery=failed|sent
export const GET = handle(async (request) => {
  await requireAdmin();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return NextResponse.json({ notifications: await listNotifications(mongoRepo, params) });
});
