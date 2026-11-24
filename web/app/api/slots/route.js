import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { listSlots, createSlots } from '../../../lib/slots-service.js';
import { requireAdmin } from '../../../lib/current-admin.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/slots?temple=&from=YYYY-MM-DD&to=YYYY-MM-DD&available=1
// -> { slots: [{ id, templeName, startsAt, endsAt, capacity, booked, remaining, state }] }
export const GET = handle(async (request) => {
  await requireAdmin();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return NextResponse.json({ slots: await listSlots(mongoRepo, params) });
});

// POST /api/slots  { templeName, from, to, weekdays: [0-6], times: ["07:00"], durationMinutes, capacity, note? }
// -> { created, skipped }   (clashing or past times are skipped and explained)
export const POST = handle(async (request) => {
  const admin = await requireAdmin();
  const result = await createSlots(mongoRepo, await request.json(), { by: admin.name });
  return NextResponse.json(result, { status: 201 });
});
