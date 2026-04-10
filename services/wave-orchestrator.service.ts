import { prisma } from "@/lib/prisma";
import { scoreCandidates } from "@/services/queue.service";
import {
  claimWaveForProcessing,
  completeWave,
  createWaveResponse,
  getCandidateByWaveAndDiscordAliases,
  getCandidateByWaveAndDiscordUserId,
  getCandidateByWaveAndPlayerNickAliases,
  getDueActiveWaves,
  getSearchSessionById,
  getWaveById,
  markCandidateReady,
  reviveStaleProcessingWaves,
  updateCandidateScores,
  updateSearchSession,
  updateWave,
} from "@/services/replacement-search.repository";
import { rankReadyCandidates } from "@/services/replacement-search.helpers";
import { createNextReplacementWave } from "@/services/replacement-search.service";
import { promoteNextRecommendation } from "@/services/replacement-search-confirmation.service";
import type { DiscordReplacementTransport } from "@/services/replacement-search.types";
import type { RoleNumber } from "@/types";

const STALE_PROCESSING_MS = 5 * 60 * 1000;

function logInfo(message: string, meta?: Record<string, unknown>) {
  console.log("[replacement-wave]", message, meta ?? {});
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
  );
}

export async function registerReadyResponse(params: {
  waveId: string;
  discordUserId: string;
  discordUsername?: string | null;
  discordGlobalName?: string | null;
  discordDisplayName?: string | null;
  interactionId?: string;
}) {
  const wave = await getWaveById(params.waveId);
  if (!wave) {
    return { ok: false as const, reason: "WAVE_NOT_FOUND" };
  }

  if (wave.status !== "ACTIVE") {
    return { ok: false as const, reason: "WAVE_NOT_ACTIVE" };
  }

  if (wave.expiresAt.getTime() <= Date.now()) {
    return { ok: false as const, reason: "WAVE_EXPIRED" };
  }

  let candidate = await getCandidateByWaveAndDiscordUserId(wave.id, params.discordUserId);
  if (!candidate) {
    candidate = await getCandidateByWaveAndDiscordAliases(
      wave.id,
      [params.discordUsername ?? "", params.discordGlobalName ?? "", params.discordDisplayName ?? ""]
    );
  }
  if (!candidate) {
    candidate = await getCandidateByWaveAndPlayerNickAliases(
      wave.id,
      [params.discordUsername ?? "", params.discordGlobalName ?? "", params.discordDisplayName ?? ""]
    );
  }
  if (!candidate) {
    return { ok: false as const, reason: "USER_NOT_ELIGIBLE_FOR_WAVE" };
  }

  const readyAt = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      if (candidate.discordUserId !== params.discordUserId) {
        await tx.replacementWaveCandidate.update({
          where: { id: candidate.id },
          data: { discordUserId: params.discordUserId },
        });

        await tx.player.update({
          where: { id: candidate.playerId },
          data: { discordUserId: params.discordUserId },
        });
      }

      await createWaveResponse(
        {
          sessionId: wave.sessionId,
          waveId: wave.id,
          candidateId: candidate.id,
          playerId: candidate.playerId,
          discordUserId: params.discordUserId,
          interactionId: params.interactionId,
          readyAt,
        },
        tx
      );

      await markCandidateReady(candidate.id, readyAt, tx);
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false as const, reason: "ALREADY_READY" };
    }
    throw error;
  }

  logInfo("Player marked ready", {
    waveId: wave.id,
    sessionId: wave.sessionId,
    playerId: candidate.playerId,
    discordUserId: params.discordUserId,
  });

  return {
    ok: true as const,
    playerId: candidate.playerId,
    sessionId: wave.sessionId,
  };
}

function buildRecommendationMessage(params: {
  teamName: string;
  replacedPlayerNick?: string | null;
  candidateNick: string;
  score: number;
  waveNumber: number;
}) {
  const subject = params.replacedPlayerNick
    ? `замена для **${params.replacedPlayerNick}**`
    : "заполнение свободного слота";

  return `Волна ${params.waveNumber} завершена. Рекомендован игрок **${params.candidateNick}** как ${subject} в команде **${params.teamName}**.\nSubScore: \`${params.score.toFixed(4)}\`\nОжидается подтверждение судьи на сайте.`;
}

function buildNoResponsesMessage(teamName: string, waveNumber: number) {
  return `Волна ${waveNumber} для команды **${teamName}** завершилась без ответов. Переходим к следующей группе игроков.`;
}

function buildWaveExhaustedAfterRespondersMessage(teamName: string, waveNumber: number) {
  return `Волна ${waveNumber} для команды **${teamName}** дала ответы, но ни один кандидат не смог быть назначен. Ищу следующую группу игроков.`;
}

