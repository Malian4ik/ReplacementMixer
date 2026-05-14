import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Игроки, которые не уходили в замену и не были заменены — «верные» игроки */
export async function GET() {
  // Все команды с их составом
  const teams = await prisma.team.findMany();

  // Карта playerId → teamName
  const teamPlayerMap = new Map<string, string>();
  for (const t of teams) {
    for (const pid of [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]) {
      if (pid) teamPlayerMap.set(pid, t.name);
    }
  }

  // Все игроки, задействованные в заменах (с любой стороны)
  const logs = await prisma.matchSubstitutionLog.findMany({
    select: { replacedPlayerId: true, replacementPlayerId: true },
  });

  const substitutedIds = new Set<string>();
  for (const l of logs) {
    if (l.replacedPlayerId) substitutedIds.add(l.replacedPlayerId);
    if (l.replacementPlayerId) substitutedIds.add(l.replacementPlayerId);
  }

  // Игроки в текущих командах, не затронутые заменами
  const stayedIds = [...teamPlayerMap.keys()].filter(id => !substitutedIds.has(id));

  const players = await prisma.player.findMany({
    where: { id: { in: stayedIds } },
    select: { id: true, nick: true, mmr: true, matchesPlayed: true },
  });

  // Группируем по командам
  const byTeam: Record<string, { nick: string; mmr: number; matchesPlayed: number }[]> = {};
  for (const p of players) {
    const team = teamPlayerMap.get(p.id)!;
    if (!byTeam[team]) byTeam[team] = [];
    byTeam[team].push({ nick: p.nick, mmr: p.mmr, matchesPlayed: p.matchesPlayed });
  }

  const totalMatchesPlayed = players.reduce((s, p) => s + p.matchesPlayed, 0);
  const avgMatchesPlayed = players.length > 0
    ? (totalMatchesPlayed / players.length).toFixed(1)
    : "0";

  const teamStats = Object.entries(byTeam)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, members]) => ({
      team: name,
      loyalCount: members.length,
      full: members.length === 5,
      players: members.sort((a, b) => a.nick.localeCompare(b.nick)),
    }));

  const fullTeams = teamStats.filter(t => t.full).length;

  return NextResponse.json({
    summary: {
      totalSlots: teamPlayerMap.size,
      substitutedPlayers: substitutedIds.size,
      loyalPlayers: stayedIds.length,
      teamsAllLoyal: fullTeams,
      totalTeams: Object.keys(byTeam).length,
      totalMatchesPlayedByLoyal: totalMatchesPlayed,
      avgMatchesPerLoyalPlayer: avgMatchesPlayed,
    },
    teams: teamStats,
    logCount: logs.length,
  });
}
