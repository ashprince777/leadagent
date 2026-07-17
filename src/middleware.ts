import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const authCookie = request.cookies.get('foxora_auth');
  const isLoginPage = request.nextUrl.pathname.startsWith('/login');

  // Allow access to API routes for now or protect them? We'll protect everything except /login and static assets.
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');

  // If there's no auth cookie, redirect to /login
  if (!authCookie?.value && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If they are on the login page but already authenticated, redirect to home
  if (authCookie?.value && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

// Config to specify which routes this middleware applies to
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
