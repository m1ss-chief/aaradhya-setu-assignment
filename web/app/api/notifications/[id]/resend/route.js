import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../../lib/repo/mongo-repo.js';
import { resendNotification } from '../../../../../lib/bookings-service.js';
import { requireAdmin } from '../../../../../lib/current-admin.js';
import { handle } from '../../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// POST /api/notifications/:id/resend  -> retries a failed WhatsApp message
export const POST = handle(async (_request, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  return NextResponse.json({ notification: await resendNotification(mongoRepo, id, { by: admin.name }) });
});
