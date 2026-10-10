import { NextResponse } from "next/server";
import { COOKIE, authToken } from "./lib/auth";

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  if (!process.env.APP_PASSWORD) {
    return new NextResponse("APP_PASSWORD is not set", { status: 500 });
  }
  if (req.cookies.get(COOKIE)?.value === (await authToken())) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // everything except Next internals and the icon
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
