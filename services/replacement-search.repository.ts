import { prisma } from "@/lib/prisma";
import type { Prisma, ReplacementWaveCandidate } from "@/app/generated/prisma/client";

type DbLike = Prisma.TransactionClient | typeof prisma;

function getDb(tx?: DbLike) {
  return tx ?? prisma;
}

export type SearchSessionWithRelations = Prisma.ReplacementSearchSessionGetPayload<{
  include: {
    team: true;
    recommendedPlayer: true;
    selectedPlayer: true;
    waves: {
      include: {
        candidates: {
          include: {
            player: true;
            poolEntry: true;
          };
        };
        responses: true;
      };
      orderBy: { waveNumber: "asc" };
    };
  };
}>;

export type SearchWaveWithRelations = Prisma.ReplacementSearchWaveGetPayload<{
  include: {
    session: true;
    candidates: {
      include: {
        player: true;
        poolEntry: true;
      };
    };
    responses: true;
  };
}>;

export async function findActiveSessionByTeam(teamId: string, tx?: DbLike) {
  return getDb(tx).replacementSearchSession.findFirst({
    where: {
      teamId,
      status: { in: ["IN_PROGRESS", "WAITING_CONFIRMATION"] },
    },
    orderBy: { startedAt: "desc" },
  });
}

export async function createSearchSession(
  data: Prisma.ReplacementSearchSessionUncheckedCreateInput,
  tx?: DbLike
) {
  return getDb(tx).replacementSearchSession.create({ data });
}

export async function updateSearchSession(
  id: string,
  data: Prisma.ReplacementSearchSessionUncheckedUpdateInput,
  tx?: DbLike
) {
  return getDb(tx).replacementSearchSession.update({
    where: { id },
    data,
  });
}

export async function failSearchSession(
  id: string,
  failureReason: string,
  tx?: DbLike
) {
  return updateSearchSession(
    id,
    {
      status: "FAILED",
      failureReason,
      finishedAt: new Date(),
    },
    tx
  );
}

export async function getSearchSessionById(id: string, tx?: DbLike) {
  return getDb(tx).replacementSearchSession.findUnique({
    where: { id },
  });
}

export async function getSearchSessionWithRelations(id: string, tx?: DbLike) {
  return getDb(tx).replacementSearchSession.findUnique({
    where: { id },
    include: {
      team: true,
      recommendedPlayer: true,
      selectedPlayer: true,
      waves: {
        include: {
          candidates: {
            include: {
              player: true,
              poolEntry: true,
            },
          },
          responses: true,
        },
        orderBy: { waveNumber: "asc" },
      },
    },
  });
}

export async function getActiveSearchSessions(tx?: DbLike) {
  return getDb(tx).replacementSearchSession.findMany({
    where: { status: "IN_PROGRESS" },
    orderBy: { startedAt: "asc" },
  });
}

export async function getSessionsAwaitingWave(tx?: DbLike) {
  return getDb(tx).replacementSearchSession.findMany({
    where: {
      status: "IN_PROGRESS",
      recommendationWaveId: null,
      waves: {
        none: {
          status: { in: ["ACTIVE", "PROCESSING"] },
        },
      },
    },
    orderBy: { startedAt: "asc" },
  });
}

export async function getRecentActiveSearchSessions(tx?: DbLike) {
  return getDb(tx).replacementSearchSession.findMany({
    where: { status: { in: ["IN_PROGRESS", "WAITING_CONFIRMATION"] } },
    include: {
      waves: {
        orderBy: { waveNumber: "desc" },
        take: 1,
      },
    },
    orderBy: { startedAt: "asc" },
  });
}

export async function createWave(
  data: Prisma.ReplacementSearchWaveUncheckedCreateInput,
  tx?: DbLike
) {
  return getDb(tx).replacementSearchWave.create({ data });
}

export async function updateWave(
  id: string,
  data: Prisma.ReplacementSearchWaveUncheckedUpdateInput,
  tx?: DbLike
) {
  return getDb(tx).replacementSearchWave.update({
    where: { id },
    data,
  });
}

export async function createWaveCandidates(
  candidates: Prisma.ReplacementWaveCandidateUncheckedCreateInput[],
  tx?: DbLike
) {
  const db = getDb(tx);
  for (const candidate of candidates) {
    await db.replacementWaveCandidate.create({ data: candidate });
  }
}

