import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../lib/repo/mongo-repo.js';
import { changeOwnPassword } from '../../../../lib/auth-service.js';
import { requireAdmin } from '../../../../lib/current-admin.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// POST /api/auth/password  { currentPassword, newPassword }  -> changes your own password
export const POST = handle(async (request) => {
  const admin = await requireAdmin();
  const { currentPassword, newPassword } = await request.json();
  return NextResponse.json(await changeOwnPassword(mongoRepo, admin.username, currentPassword, newPassword));
});
