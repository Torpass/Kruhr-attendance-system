import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "marcaje_session";

/**
 * Solo comodidad de navegación: manda a /login a quien no tiene cookie.
 * La autorización real la decide NestJS en cada request a /api.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;

  const isPrivate = ["/panel", "/marcar", "/rrhh", "/admin"].some((prefix) => pathname.startsWith(prefix));
  if (!hasSession && isPrivate) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (hasSession && (pathname === "/login" || pathname === "/registro")) {
    return NextResponse.redirect(new URL("/panel", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/registro", "/panel/:path*", "/marcar/:path*", "/rrhh/:path*", "/admin/:path*"],
};
