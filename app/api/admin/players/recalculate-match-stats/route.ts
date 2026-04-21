import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/players/recalculate-match-stats
 *
 * Recalculates matchesPlayed for all players based on TournamentMatch records
 * and current team membership. The value only ever increases (never decreases),
 * so players who left a team retain their match count.
 */
export async function POST() {
  // 1. Count matches per team name
  const allMatches = await prisma.tournamentMatch.findMany({
    select: { homeTeam: true, awayTeam: true },
  });

  const matchCountByTeam = new Map<string, number>();
  for (const m of allMatches) {
    matchCountByTeam.set(m.homeTeam, (matchCountByTeam.get(m.homeTeam) ?? 0) + 1);
    matchCountByTeam.set(m.awayTeam, (matchCountByTeam.get(m.awayTeam) ?? 0) + 1);
  }

  // 2. Map player → match count from their current team
  const allTeams = await prisma.team.findMany({
    select: { name: true, player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
  });

  const playerNewCount = new Map<string, number>();
  for (const team of allTeams) {
    const count = matchCountByTeam.get(team.name) ?? 0;
    if (count === 0) continue;
    for (const pid of [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id]) {
      if (!pid) continue;
      // Keep the max across all teams a player may have been on
      playerNewCount.set(pid, Math.max(playerNewCount.get(pid) ?? 0, count));
    }
  }

  // 3. Update only players whose count would increase
  let updated = 0;
  for (const [playerId, count] of playerNewCount.entries()) {
    const result = await prisma.player.updateMany({
      where: { id: playerId, matchesPlayed: { lt: count } },
      data: { matchesPlayed: count },
    });
    updated += result.count;
  }

  return NextResponse.json({
    ok: true,
    teamsProcessed: allTeams.length,
    totalMatches: allMatches.length,
    playersUpdated: updated,
  });
}
