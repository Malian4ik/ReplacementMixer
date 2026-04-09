import { prisma } from "@/lib/prisma";
import { AdminSourceClient } from "@/services/admin-source.service";
import type { ImportAdminTournamentResult } from "@/services/admin-source.types";

type MatchReason = "adminUserId" | "wallet" | "discord" | "fallback" | "created";
const IMPORT_CONCURRENCY = 6;

async function findExistingPlayer(params: {
  adminUserId: string;
  wallet: string | null;
  discordId: string | null;
  telegram: string | null;
  nickname: string;
}) {
  if (params.adminUserId) {
    const byAdminId = await prisma.player.findFirst({
      where: { adminUserId: params.adminUserId },
    });
    if (byAdminId) return { player: byAdminId, reason: "adminUserId" as const };
  }

  if (params.wallet) {
    const byWallet = await prisma.player.findFirst({
      where: { wallet: params.wallet },
    });
    if (byWallet) return { player: byWallet, reason: "wallet" as const };
  }

  if (params.discordId) {
    const byDiscord = await prisma.player.findFirst({
      where: { discordUserId: params.discordId },
    });
    if (byDiscord) return { player: byDiscord, reason: "discord" as const };
  }

  if (params.telegram) {
    const byTelegram = await prisma.player.findFirst({
      where: { telegramId: params.telegram },
    });
    if (byTelegram) return { player: byTelegram, reason: "fallback" as const };
  }

  const byNickname = await prisma.player.findFirst({
    where: { nick: params.nickname },
  });
  if (byNickname) return { player: byNickname, reason: "fallback" as const };

  return null;
}

export async function listAdminTournaments() {
  const client = new AdminSourceClient();
  return client.listTournaments();
}

