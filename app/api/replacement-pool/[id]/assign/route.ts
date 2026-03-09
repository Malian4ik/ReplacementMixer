import { NextRequest, NextResponse } from "next/server";
import { assignReplacement } from "@/services/replacement.service";
import { z } from "zod";

const AssignSchema = z.object({
  matchId: z.string().optional(),
  teamId: z.string(),
  teamName: z.string(),
  neededRole: z.number().int().min(1).max(5),
  replacedPlayerId: z.string(),
  replacedPlayerNick: z.string(),
  replacedPlayerMmr: z.number(),
  targetAvgMmr: z.number(),
  maxDeviation: z.number(),
  judgeName: z.string().optional(),
  comment: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const ctx = AssignSchema.parse(body);
    const entry = await assignReplacement(id, ctx);
    return NextResponse.json(entry);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    if (msg === "ENTRY_NOT_ACTIVE") return NextResponse.json({ error: msg }, { status: 422 });
    if (msg === "PLAYER_NOT_IN_TEAM") return NextResponse.json({ error: msg }, { status: 422 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
