import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../../lib/repo/mongo-repo.js';
import { cancelBooking } from '../../../../../lib/bookings-service.js';
import { requireAdmin } from '../../../../../lib/current-admin.js';
import { handle } from '../../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// POST /api/bookings/AS-2026-0001/cancel  { reason: "...", notifyDevotee: true }
export const POST = handle(async (request, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const { reason, notifyDevotee } = await request.json();
  const result = await cancelBooking(mongoRepo, id, { reason, notifyDevotee: notifyDevotee === true, by: admin.name });
  return NextResponse.json(result);
});
