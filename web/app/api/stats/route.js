import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { getStats } from '../../../lib/bookings-service.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/stats -> { total, byStatus, revenue, pujas }
export const GET = handle(async () => NextResponse.json(await getStats(mongoRepo)));
