import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../../lib/repo/mongo-repo.js';
import { rescheduleBooking } from '../../../../../lib/bookings-service.js';
import { requireAdmin } from '../../../../../lib/current-admin.js';
import { handle } from '../../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// POST /api/bookings/AS-2026-0001/reschedule  { slotId, reason?, notifyDevotee? }
// Moves the booking to another slot (new seat first, then the old one is freed),
// records the move, and messages a confirmed devotee. -> { booking, notification }
export const POST = handle(async (request, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const { slotId, reason, notifyDevotee } = await request.json();
  return NextResponse.json(await rescheduleBooking(mongoRepo, id, { slotId, reason, notifyDevotee: notifyDevotee !== false, by: admin.name }));
});
