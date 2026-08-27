import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";
import {
  LIVEKIT_API_KEY as API_KEY,
  LIVEKIT_API_SECRET as API_SECRET,
  LIVEKIT_URL,
} from "@/lib/streaming/livekit-config";

const ROOM_NAME = "fifayiti-broadcast";

/**
 * GET /api/stream/health
 *
 * Streaming-stack health against LiveKit CLOUD (the old version proxied
 * the retired VPS ws-server at 127.0.0.1:4070 — gone with the VPS).
 *
 *   { online, broadcastRoomActive, cameramen, participants }
 *
 *   online               — LiveKit Cloud API reachable with valid credentials
 *   broadcastRoomActive  — the broadcast room exists (someone is/was connected)
 *   cameramen            — connected participants with camera metadata
 *   participants         — total participants in the room
 */
export async function GET() {
  try {
    const rs = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);
    const rooms = await rs.listRooms();
    const room = rooms.find((r: any) => r.name === ROOM_NAME) ?? null;

    let participants: any[] = [];
    let cameramen = 0;
    if (room) {
      try {
        participants = await rs.listParticipants(ROOM_NAME);
        cameramen = participants.filter((p: any) => {
          try {
            const meta = p.metadata ? JSON.parse(p.metadata) : {};
            return meta.role === "cameraman" || !!meta.slot;
          } catch {
            return false;
          }
        }).length;
      } catch {
        // room may vanish between calls — not fatal
      }
    }

    return NextResponse.json({
      online: true,
      broadcastRoomActive: !!room,
      cameramen,
      participants: participants.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message, online: false },
      { status: 503 }
    );
  }
}
