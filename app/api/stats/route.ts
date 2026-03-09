import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const teams = await prisma.team.findMany();
  if (teams.length === 0) return NextResponse.json({ targetAvgMmr: 9000 });

  const playerIds = [...new Set(teams.flatMap(t => [
    t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id,
  ]))];
  const players = await prisma.player.findMany({ where: { id: { in: playerIds } } });
  const playerMap = new Map(players.map(p => [p.id, p]));

  let totalMmr = 0;
  let totalPlayers = 0;
  for (const t of teams) {
    for (const id of [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]) {
      const p = playerMap.get(id);
      if (p) { totalMmr += p.mmr; totalPlayers++; }
    }
  }

  const targetAvgMmr = totalPlayers > 0 ? Math.round(totalMmr / totalPlayers) : 9000;
  return NextResponse.json({ targetAvgMmr });
}