export async function getWaveById(id: string, tx?: DbLike): Promise<SearchWaveWithRelations | null> {
  return getDb(tx).replacementSearchWave.findUnique({
    where: { id },
    include: {
      session: true,
      candidates: {
        include: {
          player: true,
          poolEntry: true,
        },
      },
      responses: true,
    },
  });
}

export async function getDueActiveWaves(now: Date, tx?: DbLike) {
  return getDb(tx).replacementSearchWave.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: "asc" },
  });
}

export async function claimWaveForProcessing(id: string, tx?: DbLike) {
  return getDb(tx).replacementSearchWave.updateMany({
    where: {
      id,
      status: "ACTIVE",
    },
    data: {
      status: "PROCESSING",
      processingStartedAt: new Date(),
    },
  });
}

export async function reviveStaleProcessingWaves(staleBefore: Date, tx?: DbLike) {
  return getDb(tx).replacementSearchWave.updateMany({
    where: {
      status: "PROCESSING",
      processingStartedAt: { lte: staleBefore },
      completedAt: null,
    },
    data: {
      status: "ACTIVE",
      processingStartedAt: null,
    },
  });
}

export async function getAlreadyPingedPlayerIds(sessionId: string, tx?: DbLike) {
  const rows = await getDb(tx).replacementWaveCandidate.findMany({
    where: { sessionId },
    select: { playerId: true },
  });
  return new Set(rows.map((row) => row.playerId));
}

export async function completeWave(
  id: string,
  completionReason: string,
  tx?: DbLike
) {
  return updateWave(
    id,
    {
      status: "COMPLETED",
      completionReason,
      completedAt: new Date(),
    },
    tx
  );
}

export async function createWaveResponse(
  data: Prisma.ReplacementWaveResponseUncheckedCreateInput,
  tx?: DbLike
) {
  return getDb(tx).replacementWaveResponse.create({ data });
}

export async function markCandidateReady(
  candidateId: string,
  readyAt: Date,
  tx?: DbLike
) {
  return getDb(tx).replacementWaveCandidate.update({
    where: { id: candidateId },
    data: {
      respondedReady: true,
      readyAt,
    },
  });
}

export async function getCandidateByWaveAndDiscordUserId(
  waveId: string,
  discordUserId: string,
  tx?: DbLike
): Promise<ReplacementWaveCandidate | null> {
  return getDb(tx).replacementWaveCandidate.findFirst({
    where: {
      waveId,
      discordUserId,
    },
  });
}

export async function getCandidateByWaveAndDiscordAliases(
  waveId: string,
  aliases: string[],
  tx?: DbLike
): Promise<ReplacementWaveCandidate | null> {
  const normalizedAliases = aliases.map((alias) => alias.trim()).filter(Boolean);
  if (normalizedAliases.length === 0) return null;

  return getDb(tx).replacementWaveCandidate.findFirst({
    where: {
      waveId,
      discordUserId: { in: normalizedAliases },
    },
  });
}

export async function getCandidateByWaveAndPlayerNickAliases(
  waveId: string,
  aliases: string[],
  tx?: DbLike
): Promise<ReplacementWaveCandidate | null> {
  const normalizedAliases = aliases
    .map((alias) => alias.trim().toLowerCase())
    .filter(Boolean);

  if (normalizedAliases.length === 0) return null;

  const candidates = await getDb(tx).replacementWaveCandidate.findMany({
    where: { waveId },
    include: {
      player: {
        select: {
          nick: true,
        },
      },
    },
  });

  return (
    candidates.find((candidate) =>
      normalizedAliases.includes(candidate.player.nick.trim().toLowerCase())
    ) ?? null
  );
}

export async function updateCandidateScores(
  candidateId: string,
  data: Prisma.ReplacementWaveCandidateUncheckedUpdateInput,
  tx?: DbLike
) {
  return getDb(tx).replacementWaveCandidate.update({
    where: { id: candidateId },
    data,
  });
}

export async function findCandidateById(candidateId: string, tx?: DbLike) {
  return getDb(tx).replacementWaveCandidate.findUnique({
    where: { id: candidateId },
  });
}

export async function getWaveCandidatesForRecommendation(sessionId: string, tx?: DbLike) {
  return getDb(tx).replacementWaveCandidate.findMany({
    where: {
      sessionId,
      respondedReady: true,
      selectionRank: { not: null },
    },
    orderBy: [
      { selectionRank: "asc" },
      { readyAt: "asc" },
      { playerId: "asc" },
    ],
  });
}
