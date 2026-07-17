import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_PASSWORD || 'default_secret');

export async function middleware(request: NextRequest) {
  const authCookie = request.cookies.get('foxora_auth');
  const isLoginPage = request.nextUrl.pathname.startsWith('/login');

  if (!authCookie?.value && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (authCookie?.value) {
    try {
      const { payload } = await jwtVerify(authCookie.value, JWT_SECRET);
      
      // Inject user role/info into headers for downstream API usage if needed
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-user-role', payload.role as string);
      requestHeaders.set('x-user-email', payload.email as string);

      if (isLoginPage) {
        return NextResponse.redirect(new URL('/', request.url));
      }

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        }
      });
    } catch (err) {
      // Invalid token
      if (!isLoginPage) {
        const response = NextResponse.redirect(new URL('/login', request.url));
        response.cookies.delete('foxora_auth');
        return response;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
