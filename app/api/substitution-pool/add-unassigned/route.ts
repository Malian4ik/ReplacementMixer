import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    // Find all player IDs currently assigned to any team slot
    const teams = await prisma.team.findMany({
      select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
    });
    const assignedIds = new Set(
      teams.flatMap(t => [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter((id): id is string => id !== null))
    );

    // Get active players not in any team
    const unassigned = await prisma.player.findMany({
      where: { isActiveInDatabase: true, id: { notIn: [...assignedIds] } },
      orderBy: { createdAt: "asc" },
    });

    // Get existing pool entries to avoid duplicates
    const existing = await prisma.substitutionPoolEntry.findMany({
      select: { playerId: true },
    });
    const existingPlayerIds = new Set(existing.map(e => e.playerId));

    const toAdd = unassigned.filter(p => !existingPlayerIds.has(p.id));

    if (toAdd.length === 0) {
      return NextResponse.json({ ok: true, added: 0, message: "Все игроки уже в пуле" });
    }

    // Find max joinTime among non-pinned entries (pinned = year 2099) so new entries go before pinned players
    const PINNED_THRESHOLD = new Date("2099-01-01T00:00:00.000Z");
    const lastEntry = await prisma.substitutionPoolEntry.findFirst({
      where: { joinTime: { lt: PINNED_THRESHOLD } },
      orderBy: { joinTime: "desc" },
      select: { joinTime: true },
    });
    const baseTime = lastEntry ? lastEntry.joinTime.getTime() : Date.now();

    await prisma.substitutionPoolEntry.createMany({
      data: toAdd.map((p, i) => ({
        playerId: p.id,
        status: "Active",
        source: "manual",
        joinTime: new Date(baseTime + (i + 1) * 1000),
      })),
    });

    return NextResponse.json({ ok: true, added: toAdd.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
