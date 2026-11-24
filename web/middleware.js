import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from './lib/session.js';

// Everything is admin-only except the login page/API and the Shopify webhook
// (which has its own HMAC signature check).
const PUBLIC_PREFIXES = ['/api/auth/login', '/api/webhooks/'];

export async function middleware(request) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // Basic CSRF protection: a state-changing API call must come from this site.
  if (isApi && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !pathname.startsWith('/api/webhooks/')) {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host')) {
      return NextResponse.json({ error: 'Cross-site request blocked' }, { status: 403 });
    }
  }

  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/login') {
    // Already signed in: skip the login page.
    return session ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!session) {
    if (isApi) return NextResponse.json({ error: 'Please sign in' }, { status: 401 });
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', pathname + search);
    const res = NextResponse.redirect(login);
    if (request.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE); // expired or tampered
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)'],
};
