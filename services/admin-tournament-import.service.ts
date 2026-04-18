import { prisma } from "@/lib/prisma";
import {
  adminLogin,
  fetchTournaments,
  fetchAllParticipants,
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

  // Upsert AdminTournament
  const tournament = await prisma.adminTournament.upsert({
    where: { externalId: String(externalTournamentId) },
    create: {
      externalId: String(externalTournamentId),
      name: tournamentInfo.name,
      status: tournamentInfo.status,
      startDate: tournamentInfo.startDate ? new Date(tournamentInfo.startDate) : null,
      endDate: tournamentInfo.endDate ? new Date(tournamentInfo.endDate) : null,
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
