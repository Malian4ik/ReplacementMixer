import { prisma } from "@/lib/prisma";
import {
  adminLogin,
  fetchTournamentScheduleData,
  fetchPlayerGameCounts,
  buildParticipantUuidNickMap,
  type AdminMatchInfo,
} from "./admin-source.service";

export async function recalculateMatchStats(): Promise<{ totalMatches: number; playersUpdated: number }> {
  const adminTournament = await prisma.adminTournament.findFirst({
    orderBy: { lastSyncedAt: "desc" },
  });
  const cutoff = adminTournament?.startDate ?? new Date("2026-05-01T00:00:00Z");

  let totalMatches = 0;
  let adminCompletedMatches: AdminMatchInfo[] = [];
  const matchCountByTeam = new Map<string, number>();

  if (adminTournament) {
    try {
      await adminLogin();
      const matches = await fetchTournamentScheduleData(adminTournament.externalId);
      let skippedStatus = 0, skippedDate = 0;
      adminCompletedMatches = matches.filter(m => {
        const s = (m.adminStatus ?? "").toLowerCase();
        // Only exclude explicitly pending/scheduled — empty status may still be a played game
        if (s === "pending" || s === "scheduled" || s === "запланирован") { skippedStatus++; return false; }
        if (!m.scheduledAt || m.scheduledAt < cutoff) { skippedDate++; return false; }
        return true;
      });
      console.log("[recalc] admin matches:", matches.length, "done:", adminCompletedMatches.length,
        "skipped(status):", skippedStatus, "skipped(date):", skippedDate,
        "statuses:", [...new Set(matches.map(m => `"${m.adminStatus ?? ""}"`))].join(", "));
      for (const m of adminCompletedMatches) {
        if (!m.homeTeam || !m.awayTeam) continue;
        matchCountByTeam.set(m.homeTeam, (matchCountByTeam.get(m.homeTeam) ?? 0) + 1);
        matchCountByTeam.set(m.awayTeam, (matchCountByTeam.get(m.awayTeam) ?? 0) + 1);
        totalMatches++;
      }
    } catch (err) {
      console.warn("[recalc] admin fetch failed:", err);
    }
  }

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

  // ── Try to get exact per-player counts from admin gameuserstats ──────────────
  // This is the most accurate source: each row = one player in one game.
  let playerNewCount = new Map<string, number>();
  let usedAdminPerPlayer = false;

  if (adminTournament) {
    try {
      // Build set of game UUIDs from completed matches (extracted from admin change links)
      const validGameIds = new Set(adminCompletedMatches.filter(m => m.id).map(m => m.id!));
      // Build 8-char prefix → full UUID map (field-game in gameuserstats shows "Game {prefix}-…")
      const gamePrefixMap = new Map<string, string>();
      for (const uuid of validGameIds) gamePrefixMap.set(uuid.slice(0, 8), uuid);
      console.log("[recalc] validGameIds:", validGameIds.size, "of", adminCompletedMatches.length, "prefixMap:", gamePrefixMap.size);
      const { byNick, byParticipantUuid } = await fetchPlayerGameCounts(adminTournament.externalId, validGameIds, gamePrefixMap);

      // Minimum threshold: if fewer than 50 players found, data is incomplete — fall back to team-based
      const MIN_PLAYERS_THRESHOLD = 50;

      if (byParticipantUuid.size > 0) {
        const uuidToNick = await buildParticipantUuidNickMap(adminTournament.externalId);
        const players = await prisma.player.findMany({ select: { id: true, nick: true } });
        const nickToId = new Map(players.map(p => [p.nick.toLowerCase(), p.id]));
        for (const [uuid, count] of byParticipantUuid) {
          const nick = uuidToNick.get(uuid);
          if (!nick) continue;
          const pid = nickToId.get(nick.toLowerCase());
          if (pid) playerNewCount.set(pid, (playerNewCount.get(pid) ?? 0) + count);
        }
        if (playerNewCount.size >= MIN_PLAYERS_THRESHOLD) {
          usedAdminPerPlayer = true;
          console.log("[recalc] per-player from gameuserstats (by UUID):", playerNewCount.size, "players");
        } else {
          console.warn("[recalc] gameuserstats (by UUID) only found", playerNewCount.size, "players — threshold not met, falling back");
          playerNewCount = new Map();
        }
      } else if (byNick.size > 0) {
        const players = await prisma.player.findMany({ select: { id: true, nick: true } });
        const nickToId = new Map(players.map(p => [p.nick.toLowerCase(), p.id]));
        for (const [nick, count] of byNick) {
          const pid = nickToId.get(nick.toLowerCase());
          if (pid) playerNewCount.set(pid, count);
        }
        if (playerNewCount.size >= MIN_PLAYERS_THRESHOLD) {
          usedAdminPerPlayer = true;
          console.log("[recalc] per-player from gameuserstats (by nick):", playerNewCount.size, "players");
        } else {
          console.warn("[recalc] gameuserstats (by nick) only found", playerNewCount.size, "players — threshold not met, falling back");
          playerNewCount = new Map();
        }
      }
    } catch (err) {
      console.warn("[recalc] fetchPlayerGameCounts failed:", err);
    }
  }

  // ── Fallback: team-based counting with join-date correction ──────────────────
  if (!usedAdminPerPlayer) {
    console.log("[recalc] falling back to team-based counting");
    const allTeams = await prisma.team.findMany({
      select: { name: true, player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
    });
    const allPlayerRecords = await prisma.player.findMany({ select: { id: true, createdAt: true } });
    const playerJoinedAt = new Map(allPlayerRecords.map(p => [p.id, p.createdAt]));

    for (const team of allTeams) {
      const teamTotal = matchCountByTeam.get(team.name) ?? 0;
      if (teamTotal === 0) continue;
      for (const pid of [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id]) {
        if (!pid) continue;
        const joinedAt = playerJoinedAt.get(pid);
        let personalCount: number;
        if (joinedAt && joinedAt > cutoff && adminCompletedMatches.length > 0) {
          const dayStart = new Date(joinedAt);
          dayStart.setUTCHours(0, 0, 0, 0);
          personalCount = adminCompletedMatches.filter(m =>
            (m.homeTeam === team.name || m.awayTeam === team.name) &&
            m.scheduledAt !== null &&
            m.scheduledAt >= dayStart
          ).length;
        } else {
          personalCount = teamTotal;
        }
        playerNewCount.set(pid, Math.max(playerNewCount.get(pid) ?? 0, personalCount));
      }
    }
  }

  console.log("[recalc] playerCounts:", JSON.stringify(Object.fromEntries(playerNewCount)));

  let updated = 0;
  for (const [playerId, count] of playerNewCount.entries()) {
    const r = await prisma.player.updateMany({ where: { id: playerId }, data: { matchesPlayed: count } });
    updated += r.count;
  }

  // ── Substituted players (replaced from their team) ───────────────────────────
  if (!usedAdminPerPlayer) {
    const subLogs = await prisma.matchSubstitutionLog.findMany({
      where: { replacedPlayerId: { not: null }, teamName: { not: null }, timestamp: { gte: cutoff } },
      select: { replacedPlayerId: true, teamName: true, timestamp: true },
      orderBy: { timestamp: "asc" },
    });

    const allSubLogs = new Map<string, { teamName: string; timestamp: Date }[]>();
    for (const log of subLogs) {
      if (!log.replacedPlayerId || !log.teamName) continue;
      if (!allSubLogs.has(log.replacedPlayerId)) allSubLogs.set(log.replacedPlayerId, []);
      allSubLogs.get(log.replacedPlayerId)!.push({ teamName: log.teamName, timestamp: log.timestamp });
    }

    for (const [playerId, subs] of allSubLogs.entries()) {
      if (playerNewCount.has(playerId)) continue;
      let totalCount = 0;
      for (let i = 0; i < subs.length; i++) {
        const start = i === 0 ? cutoff : subs[i - 1].timestamp;
        const end = subs[i].timestamp;
        const { teamName } = subs[i];
        let count: number;
        if (adminCompletedMatches.length > 0) {
          count = adminCompletedMatches.filter(m =>
            (m.homeTeam === teamName || m.awayTeam === teamName) &&
            m.scheduledAt !== null &&
            m.scheduledAt >= start &&
            m.scheduledAt < end
          ).length;
        } else {
          count = await prisma.tournamentMatch.count({
            where: {
              OR: [{ homeTeam: teamName }, { awayTeam: teamName }],
              scheduledAt: { gte: start, lt: end },
              status: { in: ["Completed", "TechLoss", "Active"] },
            },
          });
        }
        totalCount += count;
      }
      if (totalCount > 0) {
        playerNewCount.set(playerId, totalCount);
        await prisma.player.updateMany({ where: { id: playerId }, data: { matchesPlayed: totalCount } });
        updated++;
      }
    }

    const substitutedIds = new Set(allSubLogs.keys());
    const updatedIds = [...playerNewCount.keys()];
    const zeroed = await prisma.player.updateMany({
      where: {
        matchesPlayed: { gt: 0 },
        id: { notIn: updatedIds },
        NOT: { id: { in: [...substitutedIds] } },
      },
      data: { matchesPlayed: 0 },
    });
    updated += zeroed.count;
  } else {
    // When using admin per-player data, zero out players not found in admin stats
    const updatedIds = [...playerNewCount.keys()];
    const zeroed = await prisma.player.updateMany({
      where: { matchesPlayed: { gt: 0 }, id: { notIn: updatedIds } },
      data: { matchesPlayed: 0 },
    });
    updated += zeroed.count;
  }

  // Cap nightMatches to matchesPlayed
  const overcredited = await prisma.$queryRaw<{ id: string; matchesPlayed: number }[]>`
    SELECT id, "matchesPlayed" FROM "Player"
    WHERE "nightMatches" > "matchesPlayed" AND "isActiveInDatabase" = 1
  `;
  for (const p of overcredited) {
    await prisma.player.update({ where: { id: p.id }, data: { nightMatches: p.matchesPlayed } });
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
    createdAt: player.createdAt,
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
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "TournamentMatch" ADD COLUMN "nightCredited" INTEGER NOT NULL DEFAULT 0`
    );
  } catch { /* already exists */ }

  const mskHour = (scheduledAt.getUTCHours() + 3) % 24;
  if (mskHour >= 7) return;

  const dateStr = scheduledAt.toISOString().slice(0, 10);
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
  if (marked === 0) return;

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
