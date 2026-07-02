import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "../../../../lib/auth";
import { handle } from "../../../../lib/api";

export const POST = handle(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
});
