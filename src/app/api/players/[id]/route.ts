import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * PATCH  /api/players/[id]  — update a player
 * DELETE /api/players/[id]  — delete a player
 */

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, any> = {};
    for (const k of [
      "firstName", "lastName", "jerseyNumber", "position",
      "dateOfBirth", "idNumber", "photoUrl", "status",
    ]) {
      if (body[k] !== undefined) {
        data[k] = k === "jerseyNumber" ? Number(body[k]) : body[k];
      }
    }
    const player = await db.player.update({ where: { id }, data });
    return NextResponse.json({ player });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.player.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
