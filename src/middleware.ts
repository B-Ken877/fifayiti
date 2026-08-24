// Middleware — protect /operator/* routes by session cookie + role/slot
// binding.
//
// Sessions are HMAC-signed cookies (see src/lib/auth/session.ts).
// We check the role here so direct URL access to /operator/camera/1
// or /operator/control without a valid session bounces to /login.
//
// The middleware runs on the Node.js runtime (NOT Edge) so we have
// full crypto support.
//
// Slot binding rules for cameramen:
//   cameraman (legacy) → can access /operator/camera/1 ONLY
//   cameraman1         → can access /operator/camera/1 ONLY
//   cameraman2         → can access /operator/camera/2 ONLY
//   cameraman3         → can access /operator/camera/3 ONLY
// Other roles (president / director / live_operator) can access ANY
// /operator/camera/N route (for oversight) and /operator/control.
//
// Cameramen cannot access /operator/control at all — that's the
// broadcast desk reserved for live_operator and above.

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

function slotFromRole(role: string): number | null {
  if (role === "cameraman" || role === "cameraman1") return 1;
  if (role === "cameraman2") return 2;
  if (role === "cameraman3") return 3;
  return null;
}

function isCameramanRole(role: string): boolean {
  return role === "cameraman" || role === "cameraman1" ||
    role === "cameraman2" || role === "cameraman3";
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

  // ─── /operator/camera/[slot] ─────────────────────────────────────
  // Cameraman roles can only reach their own slot. President /
  // director / live_operator can reach any slot (for oversight).
  if (path.startsWith("/operator/camera")) {
    const allowedForAnySlot = ["live_operator", "president", "director"];
    const slotMatch = path.match(/\/operator\/camera\/(\d+)/);
    const slotNum = slotMatch ? Number(slotMatch[1]) : null;

    // No role at all → redirect to /login
    if (!role) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = `?next=${encodeURIComponent(path)}`;
      return NextResponse.redirect(loginUrl);
    }

    // Cameraman role: must match its slot
    if (isCameramanRole(role)) {
      const boundSlot = slotFromRole(role);
      if (slotNum === null || boundSlot !== slotNum) {
        // Wrong slot — redirect to their own slot.
        const ownUrl = req.nextUrl.clone();
        ownUrl.pathname = `/operator/camera/${boundSlot ?? 1}`;
        return NextResponse.redirect(ownUrl);
      }
      return NextResponse.next();
    }

    // Non-cameraman role: must be in the allowed list
    if (!allowedForAnySlot.includes(role)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = `?next=${encodeURIComponent(path)}`;
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ─── /operator/control ──────────────────────────────────────────
  // Reserved for live_operator and above. Cameramen are bounced to
  // their own slot URL.
  if (path.startsWith("/operator/control")) {
    if (isCameramanRole(role)) {
      // Cameraman tried to access the control desk → redirect to their slot.
      const ownUrl = req.nextUrl.clone();
      ownUrl.pathname = `/operator/camera/${slotFromRole(role) ?? 1}`;
      return NextResponse.redirect(ownUrl);
    }
    const allowedForControl = ["live_operator", "president", "director"];
    if (!role || !allowedForControl.includes(role)) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = `?next=${encodeURIComponent(path)}`;
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/operator/:path*"],
};
