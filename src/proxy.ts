import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/projects', '/settings', '/help'];

/** Fast redirect for signed-out visitors; real session validation happens on the server for every request. */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !req.cookies.has('aav_session')) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/projects/:path*', '/settings/:path*', '/help/:path*'] };
