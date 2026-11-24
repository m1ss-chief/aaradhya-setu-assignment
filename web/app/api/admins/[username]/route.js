import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../lib/repo/mongo-repo.js';
import { updateAdmin, removeAdmin } from '../../../../lib/auth-service.js';
import { requireAdmin } from '../../../../lib/current-admin.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// PATCH /api/admins/:username  { name?, role?, password? }   (owner)
export const PATCH = handle(async (request, { params }) => {
  const me = await requireAdmin('admins:manage');
  const { username } = await params;
  const { name, role, password } = await request.json();
  return NextResponse.json({ admin: await updateAdmin(mongoRepo, me.username, username, { name, role, password }) });
});

// DELETE /api/admins/:username   (owner; not yourself, never the last owner)
export const DELETE = handle(async (_request, { params }) => {
  const me = await requireAdmin('admins:manage');
  const { username } = await params;
  return NextResponse.json(await removeAdmin(mongoRepo, me.username, username));
});
