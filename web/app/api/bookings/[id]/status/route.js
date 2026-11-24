import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../../lib/repo/mongo-repo.js';
import { changeStatus } from '../../../../../lib/bookings-service.js';
import { requireAdmin } from '../../../../../lib/current-admin.js';
import { handle } from '../../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// PATCH /api/bookings/AS-2026-0001/status  { status: "Confirmed", videoUrl?: "https://...", note?: "..." }
// Moves the booking one step forward and returns the generated notification.   (owner, staff)
export const PATCH = handle(async (request, { params }) => {
  const admin = await requireAdmin('workflow:advance');
  const { id } = await params;
  const { status, videoUrl, note } = await request.json();
  const result = await changeStatus(mongoRepo, id, status, { videoUrl, note, by: admin.name });
  return NextResponse.json(result);
});
