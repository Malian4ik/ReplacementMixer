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

async function announceReplacementFound(params: {
  channelId: string;
  teamName: string;
  playerNick: string;
}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.warn("[replacement-search] DISCORD_BOT_TOKEN is missing, skip announcement");
    return;
  }

  const content = `Замена для команды **${params.teamName}** найдена! **${params.playerNick}** теперь её новый игрок! GLHF`;
  const response = await fetch(`https://discord.com/api/v10/channels/${params.channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[replacement-search] failed to publish replacement announcement", {
      status: response.status,
      body: errorText,
      channelId: params.channelId,
    });
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

  const selectedPlayer = await prisma.player.findUnique({
    where: { id: session.recommendedPlayerId },
    select: { nick: true },
  });

  if (selectedPlayer) {
    await announceReplacementFound({
      channelId: session.discordChannelId,
      teamName: session.teamName,
      playerNick: selectedPlayer.nick,
    });
  }

  return getSearchSessionById(sessionId);
}

export async function assignReadyCandidate(sessionId: string, candidateId: string) {
  const session = await getSearchSessionById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  ensureSearchMutable(session.status);

  const candidate = await prisma.replacementWaveCandidate.findUnique({
    where: { id: candidateId },
    include: {
      player: true,
      poolEntry: true,
    },
  });

  if (!candidate || candidate.sessionId !== sessionId) throw new Error("CANDIDATE_NOT_FOUND");
  if (!candidate.respondedReady || !candidate.readyAt) throw new Error("CANDIDATE_NOT_READY");

  await assignReplacement(candidate.poolEntryId, {
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
    comment: `Selected directly from live Discord responders for replacement search ${session.id}`,
  });

  await prisma.$transaction(async (tx) => {
    await tx.replacementSearchWave.updateMany({
      where: {
        sessionId,
        status: { in: ["ACTIVE", "PROCESSING"] },
      },
      data: {
        status: "COMPLETED",
        completionReason: "SELECTED_BY_JUDGE",
        completedAt: new Date(),
      },
    });

    await updateCandidateScores(candidate.id, {
      wasOffered: true,
      offeredAt: new Date(),
      wasSelected: true,
    }, tx);

    await updateSearchSession(sessionId, {
      status: "COMPLETED",
      recommendationWaveId: candidate.waveId,
      recommendedPlayerId: candidate.playerId,
      recommendedPoolEntryId: candidate.poolEntryId,
      recommendationRank: candidate.selectionRank,
      recommendationScore: candidate.score,
      recommendationReadyAt: candidate.readyAt,
      selectedPlayerId: candidate.playerId,
      selectedPoolEntryId: candidate.poolEntryId,
      selectedAt: new Date(),
      finishedAt: new Date(),
    }, tx);
  });

  await announceReplacementFound({
    channelId: session.discordChannelId,
    teamName: session.teamName,
    playerNick: candidate.player.nick,
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
