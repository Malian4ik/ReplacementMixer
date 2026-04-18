import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { addPlayerToSubstitutionPool } from "@/services/pool.service";
import { z } from "zod";

const AddToPoolSchema = z.object({
  playerId: z.string(),
  source: z.enum(["reduction", "manual_add", "returned", "transferred_from_main_pool"]),
  judgeName: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const where = status ? { status } : {};

  const entries = await prisma.substitutionPoolEntry.findMany({
    where,
    include: { player: true },
    orderBy: [{ joinTime: "asc" }],
  });

  const allTeams = await prisma.team.findMany({
    select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
  });
  const inTeamIds = new Set(
    allTeams.flatMap(t =>
      [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[]
    )
  );

  return NextResponse.json(entries.map(e => ({ ...e, inTeam: inTeamIds.has(e.playerId) })));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerId, source, judgeName } = AddToPoolSchema.parse(body);
    const entry = await addPlayerToSubstitutionPool(playerId, source, judgeName);
    return NextResponse.json(entry, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    if (msg === "DUPLICATE") {
      return NextResponse.json({ error: "Player already active in pool" }, { status: 409 });
    }
    if (msg === "IN_TEAM") {
      return NextResponse.json({ error: "Игрок уже находится в команде" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
