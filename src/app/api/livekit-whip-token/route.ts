import { NextResponse } from "next/server";
import { IngressClient, IngressInput } from "livekit-server-sdk";
import { getSessionRole } from "@/lib/auth/session";

import { LIVEKIT_API_KEY as API_KEY, LIVEKIT_API_SECRET as API_SECRET, LIVEKIT_URL } from "@/lib/streaming/livekit-config";

// WHIP endpoint base — must match `ingress.whip_base_url` in
// /root/livekit/livekit.yaml. The stream key is appended as a path
// segment: <base>/<streamKey>
const WHIP_BASE = "https://fifayiti.medikahaiti.site/livekit-whip";

function slotFromRole(role: string): number | null {
  if (role === "cameraman" || role === "cameraman1") return 1;
  if (role === "cameraman2") return 2;
  if (role === "cameraman3") return 3;
  return null;
}

/**
 * GET /api/livekit-whip-token
 *
 * Returns a WHIP URL + stream key that a cameraman pastes into OBS
 * Studio (Settings → Stream → Service: WHIP) to publish over WebRTC
 * through the medika-ingress container, which transcodes to simulcast
 * layers and joins the LiveKit room as `camera-${slot}`.
 *
 * Auth: the signed `fifayiti-session` cookie set by /api/auth/login.
 * Only cameraman* accounts can mint a WHIP token.
 *
 * Response:
 *   { whipUrl, token, roomName, slot, identity }
 *
 * OBS configuration (verified against the live deployment):
 *   Server       = https://fifayiti.medikahaiti.site/livekit-whip/<streamKey>
 *   Bearer Token = <streamKey>
 *   (nginx proxies /livekit-whip → 127.0.0.1:8180/whip on the VPS)
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
        { error: "Ou pa gen dwa pou OBS. Sèl cameraman ka itilize OBS." },
        { status: 403 }
      );
    }

    const roomName = "fifayiti-broadcast";
    const participantIdentity = `camera-${slot}`;
    const ingressName = `fifayiti-camera-${slot}-whip`;

    const ingressClient = new IngressClient(LIVEKIT_URL, API_KEY, API_SECRET);

    // 2. Re-use an existing WHIP ingress for this slot
    let ingress: any;
    try {
      const existing = await ingressClient.listIngress({ roomName });
      ingress = existing.find(
        (i: any) => i.name === ingressName && i.inputType === IngressInput.WHIP_INPUT
      );
    } catch (e: any) {
      console.error("[livekit-whip-token] listIngress failed:", e);
    }

    if (!ingress) {
      try {
        ingress = await ingressClient.createIngress(IngressInput.WHIP_INPUT, {
          name: ingressName,
          roomName,
          participantIdentity,
          participantName: participantIdentity,
          // CRITICAL: the TV page matches cameras via participant
          // metadata (meta.slot === selectedSlot). Without this, an OBS
          // camera would connect but never show on TV.
          participantMetadata: JSON.stringify({ slot, role: "cameraman" }),
          // Transcode to simulcast layers so weak-mobile-data viewers
          // get 360p/540p instead of freezing on a single 1080p layer.
          enableTranscoding: true,
        });
      } catch (e: any) {
        console.error("[livekit-whip-token] createIngress failed:", e);
        return NextResponse.json(
          { error: `Pa ka kreye antre OBS: ${e.message ?? "erè enkoni"}` },
          { status: 500 }
        );
      }
    }

    const streamKey = ingress.streamKey as string;

    // 3. Build the public WHIP URL: <base>/<streamKey>
    //    (the livekit-ingress service resolves the stream key from the
    //    final URL path segment — verified on the live deployment)
    let base = (ingress.url as string) || WHIP_BASE;
    if (!base.startsWith("https://")) base = WHIP_BASE;
    base = base.replace(/\/+$/, "");
    if (streamKey && base.endsWith("/" + streamKey)) {
      base = base.slice(0, base.length - streamKey.length - 1);
    }
    const publicUrl = base + "/" + streamKey;

    return NextResponse.json({
      whipUrl: publicUrl,
      token: streamKey,
      roomName,
      slot,
      identity: participantIdentity,
    });
  } catch (e: any) {
    console.error("[livekit-whip-token] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
