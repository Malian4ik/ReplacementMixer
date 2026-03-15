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
    const existing = await prisma.replacementPoolEntry.findMany({
      select: { playerId: true },
    });
    const existingPlayerIds = new Set(existing.map(e => e.playerId));

    const toAdd = unassigned.filter(p => !existingPlayerIds.has(p.id));

    if (toAdd.length === 0) {
      return NextResponse.json({ ok: true, added: 0, message: "Все игроки уже в пуле" });
    }

    await prisma.replacementPoolEntry.createMany({
      data: toAdd.map(p => ({
        playerId: p.id,
        status: "Active",
        source: "manual",
        joinTime: p.createdAt, // preserve original entry time
      })),
    });

    return NextResponse.json({ ok: true, added: toAdd.length });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
