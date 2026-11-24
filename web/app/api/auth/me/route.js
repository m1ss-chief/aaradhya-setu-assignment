import { NextResponse } from 'next/server';
import { currentAdmin } from '../../../../lib/current-admin.js';

export const dynamic = 'force-dynamic';

// GET /api/auth/me  -> { admin: { username, name, role } }
export async function GET() {
  const session = await currentAdmin();
  if (!session) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
  return NextResponse.json({ admin: { username: session.sub, name: session.name, role: session.role } });
}
