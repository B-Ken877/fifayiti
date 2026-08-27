import { NextResponse } from "next/server";
import { IngressClient, IngressInput } from "livekit-server-sdk";
import { getSessionRole } from "@/lib/auth/session";

import { LIVEKIT_API_KEY as API_KEY, LIVEKIT_API_SECRET as API_SECRET, LIVEKIT_URL } from "@/lib/streaming/livekit-config";

// RTMP ingest base is NOT hardcoded: LiveKit Cloud returns it from the
// Ingress API (ingress.url — Cloud serves rtmps://<project>.rtp.livekit.cloud/x,
// i.e. RTMP over TLS).
//   Streamlabs "URL"        = ingress.url
//   Streamlabs "Stream key" = ingress.streamKey
//   full publish URL        = <base>/<streamKey>

function slotFromRole(role: string): number | null {
  if (role === "cameraman" || role === "cameraman1") return 1;
  if (role === "cameraman2") return 2;
  if (role === "cameraman3") return 3;
  return null;
}

/**
 * GET /api/livekit-rtmp-token
 *
 * Returns the RTMP URL + stream key a cameraman pastes into the
 * Streamlabs mobile app (Settings → Platforms → Custom RTMP) — or any
 * other RTMP encoder (OBS RTMP output, Larix Broadcaster, ...).
 *
 * Streamlabs bonds Wi-Fi + cellular ("Network Boost"), auto-reconnects,
 * and uses a real hardware encoder — ideal for Haitian stadium
 * conditions where the browser-based camera page struggles.
 *
 * Auth: the signed `fifayiti-session` cookie set by /api/auth/login.
 * Only cameraman* accounts can mint RTMP credentials.
 *
 * Response:
 *   { rtmpUrl, streamKey, fullUrl, name, roomName, slot, identity }
 *
 * Behind the scenes:
 *   1. Cameraman clicks "Jwenn enfòmasyon Streamlabs mwen an"
 *   2. This endpoint authenticates them via the session cookie
 *   3. Re-uses (or creates) an RTMP ingress for room `fifayiti-broadcast`
 *      with identity `camera-${slot}` and metadata { slot, role } —
 *      the TV page matches cameras by that metadata
 *   4. LiveKit returns the ingress URL + streamKey
 *   5. Streamlabs pushes RTMP to the URL LiveKit Cloud returned → Cloud's
 *      managed ingress transcodes to simulcast layers and joins the room
 *      as `camera-${slot}` — the operator's slot selection works exactly
 *      like with the browser camera.
 */
export async function GET(req: Request) {
  try {
    // 1. Auth check
    const role = getSessionRole(req.headers.get("cookie"));
    if (!role) {
      return NextResponse.json(
        { error: "Ou pa konekte. Konekte tankou cameraman anvan." },
        { status: 401 }
      );
    }
    const slot = slotFromRole(role);
    if (slot == null) {
      return NextResponse.json(
        { error: "Ou pa gen dwa pou Streamlabs. Sèl cameraman ka itilize li." },
        { status: 403 }
      );
    }

    const roomName = "fifayiti-broadcast";
    const participantIdentity = `camera-${slot}`;
    const ingressName = `fifayiti-camera-${slot}-rtmp`;

    const ingressClient = new IngressClient(LIVEKIT_URL, API_KEY, API_SECRET);

    // 2. Re-use an existing RTMP ingress for this slot so the credentials
    //    stay stable across days — the cameraman doesn't have to re-paste
    //    them into Streamlabs for every match.
    let ingress: any;
    try {
      const existing = await ingressClient.listIngress({ roomName });
      ingress = existing.find(
        (i: any) => i.name === ingressName && i.inputType === IngressInput.RTMP_INPUT
      );
    } catch (e: any) {
      console.error("[livekit-rtmp-token] listIngress failed:", e);
    }

    if (!ingress) {
      try {
        ingress = await ingressClient.createIngress(IngressInput.RTMP_INPUT, {
          name: ingressName,
          roomName,
          participantIdentity,
          participantName: participantIdentity,
          // The TV page's scanForSelected() matches cameras via
          // participant metadata (meta.slot === selectedSlot) — and the
          // phantom-live guard in /api/livekit-room needs role/slot too.
          participantMetadata: JSON.stringify({ slot, role: "cameraman" }),
        });
      } catch (e: any) {
        console.error("[livekit-rtmp-token] createIngress failed:", e);
        return NextResponse.json(
          { error: `Pa ka kreye antre Streamlabs: ${e.message ?? "erè enkoni"}` },
          { status: 500 }
        );
      }
    }

    const streamKey = ingress.streamKey as string;

    // 4. LiveKit Cloud returns rtmps:// (RTMP over TLS); accept both it
    //    and plain rtmp:// so the check also works against self-hosted.
    //    If it's missing or malformed, fail loudly instead of pointing the
    //    cameraman at a dead self-hosted endpoint.
    let base = (ingress.url as string) || "";
    base = base.replace(/\/+$/, "");
    if (streamKey && base.endsWith("/" + streamKey)) {
      base = base.slice(0, base.length - streamKey.length - 1);
    }
    if (!base.startsWith("rtmp://") && !base.startsWith("rtmps://")) {
      return NextResponse.json(
        { error: `LiveKit Cloud pa te bay URL RTMP an (jwenn: "${base || "vide"}"). Esaye ankò.` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      rtmpUrl: base,
      streamKey,
      fullUrl: base + "/" + streamKey,
      name: `FIFAYITI Kamera ${slot}`,
      roomName,
      slot,
      identity: participantIdentity,
    });
  } catch (e: any) {
    console.error("[livekit-rtmp-token] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
