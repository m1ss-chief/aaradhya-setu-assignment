import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/current-admin.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/auth/me  -> { admin: { username, name, lastLoginAt } }
export const GET = handle(async () => {
  const { username, name, lastLoginAt } = await requireAdmin();
  return NextResponse.json({ admin: { username, name, lastLoginAt } });
});
