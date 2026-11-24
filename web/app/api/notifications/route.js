import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { listNotifications } from '../../../lib/bookings-service.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/notifications?bookingId=&status=
export const GET = handle(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const notifications = await listNotifications(mongoRepo, params);
  return NextResponse.json({ notifications });
});
