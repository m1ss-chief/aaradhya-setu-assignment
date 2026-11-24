import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../lib/repo/mongo-repo.js';
import { getBooking, listNotifications, updateBooking, deleteBooking } from '../../../../lib/bookings-service.js';
import { requireAdmin } from '../../../../lib/current-admin.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/bookings/AS-2026-0001  -> the booking plus its notification history
export const GET = handle(async (_request, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const [booking, notifications] = await Promise.all([
    getBooking(mongoRepo, id),
    listNotifications(mongoRepo, { bookingId: id }),
  ]);
  return NextResponse.json({ booking, notifications });
});

// PUT /api/bookings/AS-2026-0001  { devoteeName?, phone?, ... }   (owner)
// Edits booking details. Status changes go through /status or /cancel so the devotee is notified.
export const PUT = handle(async (request, { params }) => {
  const admin = await requireAdmin('bookings:edit');
  const { id } = await params;
  const booking = await updateBooking(mongoRepo, id, await request.json(), { by: admin.name });
  return NextResponse.json({ booking });
});

// DELETE /api/bookings/AS-2026-0001  -> removes the booking and its notification history   (owner)
export const DELETE = handle(async (_request, { params }) => {
  await requireAdmin('bookings:delete');
  const { id } = await params;
  return NextResponse.json(await deleteBooking(mongoRepo, id));
});
