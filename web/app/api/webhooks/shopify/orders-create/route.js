import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { mongoRepo } from '../../../../../lib/repo/mongo-repo.js';
import { createBookingsFromShopifyOrder } from '../../../../../lib/bookings-service.js';
import { handle } from '../../../../../lib/http.js';

export const dynamic = 'force-dynamic';

// Shopify "orders/create" webhook. Connects Option 1 (the storefront) to
// Options 2 and 3: every puja bought on Shopify appears here as a Pending booking.
// Point the webhook at https://<your-app>/api/webhooks/shopify/orders-create
export const POST = handle(async (request) => {
  const raw = await request.text();

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (secret) {
    const expected = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('base64');
    const received = request.headers.get('x-shopify-hmac-sha256') || '';
    const valid =
      received.length === expected.length && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    if (!valid) return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const bookings = await createBookingsFromShopifyOrder(mongoRepo, JSON.parse(raw));
  return NextResponse.json({ created: bookings.map((b) => b.bookingId) }, { status: 201 });
});
