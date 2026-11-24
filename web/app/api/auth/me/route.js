import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/current-admin.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/auth/me  -> { admin: { username, name, role, lastLoginAt } }
export const GET = handle(async () => {
  const { username, name, role, lastLoginAt } = await requireAdmin();
  return NextResponse.json({ admin: { username, name, role, lastLoginAt } });
});
