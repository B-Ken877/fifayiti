// Middleware — protect /operator/* routes by session cookie.
//
// Sessions are HMAC-signed cookies (see src/lib/auth/session.ts).
// We check the role here so direct URL access to /operator/camera/1
// or /operator/control without a valid session bounces to /login.
//
// The middleware runs on the Edge runtime, which means Node's `crypto`
// module is available via `crypto` global (Edge has crypto.subtle but
// scrypt is NOT available — we only need timingSafeEqual + HMAC here,
// both of which Node's `crypto` exposes and the Edge runtime ships).
//
// However, to be safe and avoid edge-runtime crypto quirks, we set
// `export const runtime = "nodejs"` so the middleware runs in the
// Node.js runtime (where crypto is fully supported).

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

const COOKIE_NAME = "fifayiti-session";

function getSecret(): string {
  const s = process.env.FIFAYITI_AUTH_SECRET;
  if (!s || s.length < 32) return "";
  return s;
}

function verifyToken(token: string): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expectedMac = createHmac("sha256", secret).update(body).digest("hex");
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expectedMac, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (typeof payload.role !== "string" || typeof payload.exp !== "number") return null;
    if (Date.now() / 1000 > payload.exp) return null;
    return payload.role as string;
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const [k, ...v] = c.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const token = cookies[COOKIE_NAME];
  const role = token ? verifyToken(token) : null;

  const path = req.nextUrl.pathname;

  // Path → required role(s) matrix
  let allowedRoles: string[] = [];
  if (path.startsWith("/operator/camera")) {
    allowedRoles = ["cameraman", "live_operator", "president", "director"];
  } else if (path.startsWith("/operator/control")) {
    allowedRoles = ["live_operator", "president", "director"];
  } else {
    return NextResponse.next();
  }

  if (!role || !allowedRoles.includes(role)) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/operator/:path*"],
};
