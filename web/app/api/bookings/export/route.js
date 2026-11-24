import { mongoRepo } from '../../../../lib/repo/mongo-repo.js';
import { exportBookings, bookingsToCsv } from '../../../../lib/bookings-service.js';
import { requireAdmin } from '../../../../lib/current-admin.js';
import { handle } from '../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/bookings/export?<same filters as /api/bookings>  -> CSV of ALL matching bookings
export const GET = handle(async (request) => {
  await requireAdmin();
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const csv = bookingsToCsv(await exportBookings(mongoRepo, params));
  const date = new Date().toISOString().slice(0, 10);
  // The BOM makes Excel read the file as UTF-8 (₹, Devanagari names).
  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bookings-' + date + '.csv"',
    },
  });
});