export async function importAdminTournament(adminTournamentId: string): Promise<ImportAdminTournamentResult> {
  const client = new AdminSourceClient();
  const tournaments = await client.listTournaments();
  const tournamentSummary = tournaments.find((item) => item.adminTournamentId === adminTournamentId);
  if (!tournamentSummary) {
    throw new Error("ADMIN_TOURNAMENT_NOT_FOUND");
  }

  const tournament = await prisma.adminTournament.upsert({
    where: { adminTournamentId },
    update: {
      name: tournamentSummary.name,
      type: tournamentSummary.type,
      status: tournamentSummary.status,
      applicationTime: tournamentSummary.applicationTime ? new Date(tournamentSummary.applicationTime) : null,
      startTime: tournamentSummary.startTime ? new Date(tournamentSummary.startTime) : null,
      endTime: tournamentSummary.endTime ? new Date(tournamentSummary.endTime) : null,
      importedAt: new Date(),
    },
    create: {
      adminTournamentId,
      name: tournamentSummary.name,
      type: tournamentSummary.type,
      status: tournamentSummary.status,
      applicationTime: tournamentSummary.applicationTime ? new Date(tournamentSummary.applicationTime) : null,
      startTime: tournamentSummary.startTime ? new Date(tournamentSummary.startTime) : null,
      endTime: tournamentSummary.endTime ? new Date(tournamentSummary.endTime) : null,
      importedAt: new Date(),
    },
  });

  const syncRun = await prisma.adminTournamentSyncRun.create({
    data: {
      tournamentId: tournament.id,
      adminTournamentId,
      tournamentName: tournament.name,
      status: "RUNNING",
    },
  });

  const counters = {
    createdPlayers: 0,
    updatedPlayers: 0,
    matchedByAdminUserId: 0,
    matchedByWallet: 0,
    matchedByDiscordId: 0,
    matchedByFallback: 0,
    failedCount: 0,
  };

  try {
    const participants = await client.listTournamentParticipants(adminTournamentId);

    for (let index = 0; index < participants.length; index += IMPORT_CONCURRENCY) {
      const chunk = participants.slice(index, index + IMPORT_CONCURRENCY);

      const results = await Promise.all(
        chunk.map(async (participant) => {
          try {
            const participantDetail = await client.getParticipantDetail(participant);
            const userProfile = await client.getUserProfile(participantDetail.adminUserId);
            const roles = client.mapRemoteRolesToLocal(userProfile.preferredRoles);

            const existing = await findExistingPlayer({
              adminUserId: userProfile.adminUserId,
              wallet: userProfile.wallet,
              discordId: userProfile.discordId,
              telegram: userProfile.telegram,
              nickname: userProfile.nickname,
            });

            let playerId: string;
            let matchReason: MatchReason = "created";

            if (existing) {
              matchReason = existing.reason;
              playerId = existing.player.id;
              await prisma.player.update({
                where: { id: existing.player.id },
                data: {
                  nick: userProfile.nickname,
                  mmr: userProfile.rating ?? existing.player.mmr,
                  mainRole: roles.mainRole,
                  flexRole: roles.flexRole,
                  telegramId: userProfile.telegram ?? existing.player.telegramId,
                  discordUserId: userProfile.discordId ?? existing.player.discordUserId,
                  wallet: userProfile.wallet ?? existing.player.wallet,
                  adminUserId: userProfile.adminUserId,
                  adminParticipationCount: userProfile.participationCount,
                  hasPlayedBefore: userProfile.participationCount > 1,
                  lastImportedTournamentName: tournament.name,
                  lastSyncedAt: new Date(),
                },
              });
            } else {
              const created = await prisma.player.create({
                data: {
                  nick: userProfile.nickname,
                  mmr: userProfile.rating ?? participantDetail.qualifyRating ?? 0,
                  stake: participantDetail.bidSize ?? 0,
                  mainRole: roles.mainRole,
                  flexRole: roles.flexRole,
                  telegramId: userProfile.telegram,
                  discordUserId: userProfile.discordId,
                  wallet: userProfile.wallet,
                  adminUserId: userProfile.adminUserId,
                  adminParticipationCount: userProfile.participationCount,
                  hasPlayedBefore: userProfile.participationCount > 1,
                  lastImportedTournamentName: tournament.name,
                  lastSyncedAt: new Date(),
                },
              });
              playerId = created.id;
            }

            await prisma.playerTournamentParticipation.upsert({
              where: { adminParticipantId: participantDetail.adminParticipantId },
              update: {
                playerId,
                tournamentId: tournament.id,
                adminUserId: userProfile.adminUserId,
                nicknameSnapshot: participantDetail.nickname,
                status: participantDetail.status,
                queuePosition: participantDetail.queuePosition,
                qualifyRating: participantDetail.qualifyRating,
                bidSize: participantDetail.bidSize,
                balance: participantDetail.balance,
                participationCount: userProfile.participationCount,
                playedBefore: userProfile.participationCount > 1,
              },
              create: {
                playerId,
                tournamentId: tournament.id,
                adminParticipantId: participantDetail.adminParticipantId,
                adminUserId: userProfile.adminUserId,
                nicknameSnapshot: participantDetail.nickname,
                status: participantDetail.status,
                queuePosition: participantDetail.queuePosition,
                qualifyRating: participantDetail.qualifyRating,
                bidSize: participantDetail.bidSize,
                balance: participantDetail.balance,
                participationCount: userProfile.participationCount,
                playedBefore: userProfile.participationCount > 1,
              },
            });

            return {
              ok: true as const,
              matchReason,
              created: !existing,
            };
          } catch {
            return {
              ok: false as const,
            };
          }
        })
      );

      for (const result of results) {
        if (!result.ok) {
          counters.failedCount += 1;
          continue;
        }

        if (result.created) counters.createdPlayers += 1;
        else counters.updatedPlayers += 1;

        if (result.matchReason === "adminUserId") counters.matchedByAdminUserId += 1;
        if (result.matchReason === "wallet") counters.matchedByWallet += 1;
        if (result.matchReason === "discord") counters.matchedByDiscordId += 1;
        if (result.matchReason === "fallback") counters.matchedByFallback += 1;
      }
    }

    await prisma.adminTournamentSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "COMPLETED",
        ...counters,
        finishedAt: new Date(),
      },
    });

    return {
      syncRunId: syncRun.id,
      tournamentId: tournament.id,
      adminTournamentId,
      tournamentName: tournament.name,
      ...counters,
    };
  } catch (error) {
    await prisma.adminTournamentSyncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        errorSummary: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        ...counters,
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}