export async function processWaveCompletion(
  waveId: string,
  transport: DiscordReplacementTransport,
  options?: {
    autoCreateNextWave?: boolean;
  }
) {
  const claim = await claimWaveForProcessing(waveId);
  if (claim.count === 0) return false;

  const wave = await getWaveById(waveId);
  if (!wave) return false;

  const session = wave.session;
  const responders = wave.candidates.filter((candidate) => candidate.respondedReady && candidate.readyAt);

  if (responders.length === 0) {
    await completeWave(wave.id, "NO_RESPONSES");
    await transport.publishWaveResult({
      sessionId: session.id,
      waveId: wave.id,
      waveNumber: wave.waveNumber,
      channelId: wave.discordChannelId,
      teamName: session.teamName,
      message: buildNoResponsesMessage(session.teamName, wave.waveNumber),
    });
    if (options?.autoCreateNextWave !== false) {
      await createNextReplacementWave(session.id, transport);
    }
    return true;
  }

  const poolEntries = await prisma.replacementPoolEntry.findMany({
    where: { id: { in: responders.map((candidate) => candidate.poolEntryId) } },
    include: { player: true },
  });

  const entryMap = new Map(poolEntries.map((entry) => [entry.id, entry]));
  const scorableEntries = responders
    .map((candidate) => entryMap.get(candidate.poolEntryId))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const scored = scoreCandidates(scorableEntries, {
    neededRole: session.neededRole as RoleNumber,
    currentTeamAvgMmr: session.currentTeamAvgMmr,
    replacedPlayerMmr: session.replacedPlayerMmr ?? 0,
    currentPlayerCount: session.currentPlayerCount,
    targetAvgMmr: session.targetAvgMmr,
    maxDeviation: session.maxDeviation,
  });

  const readyAtMap = new Map(responders.map((candidate) => [candidate.poolEntryId, candidate.readyAt!]));
  const queuePositionMap = new Map(responders.map((candidate) => [candidate.poolEntryId, candidate.queuePosition]));
  const candidateIdByPoolEntryId = new Map(responders.map((candidate) => [candidate.poolEntryId, candidate.id]));

  const ranked = rankReadyCandidates(
    scored.map((candidate) => ({
      ...candidate,
      queuePosition: queuePositionMap.get(candidate.poolEntryId)!,
      readyAt: readyAtMap.get(candidate.poolEntryId)!,
    }))
  );

  for (let index = 0; index < ranked.length; index += 1) {
    const candidate = ranked[index];
    const candidateId = candidateIdByPoolEntryId.get(candidate.poolEntryId)!;
    await updateCandidateScores(candidateId, {
      score: candidate.subScore,
      baseScore: candidate.baseScore,
      stakeNorm: candidate.stakeNorm,
      mmrNorm: candidate.mmrNorm,
      roleFit: candidate.roleFit,
      balanceFactor: candidate.balanceFactor,
      teamMmrAfter: candidate.teamMmrAfter,
      selectionRank: index + 1,
    });
  }

  await completeWave(wave.id, "RESPONDED_RANKED");
  const updatedSession = await promoteNextRecommendation(session.id, transport);

  if (!updatedSession || !updatedSession.recommendedPlayerId || !updatedSession.recommendationScore) {
    await transport.publishWaveResult({
      sessionId: session.id,
      waveId: wave.id,
      waveNumber: wave.waveNumber,
      channelId: wave.discordChannelId,
      teamName: session.teamName,
      message: buildWaveExhaustedAfterRespondersMessage(session.teamName, wave.waveNumber),
    });
    return true;
  }

  const recommendedCandidate = ranked.find((candidate) => candidate.playerId === updatedSession.recommendedPlayerId);
  if (recommendedCandidate) {
    await transport.publishWaveResult({
      sessionId: session.id,
      waveId: wave.id,
      waveNumber: wave.waveNumber,
      channelId: wave.discordChannelId,
      teamName: session.teamName,
      message: buildRecommendationMessage({
        teamName: session.teamName,
        replacedPlayerNick: session.replacedPlayerNick,
        candidateNick: recommendedCandidate.nick,
        score: recommendedCandidate.subScore,
        waveNumber: wave.waveNumber,
      }),
    });
  }

  logInfo("Wave completed with website recommendation", {
    waveId: wave.id,
    sessionId: session.id,
    recommendedPlayerId: updatedSession.recommendedPlayerId,
    recommendationRank: updatedSession.recommendationRank,
    waveNumber: wave.waveNumber,
  });
  return true;
}

export async function processDueWaves(transport: DiscordReplacementTransport) {
  const dueWaves = await getDueActiveWaves(new Date());
  for (const wave of dueWaves) {
    try {
      await processWaveCompletion(wave.id, transport);
    } catch (error) {
      await updateWave(wave.id, {
        status: "FAILED",
        completionReason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        completedAt: new Date(),
      });
      const session = await getSearchSessionById(wave.sessionId);
      if (session && session.status === "IN_PROGRESS") {
        await updateSearchSession(session.id, {
          status: "FAILED",
          failureReason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
          finishedAt: new Date(),
        });
      }
      console.error("[replacement-wave] failed to process wave", wave.id, error);
    }
  }
}

export async function recoverStaleWaveLocks() {
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const revived = await reviveStaleProcessingWaves(staleBefore);
  if (revived.count > 0) {
    logInfo("Revived stale processing waves", { count: revived.count });
  }
}
