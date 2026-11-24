import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../lib/repo/mongo-repo.js';
import { getSlot, updateSlot, deleteSlot } from '../../../../lib/slots-service.js';
import { listBookings } from '../../../../lib/bookings-service.js';
import { requireAdmin } from '../../../../lib/current-admin.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/slots/:id  -> the slot and the bookings in it
export const GET = handle(async (_request, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const slot = await getSlot(mongoRepo, id);
  const { bookings } = await listBookings(mongoRepo, { slot: id, sort: 'created', order: 'asc', pageSize: 100 });
  return NextResponse.json({ slot, bookings });
});

// PATCH /api/slots/:id  { capacity?, status?: "open" | "closed", note? }
export const PATCH = handle(async (request, { params }) => {
  await requireAdmin();
  const { id } = await params;
  return NextResponse.json({ slot: await updateSlot(mongoRepo, id, await request.json()) });
});

// DELETE /api/slots/:id  -> only if no booking holds a seat in it
export const DELETE = handle(async (_request, { params }) => {
  await requireAdmin();
  const { id } = await params;
  return NextResponse.json(await deleteSlot(mongoRepo, id));
});
