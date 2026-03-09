import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
  });

  const playerIds = teams.flatMap((t) => [
    t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id,
  ]);
  const uniqueIds = [...new Set(playerIds)];
  const players = await prisma.player.findMany({ where: { id: { in: uniqueIds } } });
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const teamsWithAvg = teams.map((t) => {
    const roster = [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]
      .map((id) => playerMap.get(id))
      .filter(Boolean);
    const avgMmr = roster.length
      ? Math.round(roster.reduce((s, p) => s + p!.mmr, 0) / roster.length)
      : 0;
    return { ...t, avgMmr, players: roster };
  });

  return NextResponse.json(teamsWithAvg);
}
