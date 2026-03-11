import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/register", "/setup", "/api/auth", "/api/setup", "/api/cron"];

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET ?? "mixercup-jwt-secret-change-me");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return NextResponse.next();

  const token = req.cookies.get("mc_session")?.value;
  if (!token) return NextResponse.redirect(new URL("/login", req.url));

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const res = NextResponse.next();
    res.headers.set("x-user-id", String(payload.userId ?? ""));
    res.headers.set("x-user-role", String(payload.role ?? ""));
    res.headers.set("x-user-name", String(payload.name ?? ""));
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
