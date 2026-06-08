import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, checkPassword, makeAuthCookie } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const password = (body.password ?? "").trim();
  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, await makeAuthCookie(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 天
  });
  return NextResponse.json({ ok: true });
}
