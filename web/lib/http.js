import { NextResponse } from 'next/server';
import { ServiceError } from './bookings-service.js';

// Wraps a route handler so service errors become clean JSON responses
// ({ error }) with the right status code instead of a 500 page.
export function handle(fn) {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (err) {
      if (err instanceof ServiceError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: err.message || 'Something went wrong' }, { status: 500 });
    }
  };
}
