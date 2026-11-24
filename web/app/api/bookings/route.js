import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { listBookings, createBooking } from '../../../lib/bookings-service.js';
import { currentAdmin } from '../../../lib/current-admin.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/bookings?q=&status=&puja=&from=&to=&sort=date|amount|devotee|created&order=asc|desc
export const GET = handle(async (request) => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const bookings = await listBookings(mongoRepo, params);
  return NextResponse.json({ bookings });
});

// POST /api/bookings  { devoteeName, phone, pujaName, templeName, pujaDate, amount, email?, gotra? }
export const POST = handle(async (request) => {
  const body = await request.json();
  const admin = await currentAdmin();
  const booking = await createBooking(mongoRepo, body, { source: 'admin', by: admin?.name });
  return NextResponse.json({ booking }, { status: 201 });
});
