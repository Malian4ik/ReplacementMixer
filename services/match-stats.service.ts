import { prisma } from "@/lib/prisma";
import { adminLogin, fetchTournamentScheduleData, type AdminMatchInfo } from "./admin-source.service";

export async function recalculateMatchStats(): Promise<{ totalMatches: number; playersUpdated: number }> {
  const matchCountByTeam = new Map<string, number>();

  const adminTournament = await prisma.adminTournament.findFirst({
    orderBy: { lastSyncedAt: "desc" },
  });
  const cutoff = adminTournament?.startDate ?? new Date("2026-05-01T00:00:00Z");

  const allTeams = await prisma.team.findMany({
    select: { name: true, player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
  });

  let totalMatches = 0;
  // Lifted outside try so substitution logic can reuse admin data instead of querying local DB
  let adminCompletedMatches: AdminMatchInfo[] = [];

  // Primary: admin API filtered by tournament ID (tournament__id__exact=N).
  // This is the only source that can correctly isolate current-tournament matches.
  if (adminTournament) {
    try {
      await adminLogin();
      const matches = await fetchTournamentScheduleData(adminTournament.externalId);
      adminCompletedMatches = matches.filter(m => {
        const s = (m.adminStatus ?? "").toLowerCase();
        // Include: Complete, Completed, завершён — exclude only clearly pending/future
        if (!s || s === "pending" || s === "scheduled" || s === "запланирован") return false;
        if (!m.scheduledAt || m.scheduledAt < cutoff) return false;
        return true;
      });
      console.log("[recalc] admin matches for tournament", adminTournament.externalId, ":", matches.length,
        "done:", adminCompletedMatches.length, "statuses:", [...new Set(adminCompletedMatches.map(m => m.adminStatus))]);
      for (const m of adminCompletedMatches) {
        if (!m.homeTeam || !m.awayTeam) continue;
        matchCountByTeam.set(m.homeTeam, (matchCountByTeam.get(m.homeTeam) ?? 0) + 1);
        matchCountByTeam.set(m.awayTeam, (matchCountByTeam.get(m.awayTeam) ?? 0) + 1);
        totalMatches++;
      }
    } catch (err) {
      console.warn("[recalc] admin fetch failed, falling back to local DB:", err);
    }
  }

  // Fallback to local DB only if admin fetch returned nothing
  if (matchCountByTeam.size === 0) {
    const allMatches = await prisma.tournamentMatch.findMany({
      where: { status: { in: ["Completed", "TechLoss"] }, scheduledAt: { gte: cutoff } },
      select: { homeTeam: true, awayTeam: true },
    });
    for (const m of allMatches) {
      matchCountByTeam.set(m.homeTeam, (matchCountByTeam.get(m.homeTeam) ?? 0) + 1);
      matchCountByTeam.set(m.awayTeam, (matchCountByTeam.get(m.awayTeam) ?? 0) + 1);
    }
    totalMatches = allMatches.length;
    console.log("[recalc] local DB fallback, matches:", totalMatches);
  }

  console.log("[recalc] teamCounts:", JSON.stringify(Object.fromEntries(matchCountByTeam)));

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

  // Restore matchesPlayed for players substituted OUT — count team matches before their substitution
  const subLogs = await prisma.matchSubstitutionLog.findMany({
    where: { replacedPlayerId: { not: null }, teamName: { not: null } },
    select: { replacedPlayerId: true, teamName: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  // Use earliest substitution per player (first time they were replaced)
  const substitutedData = new Map<string, { teamName: string; timestamp: Date }>();
  for (const log of subLogs) {
    if (!log.replacedPlayerId || !log.teamName) continue;
    if (!substitutedData.has(log.replacedPlayerId)) {
      substitutedData.set(log.replacedPlayerId, { teamName: log.teamName, timestamp: log.timestamp });
    }
  }

  for (const [playerId, { teamName, timestamp }] of substitutedData.entries()) {
    if (playerNewCount.has(playerId)) continue; // already counted via current team roster
    let count: number;
    if (adminCompletedMatches.length > 0) {
      // Use admin API data — more accurate than local DB (local DB may be incomplete)
      count = adminCompletedMatches.filter(m =>
        (m.homeTeam === teamName || m.awayTeam === teamName) &&
        m.scheduledAt !== null &&
        m.scheduledAt < timestamp
      ).length;
    } else {
      count = await prisma.tournamentMatch.count({
        where: {
          OR: [{ homeTeam: teamName }, { awayTeam: teamName }],
          scheduledAt: { gte: cutoff, lt: timestamp },
          status: { in: ["Completed", "TechLoss", "Active"] },
        },
      });
    }
    if (count > 0) {
      playerNewCount.set(playerId, count);
      await prisma.player.updateMany({ where: { id: playerId }, data: { matchesPlayed: count } });
      updated++;
    }
  }

  const updatedIds = [...playerNewCount.keys()];
  const substitutedIds = new Set(substitutedData.keys());

  const zeroed = await prisma.player.updateMany({
    where: {
      matchesPlayed: { gt: 0 },
      id: { notIn: updatedIds },
      NOT: { id: { in: [...substitutedIds] } },
    },
    data: { matchesPlayed: 0 },
  });
  updated += zeroed.count;

  // Cap nightMatches to matchesPlayed — overcounting from non-idempotent cron can't
  // produce more night games than total games played.
  const overcredited = await prisma.$queryRaw<{ id: string; matchesPlayed: number }[]>`
    SELECT id, "matchesPlayed" FROM "Player"
    WHERE "nightMatches" > "matchesPlayed" AND "isActiveInDatabase" = 1
  `;
  for (const p of overcredited) {
    await prisma.player.update({
      where: { id: p.id },
      data: { nightMatches: p.matchesPlayed },
    });
    updated++;
  }
  if (overcredited.length > 0) {
    console.log(`[recalc] capped nightMatches for ${overcredited.length} players`);
  }

  return { totalMatches, playersUpdated: updated };
}

/** Debug: show why a specific player (by nick) has the matchesPlayed they do. */
export async function debugPlayerStats(nick: string) {
  const adminTournament = await prisma.adminTournament.findFirst({ orderBy: { lastSyncedAt: "desc" } });
  const cutoff = adminTournament?.startDate ?? new Date("2026-05-01T00:00:00Z");

  const player = await prisma.player.findFirst({ where: { nick } });
  if (!player) return { error: "player not found", nick };

  const teamsContaining = await prisma.team.findMany({
    where: {
      OR: [
        { player1Id: player.id }, { player2Id: player.id }, { player3Id: player.id },
        { player4Id: player.id }, { player5Id: player.id },
      ],
    },
  });

  const subLogs = await prisma.matchSubstitutionLog.findMany({
    where: { replacedPlayerId: player.id },
    orderBy: { timestamp: "asc" },
  });

  const localMatchCounts: Record<string, number> = {};
  for (const team of teamsContaining) {
    localMatchCounts[team.name] = await prisma.tournamentMatch.count({
      where: {
        OR: [{ homeTeam: team.name }, { awayTeam: team.name }],
        scheduledAt: { gte: cutoff },
        status: { in: ["Completed", "TechLoss"] },
      },
    });
  }

  return {
    nick,
    playerId: player.id,
    currentMatchesPlayed: player.matchesPlayed,
    nightMatches: player.nightMatches,
    isActiveInDatabase: player.isActiveInDatabase,
    currentTeams: teamsContaining.map(t => t.name),
    localMatchCountsPerTeam: localMatchCounts,
    substitutionLogs: subLogs.map(s => ({ teamName: s.teamName, timestamp: s.timestamp })),
    adminTournament: adminTournament ? { externalId: adminTournament.externalId, name: adminTournament.name, cutoff } : null,
  };
}

/** Начислить +1 nightMatches игрокам обеих команд если матч ночной (00:00–06:59 МСК по scheduledAt).
 *  Идемпотентно: повторный вызов на уже зачтённый матч ничего не делает.
 *  Авто-создаёт колонку nightCredited при первом вызове — ничего руками делать не нужно. */
export async function creditNightMatches(
  homeTeam: string,
  awayTeam: string,
  scheduledAt: Date,
): Promise<void> {
  // Авто-миграция: добавить колонку если её ещё нет
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "TournamentMatch" ADD COLUMN "nightCredited" INTEGER NOT NULL DEFAULT 0`
    );
  } catch { /* уже существует — ок */ }

  // Ночной диапазон: 00:00–06:59 МСК (UTC+3)
  const mskHour = (scheduledAt.getUTCHours() + 3) % 24;
  if (mskHour >= 7) return;

  // Атомарно маркируем запись как зачтённую; если записи нет или уже зачтена — ничего не делаем.
  // Это предотвращает дублирование при повторных вызовах (многократные запуски крона).
  const dateStr = scheduledAt.toISOString().slice(0, 10); // YYYY-MM-DD
  const marked = await prisma.$executeRawUnsafe(
    `UPDATE "TournamentMatch" SET "nightCredited" = 1
     WHERE id = (
       SELECT id FROM "TournamentMatch"
       WHERE "homeTeam" = ? AND "awayTeam" = ? AND "nightCredited" = 0
         AND DATE("scheduledAt") = DATE(?)
       LIMIT 1
     )`,
    homeTeam, awayTeam, dateStr,
  );
  if (marked === 0) return; // нет записи или уже зачтён

  // Актуальный состав обеих команд на момент завершения
  const teams = await prisma.team.findMany({
    where: { name: { in: [homeTeam, awayTeam] } },
    select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
  });
  const playerIds = teams.flatMap(t =>
    [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[]
  );
  if (!playerIds.length) return;

  await prisma.player.updateMany({
    where: { id: { in: playerIds } },
    data: { nightMatches: { increment: 1 } },
  });
}
