import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { listAdmins, createAdmin } from '../../../lib/auth-service.js';
import { requireAdmin } from '../../../lib/current-admin.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/admins -> the team   (owner)
export const GET = handle(async () => {
  await requireAdmin('admins:manage');
  return NextResponse.json({ admins: await listAdmins(mongoRepo) });
});

// POST /api/admins  { username, name, role, password }   (owner)
export const POST = handle(async (request) => {
  const admin = await requireAdmin('admins:manage');
  const created = await createAdmin(mongoRepo, await request.json(), { by: admin.name });
  return NextResponse.json({ admin: created }, { status: 201 });
});
