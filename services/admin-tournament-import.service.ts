import { prisma } from "@/lib/prisma";
import {
  adminLogin,
  fetchTournaments,
  fetchAllParticipants,
  fetchParticipantStatuses,
  buildParticipantUuidNickMap,
  fetchTournamentTeams,
  fetchTeamMemberNicks,
  fetchTournamentScheduleData,
  type AdminTournamentInfo,
  type AdminParticipant,
} from "./admin-source.service";

export async function getOrFetchTournamentList(): Promise<AdminTournamentInfo[]> {
  await adminLogin();
  return fetchTournaments();
}

export interface ImportResult {
  syncRunId: string;
  created: number;
  updated: number;
  failed: number;
  total: number;
  errors: string[];
}

export async function importTournamentParticipants(
  externalTournamentId: string
): Promise<ImportResult> {
  await adminLogin();

  const tournaments = await fetchTournaments();
  const tournamentInfo = tournaments.find(
    (t) => String(t.id) === String(externalTournamentId)
  );
  if (!tournamentInfo) throw new Error(`Tournament ${externalTournamentId} not found in source`);

  const parseDate = (s?: string): Date | null => {
    if (!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  // Upsert AdminTournament
  const tournament = await prisma.adminTournament.upsert({
    where: { externalId: String(externalTournamentId) },
    create: {
      externalId: String(externalTournamentId),
      name: tournamentInfo.name,
      status: tournamentInfo.status,
      startDate: parseDate(tournamentInfo.startDate),
      endDate: parseDate(tournamentInfo.endDate),
    },
    update: {
      name: tournamentInfo.name,
      status: tournamentInfo.status,
      lastSyncedAt: new Date(),
    },
  });

  // Create sync run
  const syncRun = await prisma.adminTournamentSyncRun.create({
    data: { tournamentId: tournament.id, status: "Running" },
  });

  const participants = await fetchAllParticipants(externalTournamentId);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const p of participants) {
    if (!p.nick) {
      failed++;
      errors.push(`Participant with empty nick skipped`);
      continue;
    }

    try {
      // Find existing player by nick
      const existing = await prisma.player.findUnique({ where: { nick: p.nick } });
      const playedBefore = existing != null;

      // If tournamentStatus contains "disqualif" → mark as disqualified on our site
      const isDisq = /disqualif/i.test(p.tournamentStatus ?? "");

      // Upsert player
      const player = await prisma.player.upsert({
        where: { nick: p.nick },
        create: {
          nick: p.nick,
          mmr: p.mmr ?? 0,
          stake: p.bidSize ?? 0,
          mainRole: p.mainRole ?? 1,
          wallet: p.wallet ?? null,
          telegramId: p.telegramId ?? null,
          discordId: p.discordId ?? null,
          hasPlayedBefore: false,
          adminParticipationCount: 1,
          lastImportedTournamentName: tournamentInfo.name,
          lastSyncedAt: new Date(),
          isDisqualified: isDisq,
          isActiveInDatabase: !isDisq,
        },
        update: {
          ...(p.mmr != null ? { mmr: p.mmr } : {}),
          ...(p.bidSize != null ? { stake: p.bidSize } : {}),
          ...(p.mainRole != null ? { mainRole: p.mainRole } : {}),
          ...(p.wallet ? { wallet: p.wallet } : {}),
          ...(p.telegramId ? { telegramId: p.telegramId } : {}),
          ...(p.discordId ? { discordId: p.discordId } : {}),
          hasPlayedBefore: playedBefore,
          adminParticipationCount: { increment: 1 },
          lastImportedTournamentName: tournamentInfo.name,
          lastSyncedAt: new Date(),
          ...(isDisq ? { isDisqualified: true, isActiveInDatabase: false } : {}),
        },
      });

      // Upsert participation record
      await prisma.playerTournamentParticipation.upsert({
        where: { playerId_tournamentId: { playerId: player.id, tournamentId: tournament.id } },
        create: {
          playerId: player.id,
          tournamentId: tournament.id,
          participationCount: 1,
          playedBefore,
          tournamentStatus: p.tournamentStatus ?? null,
          queuePosition: p.queuePosition ?? null,
          qualifyRating: p.qualifyRating ?? null,
          bidSize: p.bidSize ?? null,
          balance: p.balance ?? null,
        },
        update: {
          participationCount: { increment: 1 },
          playedBefore,
          tournamentStatus: p.tournamentStatus ?? null,
          queuePosition: p.queuePosition ?? null,
          qualifyRating: p.qualifyRating ?? null,
          bidSize: p.bidSize ?? null,
          balance: p.balance ?? null,
        },
      });

      if (existing) updated++;
      else created++;
    } catch (err: unknown) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${p.nick}: ${msg}`);
    }
  }

  // Finalize sync run
  await prisma.adminTournamentSyncRun.update({
    where: { id: syncRun.id },
    data: {
      status: "Completed",
      finishedAt: new Date(),
      created,
      updated,
      failed,
      total: participants.length,
      errorLog: errors.length > 0 ? errors.slice(0, 20).join("\n") : null,
    },
  });

  await prisma.adminTournament.update({
    where: { id: tournament.id },
    data: { participantCount: created + updated, lastSyncedAt: new Date() },
  });

  return { syncRunId: syncRun.id, created, updated, failed, total: participants.length, errors };
}

export interface TeamImportResult {
  created: number;
  updated: number;
  failed: number;
  total: number;
  errors: string[];
}

export async function importTournamentTeams(
  externalTournamentId: string
): Promise<TeamImportResult> {
  await adminLogin();

  // Fetch all participants — they may carry a `team` field from the list view
  const participants = await fetchAllParticipants(externalTournamentId);

  // Build uuid→nick map (needed for team detail page scraping fallback)
  // Note: uuid is not carried through fetchAllParticipants; we build from raw list via a separate call.
  // For now: first try grouping by participant.team field
  const teamMap = new Map<string, string[]>(); // teamName → [nick, ...]

  for (const p of participants) {
    if (!p.team || !p.nick) continue;
    if (!teamMap.has(p.team)) teamMap.set(p.team, []);
    teamMap.get(p.team)!.push(p.nick);
  }

  if (teamMap.size === 0) {
    // Fallback: try scraping from /admin/tournaments/team/
    const teamInfos = await fetchTournamentTeams(externalTournamentId);

    if (teamInfos.length === 0) {
      return {
        created: 0, updated: 0, failed: 0, total: 0,
        errors: ["Поле «команда» не найдено у участников, и раздел /admin/tournaments/team/ недоступен. Команды нужно создать вручную."],
      };
    }

    // Build uuid→nick map from participant list pages (needed for team detail scraping)
    const uuidToNick = await buildParticipantUuidNickMap(externalTournamentId);
    const nickSet = new Set(uuidToNick.values());

    for (const info of teamInfos) {
      const nicks = await fetchTeamMemberNicks(info.id, uuidToNick);
      const known = nicks.filter(n => nickSet.has(n));
      teamMap.set(info.name, known);
    }
  }

  let created = 0, updated = 0, failed = 0;
  const errors: string[] = [];

  for (const [teamName, nicks] of teamMap) {
    try {
      const players = await prisma.player.findMany({ where: { nick: { in: nicks } } });
      const playerMap = new Map(players.map(p => [p.nick, p.id]));
      const ids = nicks.slice(0, 5).map(n => playerMap.get(n) ?? null);
      while (ids.length < 5) ids.push(null);

      const existing = await prisma.team.findUnique({ where: { name: teamName } });
      await prisma.team.upsert({
        where: { name: teamName },
        create: {
          name: teamName,
          player1Id: ids[0],
          player2Id: ids[1],
          player3Id: ids[2],
          player4Id: ids[3],
          player5Id: ids[4],
        },
        update: {
          player1Id: ids[0],
          player2Id: ids[1],
          player3Id: ids[2],
          player4Id: ids[3],
          player5Id: ids[4],
        },
      });

      if (existing) updated++;
      else created++;
    } catch (err: unknown) {
      failed++;
      errors.push(`${teamName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { created, updated, failed, total: teamMap.size, errors };
}

export interface DisqualifiedSyncResult {
  found: number;
  marked: number;
  alreadyMarked: number;
  errors: string[];
}

/** Sync disqualified status from the external admin without doing a full import.
 *  Only reads participant list pages — fast (~5s for 100 participants). */
export async function syncDisqualifiedPlayers(
  externalTournamentId: string
): Promise<DisqualifiedSyncResult> {
  await adminLogin();

  const statuses = await fetchParticipantStatuses(externalTournamentId);
  const disqualified = statuses.filter((p) => /disqualif/i.test(p.tournamentStatus));

  let marked = 0;
  let alreadyMarked = 0;
  const errors: string[] = [];

  for (const p of disqualified) {
    try {
      const player = await prisma.player.findUnique({
        where: { nick: p.nick },
        select: { id: true, isDisqualified: true },
      });
      if (!player) {
        errors.push(`${p.nick}: игрок не найден в базе — сначала импортируйте участников`);
        continue;
      }
      if (player.isDisqualified) {
        alreadyMarked++;
        continue;
      }
      await prisma.player.update({
        where: { id: player.id },
        data: { isDisqualified: true, isActiveInDatabase: false },
      });
      marked++;
    } catch (err: unknown) {
      errors.push(`${p.nick}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { found: disqualified.length, marked, alreadyMarked, errors };
}

export interface ScheduleImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

const MATCH_MS = 1.5 * 60 * 60 * 1000;

export async function importTournamentSchedule(
  externalTournamentId: string,
  clearExisting = false
): Promise<ScheduleImportResult> {
  await adminLogin();

  const matches = await fetchTournamentScheduleData(externalTournamentId);
  if (matches.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: ["Расписание не найдено в admin. Проверьте URL /admin/tournaments/match/ или /admin/tournaments/game/"],
    };
  }

  if (clearExisting) {
    await prisma.tournamentMatch.deleteMany({});
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (!m.homeTeam || !m.awayTeam) {
      skipped++;
      continue;
    }

    const scheduledAt = m.scheduledAt;
    if (!scheduledAt) {
      errors.push(`Матч ${m.homeTeam} vs ${m.awayTeam}: не удалось распарсить время начала`);
      skipped++;
      continue;
    }

    const endsAt = m.endsAt ?? new Date(scheduledAt.getTime() + MATCH_MS);

    try {
      await prisma.tournamentMatch.create({
        data: {
          round: m.round || 1,
          slot: i,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          scheduledAt,
          endsAt,
        },
      });
      imported++;
    } catch (err: unknown) {
      errors.push(`${m.homeTeam} vs ${m.awayTeam}: ${err instanceof Error ? err.message : String(err)}`);
      skipped++;
    }
  }

  return { imported, skipped, errors };
}
