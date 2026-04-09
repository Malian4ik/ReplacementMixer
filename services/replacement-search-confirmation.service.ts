import { prisma } from "@/lib/prisma";
import { assignReplacement } from "@/services/replacement.service";
import {
  getSearchSessionById,
  getWaveCandidatesForRecommendation,
  updateCandidateScores,
  updateSearchSession,
} from "@/services/replacement-search.repository";
import { createNextReplacementWave } from "@/services/replacement-search.service";
import type { DiscordReplacementTransport } from "@/services/replacement-search.types";

function ensureSearchMutable(status: string) {
  if (!["IN_PROGRESS", "WAITING_CONFIRMATION"].includes(status)) {
    throw new Error("SESSION_NOT_MUTABLE");
  }
}

export async function promoteNextRecommendation(
  sessionId: string,
  transport: DiscordReplacementTransport,
  options?: {
    rejectCurrent?: boolean;
    autoCreateWave?: boolean;
  }
) {
  const session = await getSearchSessionById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  ensureSearchMutable(session.status);

  if (options?.rejectCurrent && session.recommendedPoolEntryId) {
    const currentCandidate = await prisma.replacementWaveCandidate.findFirst({
      where: {
        sessionId,
        poolEntryId: session.recommendedPoolEntryId,
      },
    });
    if (currentCandidate) {
      await updateCandidateScores(currentCandidate.id, {
        rejectedAt: new Date(),
      });
    }
  }

  const rankedCandidates = await getWaveCandidatesForRecommendation(sessionId);
  const nextCandidate = rankedCandidates.find((candidate) => !candidate.rejectedAt && !candidate.wasSelected && !candidate.wasOffered);

  if (!nextCandidate) {
    await updateSearchSession(sessionId, {
      status: "IN_PROGRESS",
      currentWaveNumber: session.currentWaveNumber,
      recommendationWaveId: null,
      recommendedPlayerId: null,
      recommendedPoolEntryId: null,
      recommendationRank: null,
      recommendationScore: null,
      recommendationReadyAt: null,
    });

    if (options?.autoCreateWave !== false) {
      await createNextReplacementWave(sessionId, transport);
    }
    return null;
  }

  await updateCandidateScores(nextCandidate.id, {
    wasOffered: true,
    offeredAt: new Date(),
  });

  await updateSearchSession(sessionId, {
    status: "WAITING_CONFIRMATION",
    recommendationWaveId: nextCandidate.waveId,
    recommendedPlayerId: nextCandidate.playerId,
    recommendedPoolEntryId: nextCandidate.poolEntryId,
    recommendationRank: nextCandidate.selectionRank,
    recommendationScore: nextCandidate.score,
    recommendationReadyAt: nextCandidate.readyAt,
  });

  return getSearchSessionById(sessionId);
}

export async function confirmRecommendedReplacement(sessionId: string) {
  const session = await getSearchSessionById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "WAITING_CONFIRMATION") throw new Error("SESSION_NOT_WAITING_CONFIRMATION");
  if (!session.recommendedPoolEntryId || !session.recommendedPlayerId) throw new Error("NO_RECOMMENDATION");

  await assignReplacement(session.recommendedPoolEntryId, {
    matchId: session.matchId ?? undefined,
    teamId: session.teamId,
    teamName: session.teamName,
    neededRole: session.neededRole,
    replacedPlayerId: session.replacedPlayerId ?? undefined,
    replacedPlayerNick: session.replacedPlayerNick ?? undefined,
    replacedPlayerMmr: session.replacedPlayerMmr ?? undefined,
    targetAvgMmr: session.targetAvgMmr,
    maxDeviation: session.maxDeviation,
    judgeName: session.triggeredByName ?? "Website Judge",
    comment: `Confirmed via website for replacement search ${session.id}`,
  });

  const candidate = await prisma.replacementWaveCandidate.findFirst({
    where: {
      sessionId,
      poolEntryId: session.recommendedPoolEntryId,
    },
  });

  if (candidate) {
    await updateCandidateScores(candidate.id, {
      wasSelected: true,
    });
  }

  await updateSearchSession(sessionId, {
    status: "COMPLETED",
    selectedPlayerId: session.recommendedPlayerId,
    selectedPoolEntryId: session.recommendedPoolEntryId,
    selectedAt: new Date(),
    finishedAt: new Date(),
  });

  return getSearchSessionById(sessionId);
}

export async function cancelReplacementSearch(sessionId: string) {
  const session = await getSearchSessionById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  ensureSearchMutable(session.status);

  await updateSearchSession(sessionId, {
    status: "CANCELLED",
    failureReason: "CANCELLED_BY_JUDGE",
    finishedAt: new Date(),
  });
}
