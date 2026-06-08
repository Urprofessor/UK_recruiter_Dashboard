import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, verifyAuthCookie } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 登录页 + 登录 API 始终放行
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const cookieVal = req.cookies.get(AUTH_COOKIE)?.value;
  if (await verifyAuthCookie(cookieVal)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 跳过 Next 静态资源
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
