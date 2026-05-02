import { prisma } from "@/lib/prisma";
import { adminLogin, fetchTournamentScheduleData } from "./admin-source.service";

export async function recalculateMatchStats(): Promise<{ totalMatches: number; playersUpdated: number }> {
  const matchCountByTeam = new Map<string, number>();
  let totalMatches = 0;

  // Primary source: fetch completed matches directly from external admin
  const adminTournament = await prisma.adminTournament.findFirst({
    orderBy: { lastSyncedAt: "desc" },
  });

  if (adminTournament) {
    try {
      await adminLogin();
      const matches = await fetchTournamentScheduleData(adminTournament.externalId);
      // Use tournament startDate as cutoff, fallback to 2026-05-01 for current season
      const cutoff = adminTournament.startDate ?? new Date("2026-05-01T00:00:00Z");
      const completedMatches = matches.filter(m => {
        const s = (m.adminStatus ?? "").toLowerCase();
        if (!s || s === "pending" || s === "scheduled" || s === "запланирован") return false;
        if (!m.scheduledAt || m.scheduledAt < cutoff) return false;
        return true;
      });
      console.log("[recalc] admin matches total:", matches.length, "non-pending after", cutoff.toISOString(), ":", completedMatches.length,
        "statuses:", [...new Set(completedMatches.map(m => m.adminStatus))]);
      for (const m of completedMatches) {
        if (!m.homeTeam || !m.awayTeam) continue;
        matchCountByTeam.set(m.homeTeam, (matchCountByTeam.get(m.homeTeam) ?? 0) + 1);
        matchCountByTeam.set(m.awayTeam, (matchCountByTeam.get(m.awayTeam) ?? 0) + 1);
        totalMatches++;
      }
    } catch (err) {
      console.warn("[recalc] failed to fetch from admin, falling back to local DB:", err);
    }
  }

  // Fallback: read from local TournamentMatch if admin fetch failed or no tournament found
  if (matchCountByTeam.size === 0) {
    const allMatches = await prisma.tournamentMatch.findMany({
      where: { status: { in: ["Completed", "TechLoss"] } },
      select: { homeTeam: true, awayTeam: true },
    });
    for (const m of allMatches) {
      matchCountByTeam.set(m.homeTeam, (matchCountByTeam.get(m.homeTeam) ?? 0) + 1);
      matchCountByTeam.set(m.awayTeam, (matchCountByTeam.get(m.awayTeam) ?? 0) + 1);
    }
    totalMatches = allMatches.length;
    console.log("[recalc] fallback to local DB, totalMatches:", totalMatches);
  }

  console.log("[recalc] teamCounts:", JSON.stringify(Object.fromEntries(matchCountByTeam)));

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

  console.log("[recalc] playerCounts:", JSON.stringify(Object.fromEntries(playerNewCount)));

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

  return { totalMatches, playersUpdated: updated };
}
