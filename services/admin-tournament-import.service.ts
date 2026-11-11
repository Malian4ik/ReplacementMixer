import { prisma } from "@/lib/prisma";
import { isImportedQueueEntry } from "@/lib/pool-order";
import { recalculateMatchStats } from "./match-stats.service";
import {
  adminLogin,
  fetchTournaments,
  fetchAllParticipants,
  fetchParticipantStatuses,
  fetchWaitingList,
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

  if (participants.length === 0) {
    await prisma.adminTournamentSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "Failed",
        finishedAt: new Date(),
        errorLog: "Источник вернул пустой список участников; существующие данные сохранены",
      },
    });
    throw new Error("Источник вернул пустой список участников; импорт отменён без изменения существующих данных");
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];
  const claimedPlayerIds = new Set<string>();

  for (const p of participants) {
    if (!p.nick) {
      failed++;
      errors.push(`Participant with empty nick skipped`);
      continue;
    }

    try {
      const existingByNick = await prisma.player.findUnique({ where: { nick: p.nick } });
      const discordOwner = p.discordId
        ? await prisma.player.findUnique({ where: { discordId: p.discordId } })
        : null;

      // A Discord account identifies a renamed player only while it has not
      // already been claimed by another participant in this import. Duplicate
      // Discord values in the source must not collapse two players into one.
      const canMatchByDiscord = discordOwner && !claimedPlayerIds.has(discordOwner.id);
      const existing = existingByNick ?? (canMatchByDiscord ? discordOwner : null);
      const hasDiscordConflict = Boolean(
        p.discordId && discordOwner && discordOwner.id !== existing?.id
      );
      const playedBefore = existing != null;

      // If tournamentStatus contains "disqualif" → mark as disqualified on our site
      const isDisq = /disqualif/i.test(p.tournamentStatus ?? "");

      const createData = {
          nick: p.nick,
          mmr: p.mmr ?? 0,
          stake: p.bidSize ?? 0,
          mainRole: p.mainRole ?? 1,
          flexRole: p.flexRole ?? null,
          wallet: p.wallet ?? null,
          telegramId: p.telegramId ?? null,
          discordId: hasDiscordConflict ? null : (p.discordId ?? null),
          hasPlayedBefore: false,
          adminParticipationCount: 1,
          lastImportedTournamentName: tournamentInfo.name,
          lastSyncedAt: new Date(),
          isDisqualified: isDisq,
          isActiveInDatabase: !isDisq,
      };
      const updateData = {
          ...(existing?.nick !== p.nick ? { nick: p.nick } : {}),
          ...(p.mmr != null ? { mmr: p.mmr } : {}),
          ...(p.bidSize != null ? { stake: p.bidSize } : {}),
          ...(p.mainRole != null ? { mainRole: p.mainRole } : {}),
          ...(p.flexRole != null ? { flexRole: p.flexRole } : {}),
          ...(p.wallet ? { wallet: p.wallet } : {}),
          ...(p.telegramId ? { telegramId: p.telegramId } : {}),
          ...(p.discordId && !hasDiscordConflict ? { discordId: p.discordId } : {}),
          ...(p.steamAccountId ? { steamAccountId: p.steamAccountId } : {}),
          hasPlayedBefore: playedBefore,
          adminParticipationCount: { increment: 1 },
          lastImportedTournamentName: tournamentInfo.name,
          lastSyncedAt: new Date(),
          ...(isDisq ? { isDisqualified: true, isActiveInDatabase: false } : {}),
      };
      const player = existing
        ? await prisma.player.update({ where: { id: existing.id }, data: updateData })
        : await prisma.player.create({ data: createData });
      claimedPlayerIds.add(player.id);

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
  externalTournamentId: string,
  localTournamentId?: string
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
    // Pass tournament name so we can filter only teams from this tournament
    const adminTournament = await prisma.adminTournament.findUnique({
      where: { externalId: String(externalTournamentId) },
      select: { name: true },
    });
    const teamInfos = await fetchTournamentTeams(externalTournamentId, adminTournament?.name);

    if (teamInfos.length === 0) {
      return {
        created: 0, updated: 0, failed: 0, total: 0,
        errors: ["Поле «команда» не найдено у участников, и ни один из разделов /admin/tournaments/team/, /admin/tournaments/tournamentteam/ и аналогов недоступен. Проверьте URL в Django-админке."],
      };
    }

    // Build uuid→nick map from participant list pages (needed for team detail scraping)
    const uuidToNick = await buildParticipantUuidNickMap(externalTournamentId);
    const nickSet = new Set(uuidToNick.values());

    for (const info of teamInfos) {
      // __idx_ prefix means no change-link was found — skip member fetch, create empty team
      const nicks = info.id.startsWith("__idx_")
        ? []
        : await fetchTeamMemberNicks(info.id, uuidToNick, info.modelSlug);
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

      const playerData = {
        player1Id: ids[0],
        player2Id: ids[1],
        player3Id: ids[2],
        player4Id: ids[3],
        player5Id: ids[4],
      };

      const existing = await prisma.team.findFirst({ where: { name: teamName } });
      if (existing) {
        await prisma.team.update({ where: { id: existing.id }, data: playerData });
        updated++;
      } else {
        await prisma.team.create({ data: { name: teamName, ...playerData } });
        created++;
      }
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

export interface PoolSyncResult {
  added: number;
  updated: number;
  notFound: number;
  errors: string[];
}

export async function syncPoolFromAdminWaitingList(
  externalTournamentId: string,
  localTournamentId?: string
): Promise<PoolSyncResult> {
  await adminLogin();
  const waitingList = await fetchWaitingList(externalTournamentId);

  if (waitingList.length === 0) {
    throw new Error("Источник вернул пустой список ожидания; текущий пул оставлен без изменений");
  }

  const positionsByNick = new Map<string, number | null>();
  for (const item of waitingList) {
    if (item.nick && !positionsByNick.has(item.nick)) {
      positionsByNick.set(item.nick, item.queuePosition ?? null);
    }
  }

  return prisma.$transaction(async (tx) => {
    const players = await tx.player.findMany({
      where: { nick: { in: [...positionsByNick.keys()] } },
      select: { id: true, nick: true },
    });
    const notFound = positionsByNick.size - players.length;
    if (players.length === 0) {
      throw new Error("Игроки из списка ожидания не найдены в базе замен");
    }

    const entries = await tx.substitutionPoolEntry.findMany({
      where: { status: "Active" },
      orderBy: [{ joinTime: "asc" }, { id: "asc" }],
    });
    const manualPlayers = new Set(
      entries.filter((entry) => !isImportedQueueEntry(entry)).map((entry) => entry.playerId)
    );
    const importedByPlayer = new Map<string, (typeof entries)[number]>();
    for (const entry of entries) {
      if (isImportedQueueEntry(entry) && !importedByPlayer.has(entry.playerId)) {
        importedByPlayer.set(entry.playerId, entry);
      }
    }

    let added = 0;
    let updated = 0;
    const retainedIds = entries
      .filter((entry) => entry.source === "admin_queue" && !isImportedQueueEntry(entry))
      .map((entry) => entry.id);
    for (const player of players) {
      if (manualPlayers.has(player.id)) continue;
      const adminQueuePosition = positionsByNick.get(player.nick) ?? null;
      const existing = importedByPlayer.get(player.id);
      if (existing) {
        retainedIds.push(existing.id);
        if (existing.adminQueuePosition !== adminQueuePosition) {
          await tx.substitutionPoolEntry.update({
            where: { id: existing.id },
            data: { adminQueuePosition },
          });
          updated++;
        }
      } else {
        const created = await tx.substitutionPoolEntry.create({
          data: { playerId: player.id, source: "admin_queue", adminQueuePosition, status: "Active" },
        });
        retainedIds.push(created.id);
        added++;
      }
    }

    await tx.substitutionPoolEntry.updateMany({
      where: { status: "Active", source: "admin_queue", id: { notIn: retainedIds } },
      data: { status: "Inactive" },
    });

    return { added, updated, notFound, errors: [] };
  }, { timeout: 30_000 });
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

  // Sync completed matches from admin: mark/create them locally before any deleteMany
  const completedInAdmin = matches.filter(m => {
    const s = (m.adminStatus ?? "").toLowerCase();
    return s && s !== "pending" && s !== "scheduled" && s !== "запланирован";
  });
  console.log(
    "[schedule-import] non-pending in admin:", completedInAdmin.length,
    "statuses:", [...new Set(completedInAdmin.map(m => m.adminStatus))]
  );
  for (const m of completedInAdmin) {
    if (!m.homeTeam || !m.awayTeam) continue;
    const existing = await prisma.tournamentMatch.findFirst({
      where: { homeTeam: m.homeTeam, awayTeam: m.awayTeam },
    });
    if (existing) {
      if (!["Completed", "TechLoss", "Postponed"].includes(existing.status)) {
        await prisma.tournamentMatch.update({
          where: { id: existing.id },
          data: { status: "Completed", updatedAt: new Date() },
        });
      }
    } else if (m.scheduledAt) {
      await prisma.tournamentMatch.create({
        data: {
          round: m.round || 1,
          slot: 999,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          scheduledAt: m.scheduledAt,
          endsAt: m.endsAt ?? new Date(m.scheduledAt.getTime() + MATCH_MS),
          status: "Completed",
        },
      });
    }
  }

  if (clearExisting) {
    // Only delete non-completed matches when clearing
    await prisma.tournamentMatch.deleteMany({ where: { status: { not: "Completed" } } });
  }

  // Only import matches with "Pending" status from admin (skip completed/other)
  const pendingMatches = matches.filter(m => {
    const s = (m.adminStatus ?? "").toLowerCase();
    return !s || s === "pending" || s === "scheduled" || s === "запланирован";
  });

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < pendingMatches.length; i++) {
    const m = pendingMatches[i];
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

    // Skip if this exact match already exists in DB (avoid duplicates on re-import)
    const existing = await prisma.tournamentMatch.findFirst({
      where: { homeTeam: m.homeTeam, awayTeam: m.awayTeam, scheduledAt },
    });
    if (existing) {
      skipped++;
      continue;
    }

    // Also skip if already completed in our DB
    const completedVersion = await prisma.tournamentMatch.findFirst({
      where: { homeTeam: m.homeTeam, awayTeam: m.awayTeam, status: "Completed" },
    });
    if (completedVersion) {
      skipped++;
      continue;
    }

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

  await recalculateMatchStats().catch(() => {});

  return { imported, skipped, errors };
}
