import { prisma } from "@/lib/prisma";

export async function recalculateMatchStats(): Promise<{ totalMatches: number; playersUpdated: number }> {
  const allMatches = await prisma.tournamentMatch.findMany({
    where: { status: { in: ["Completed", "TechLoss"] } },
    select: { homeTeam: true, awayTeam: true },
  });

  const matchCountByTeam = new Map<string, number>();
  for (const m of allMatches) {
    matchCountByTeam.set(m.homeTeam, (matchCountByTeam.get(m.homeTeam) ?? 0) + 1);
    matchCountByTeam.set(m.awayTeam, (matchCountByTeam.get(m.awayTeam) ?? 0) + 1);
  }

  const allTeams = await prisma.team.findMany({
    select: { name: true, player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
  });

  const playerNewCount = new Map<string, number>();
  for (const team of allTeams) {
    const count = matchCountByTeam.get(team.name) ?? 0;
    if (count === 0) continue;
    for (const pid of [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id]) {
      if (!pid) continue;
      playerNewCount.set(pid, Math.max(playerNewCount.get(pid) ?? 0, count));
    }
  }

  let updated = 0;
  for (const [playerId, count] of playerNewCount.entries()) {
    const r = await prisma.player.updateMany({ where: { id: playerId }, data: { matchesPlayed: count } });
    updated += r.count;
  }

  const updatedIds = [...playerNewCount.keys()];
  const zeroed = await prisma.player.updateMany({
    where: { matchesPlayed: { gt: 0 }, id: { notIn: updatedIds } },
    data: { matchesPlayed: 0 },
  });
  updated += zeroed.count;

  return { totalMatches: allMatches.length, playersUpdated: updated };
}
