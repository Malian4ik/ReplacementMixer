import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";
import { getTargetAverageMmr } from "@/services/team-balance.service";
import { getEligibleReserveQueue } from "@/services/reserve-queue.service";
import {
  createSearchSession,
  createWave,
  createWaveCandidates,
  failSearchSession,
  findActiveSessionByTeam,
  getAlreadyPingedPlayerIds,
  getSearchSessionById,
  updateSearchSession,
  updateWave,
} from "@/services/replacement-search.repository";
import { pickNextWaveCandidates } from "@/services/replacement-search.helpers";
import type {
  DiscordReplacementTransport,
  ReplacementSearchContext,
  StartReplacementSearchInput,
  WaveAnnouncementCandidate,
} from "@/services/replacement-search.types";

const MAX_DEVIATION = 1000;
const WAVE_SIZE = 15;
const WAVE_TIMEOUT_MS = 3 * 60 * 1000;

function logInfo(message: string, meta?: Record<string, unknown>) {
  console.log("[replacement-search]", message, meta ?? {});
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

async function resolveSearchContext(
  input: StartReplacementSearchInput,
  tx?: Prisma.TransactionClient
): Promise<ReplacementSearchContext> {
  const db = tx ?? prisma;
  const team = await db.team.findFirst({
    where: {
      OR: [{ id: input.teamQuery }, { name: input.teamQuery }],
    },
  });

  if (!team) {
    throw new Error("TEAM_NOT_FOUND");
  }

  const teamPlayerIds = [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id].filter(Boolean) as string[];
  const teamPlayers = teamPlayerIds.length
    ? await db.player.findMany({ where: { id: { in: teamPlayerIds } } })
    : [];

  const currentPlayerCount = teamPlayers.length;
  const currentTeamAvgMmr = currentPlayerCount
    ? Math.round(teamPlayers.reduce((sum, player) => sum + player.mmr, 0) / currentPlayerCount)
    : 0;

  let replacedPlayerId: string | undefined;
  let replacedPlayerNick: string | undefined;
  let replacedPlayerMmr: number | undefined;
  let neededRole = input.neededRole;

  if (input.replacedPlayerQuery?.trim()) {
    const query = normalize(input.replacedPlayerQuery);
    const replacedPlayer = teamPlayers.find(
      (player) => normalize(player.id) === query || normalize(player.nick) === query
    );

    if (!replacedPlayer) {
      throw new Error("REPLACED_PLAYER_NOT_IN_TEAM");
    }

    replacedPlayerId = replacedPlayer.id;
    replacedPlayerNick = replacedPlayer.nick;
    replacedPlayerMmr = replacedPlayer.mmr;
    neededRole = replacedPlayer.mainRole;
  }

  if (!neededRole || neededRole < 1 || neededRole > 5) {
    throw new Error("NEEDED_ROLE_REQUIRED");
  }

  const targetAvgMmr = await getTargetAverageMmr(db);

  return {
    teamId: team.id,
    teamName: team.name,
    neededRole,
    replacedPlayerId,
    replacedPlayerNick,
    replacedPlayerMmr,
    currentTeamAvgMmr,
    currentPlayerCount,
    targetAvgMmr,
    maxDeviation: MAX_DEVIATION,
  };
}

export async function createNextReplacementWave(
  sessionId: string,
  transport: DiscordReplacementTransport,
  comment?: string
) {
  const session = await getSearchSessionById(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status !== "IN_PROGRESS") return null;

  const [alreadyPinged, reserveQueue] = await Promise.all([
    getAlreadyPingedPlayerIds(sessionId),
    getEligibleReserveQueue(),
  ]);

  const nextCandidates = pickNextWaveCandidates(reserveQueue, alreadyPinged, WAVE_SIZE);
  if (nextCandidates.length === 0) {
    await failSearchSession(sessionId, "QUEUE_EXHAUSTED");
    await transport.publishWaveResult({
      sessionId,
      waveId: "",
      waveNumber: session.currentWaveNumber,
      channelId: session.discordChannelId,
      teamName: session.teamName,
      message: `Поиск замены для команды **${session.teamName}** завершён без результата: очередь замен исчерпана.`,
    });
    return null;
  }

  const expiresAt = new Date(Date.now() + WAVE_TIMEOUT_MS);

  const wave = await prisma.$transaction(async (tx) => {
    const freshSession = await getSearchSessionById(sessionId, tx);
    if (!freshSession || freshSession.status !== "IN_PROGRESS") {
      throw new Error("SESSION_NOT_ACTIVE");
    }

    const waveNumber = freshSession.currentWaveNumber + 1;
    const createdWave = await createWave(
      {
        sessionId,
        waveNumber,
        discordChannelId: freshSession.discordChannelId,
        expiresAt,
        status: "ACTIVE",
      },
      tx
    );

    await createWaveCandidates(
      nextCandidates.map((candidate) => ({
        sessionId,
        waveId: createdWave.id,
        playerId: candidate.playerId,
        poolEntryId: candidate.id,
        discordUserId: candidate.player.discordUserId!,
        queuePosition: candidate.queuePosition,
      })),
      tx
    );

    await updateSearchSession(
      sessionId,
      {
        currentWaveNumber: waveNumber,
      },
      tx
    );

    return {
      wave: createdWave,
      waveNumber,
    };
  });

  const announcementCandidates: WaveAnnouncementCandidate[] = nextCandidates.map((candidate) => ({
    playerId: candidate.playerId,
    nick: candidate.player.nick,
    discordUserId: candidate.player.discordUserId!,
    queuePosition: candidate.queuePosition,
    mmr: candidate.player.mmr,
    stake: candidate.player.stake,
  }));

  try {
    const published = await transport.publishWave({
      sessionId,
      waveId: wave.wave.id,
      waveNumber: wave.waveNumber,
      channelId: session.discordChannelId,
      teamName: session.teamName,
      neededRole: session.neededRole,
      replacedPlayerNick: session.replacedPlayerNick ?? undefined,
      matchId: session.matchId ?? undefined,
      comment,
      candidates: announcementCandidates,
      expiresAt,
    });

    await updateWave(wave.wave.id, { discordMessageId: published.messageId });
    logInfo("Wave published", {
      sessionId,
      waveId: wave.wave.id,
      waveNumber: wave.waveNumber,
      candidates: announcementCandidates.length,
    });
    return wave.wave;
  } catch (error) {
    await updateWave(wave.wave.id, {
      status: "FAILED",
      completionReason: "DISCORD_PUBLISH_FAILED",
      completedAt: new Date(),
    });
    await failSearchSession(sessionId, "DISCORD_PUBLISH_FAILED");
    throw error;
  }
}

export async function startReplacementSearch(
  input: StartReplacementSearchInput,
  transport?: DiscordReplacementTransport
) {
  const context = await resolveSearchContext(input);

  const session = await prisma.$transaction(async (tx) => {
    const existingSession = await findActiveSessionByTeam(context.teamId, tx);
    if (existingSession) {
      throw new Error("ACTIVE_SEARCH_ALREADY_EXISTS");
    }

    return createSearchSession(
      {
        teamId: context.teamId,
        teamName: context.teamName,
        matchId: input.matchId,
        neededRole: context.neededRole,
        replacedPlayerId: context.replacedPlayerId,
        replacedPlayerNick: context.replacedPlayerNick,
        replacedPlayerMmr: context.replacedPlayerMmr,
        currentTeamAvgMmr: context.currentTeamAvgMmr,
        currentPlayerCount: context.currentPlayerCount,
        targetAvgMmr: context.targetAvgMmr,
        maxDeviation: context.maxDeviation,
        triggeredByDiscordUserId: input.triggeredByDiscordUserId,
        triggeredByName: input.triggeredByName,
        discordChannelId: input.replacementsChannelId,
      },
      tx
    );
  });

  if (transport) {
    try {
      await createNextReplacementWave(session.id, transport, input.comment);
    } catch (error) {
      await failSearchSession(session.id, "FAILED_TO_CREATE_FIRST_WAVE");
      throw error;
    }
  }

  return session;
}
