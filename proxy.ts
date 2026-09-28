import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { recordPageView } from '@/lib/traffic';
import { getClientIp } from '@/lib/rate-limit';
import { OWNER_COOKIE } from '@/lib/owner';

/** Counts page views (lib/traffic.ts) without delaying the response. */
export function proxy(request: NextRequest, event: NextFetchEvent) {
  event.waitUntil(
    recordPageView({
      method: request.method,
      pathname: request.nextUrl.pathname,
      headers: request.headers,
      ownerCookie: request.cookies.get(OWNER_COOKIE)?.value === '1',
      ip: getClientIp(request),
      host: request.nextUrl.hostname,
    })
  );
  return NextResponse.next();
}

export const config = {
  // Pages only: no API routes, Next.js/Vercel internals or static files.
  matcher: ['/((?!api/|_next/|_vercel/|.*\\..*).*)'],
};
