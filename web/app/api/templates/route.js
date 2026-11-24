import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../lib/repo/mongo-repo.js';
import { getTemplates } from '../../../lib/bookings-service.js';
import { TEMPLATES, TEMPLATE_RULES } from '../../../lib/workflow.js';
import { requireAdmin } from '../../../lib/current-admin.js';
import { handle } from '../../../lib/http.js';

export const dynamic = 'force-dynamic';

// GET /api/templates -> { templates, defaults, rules, meta }  (everyone: the booking page previews with these)
export const GET = handle(async () => {
  await requireAdmin();
  const { templates, meta } = await getTemplates(mongoRepo);
  return NextResponse.json({ templates, defaults: TEMPLATES, rules: TEMPLATE_RULES, meta });
});
