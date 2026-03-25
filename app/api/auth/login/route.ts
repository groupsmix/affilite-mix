import { NextRequest, NextResponse } from "next/server";
import { verifyCredentials, createToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { password, siteId } = body as { password?: string; siteId?: string };

  if (!password || !siteId) {
    return NextResponse.json(
      { error: "password and siteId are required" },
      { status: 400 },
    );
  }

  if (!verifyCredentials(password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await createToken({ siteId, role: "admin" });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}
