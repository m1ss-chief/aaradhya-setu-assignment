import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../lib/repo/mongo-repo.js';
import { saveTemplate, resetTemplate } from '../../../../lib/bookings-service.js';
import { requireAdmin } from '../../../../lib/current-admin.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// PUT /api/templates/Confirmed  { body: "..." }
export const PUT = handle(async (request, { params }) => {
  const admin = await requireAdmin();
  const status = decodeURIComponent((await params).status);
  const { body } = await request.json();
  return NextResponse.json(await saveTemplate(mongoRepo, status, body, { by: admin.name }));
});

// DELETE /api/templates/Confirmed  -> back to the default wording
export const DELETE = handle(async (_request, { params }) => {
  await requireAdmin();
  const status = decodeURIComponent((await params).status);
  return NextResponse.json(await resetTemplate(mongoRepo, status));
});
