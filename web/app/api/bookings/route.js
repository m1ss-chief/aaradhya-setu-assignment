import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { listBookings, createBooking } from '../../../lib/bookings-service.js';
import { requireAdmin } from '../../../lib/current-admin.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/bookings?q=&status=&puja=&slot=&from=&to=&sort=&order=&page=1&pageSize=10
// -> { bookings, total, page, pageSize, pages }   (paged in the database)
export const GET = handle(async (request) => {
  await requireAdmin();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return NextResponse.json(await listBookings(mongoRepo, params));
});

// POST /api/bookings  { devoteeName, phone, pujaName, templeName, slotId, amount, email?, gotra? }
// Takes a seat in the slot; the puja date is the slot's start time.
export const POST = handle(async (request) => {
  const admin = await requireAdmin();
  const booking = await createBooking(mongoRepo, await request.json(), { source: 'admin', by: admin.name, requireSlot: true });
  return NextResponse.json({ booking }, { status: 201 });
});
