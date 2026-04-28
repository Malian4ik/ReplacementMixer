import { prisma } from "@/lib/prisma";
import { scoreCandidates } from "./queue.service";
import type { SubstitutionPoolEntry, RoleNumber } from "@/types";
import { WAVE_DURATION_MS } from "@/lib/substitution-config";

// ── Eligibility ───────────────────────────────────────────────────────────────

/** Returns all player IDs that are currently on any team. */
async function getInTeamPlayerIds(): Promise<Set<string>> {
  const teams = await prisma.team.findMany({
    select: {
      player1Id: true,
      player2Id: true,
      player3Id: true,
      player4Id: true,
      player5Id: true,
    },
  });
  const ids = new Set<string>();
  for (const t of teams) {
    for (const id of [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

/**
 * Returns ALL eligible reserve players (no batch limit).
 * Primary sort: admin queuePosition from the most recently synced AdminTournament.
 * Fallback sort: joinTime asc (for players without an admin queuePosition).
 *
 * Eligibility:
 * - SubstitutionPoolEntry.status === "Active"
 * - Not currently on a team
 * - Not disqualified, isActiveInDatabase
 */
export async function getAllEligiblePlayers(): Promise<SubstitutionPoolEntry[]> {
  const inTeamIds = await getInTeamPlayerIds();

  const rawEntries = await prisma.substitutionPoolEntry.findMany({
    where: {
      status: "Active",
      player: { isDisqualified: false, isActiveInDatabase: true },
    },
    include: { player: true },
    orderBy: { joinTime: "asc" },
  });

  const eligible = rawEntries.filter((e) => !inTeamIds.has(e.playerId));

  // Overlay admin queue positions from the most recently synced tournament
  const activeTournament = await prisma.adminTournament.findFirst({
    where: { lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: "desc" },
  });

  if (activeTournament) {
    const playerIds = eligible.map((e) => e.playerId);
    const participations = await prisma.playerTournamentParticipation.findMany({
      where: {
        tournamentId: activeTournament.id,
        playerId: { in: playerIds },
        queuePosition: { not: null },
      },
      select: { playerId: true, queuePosition: true },
    });
    const queueMap = new Map(participations.map((p) => [p.playerId, p.queuePosition!]));

    eligible.sort((a, b) => {
      const posA = queueMap.get(a.playerId) ?? Infinity;
      const posB = queueMap.get(b.playerId) ?? Infinity;
      if (posA !== posB) return posA - posB;
      return new Date(a.joinTime).getTime() - new Date(b.joinTime).getTime();
    });
  }

  return eligible as unknown as SubstitutionPoolEntry[];
}

/**
 * @deprecated Use getAllEligiblePlayers instead.
 * Kept for backward compatibility with any code still calling it.
 */
export async function getNextEligibleBatch(
  _contactedIds: string[]
): Promise<SubstitutionPoolEntry[]> {
  return getAllEligiblePlayers();
}

// ── Wave CRUD ─────────────────────────────────────────────────────────────────

export interface CreateWaveInput {
  sessionId: string;
  waveNumber: number;
  channelId: string;
  candidates: Array<{
    poolEntryId: string;
    playerId: string;
    discordId: string | null;
    queuePosition: number;
  }>;
}

export async function createWave(input: CreateWaveInput) {
  const endsAt = new Date(Date.now() + WAVE_DURATION_MS);

  return prisma.$transaction(async (tx) => {
    // Increment currentWave on session
    await tx.substitutionSearchSession.update({
      where: { id: input.sessionId },
      data: { currentWave: input.waveNumber },
    });

    return tx.substitutionWave.create({
      data: {
        sessionId: input.sessionId,
        waveNumber: input.waveNumber,
        channelId: input.channelId,
        endsAt,
        candidates: {
          createMany: { data: input.candidates },
        },
      },
      include: { candidates: true },
    });
  });
}

export async function setWaveMessageId(waveId: string, messageId: string) {
  return prisma.substitutionWave.update({
    where: { id: waveId },
    data: { messageId },
  });
}

/**
 * Atomically claims a wave for processing (Active → Processing).
 * Returns null if the wave was already claimed (idempotency guard).
 */
export async function claimWaveForProcessing(waveId: string) {
  return prisma.$transaction(async (tx) => {
    const wave = await tx.substitutionWave.findUnique({
      where: { id: waveId },
      include: {
        session: true,
        candidates: true,
        responses: true,
      },
    });
    if (!wave || wave.status !== "Active") return null;

    await tx.substitutionWave.update({
      where: { id: waveId },
      data: { status: "Processing" },
    });

    return wave;
  });
}

export async function markWaveNoResponse(waveId: string) {
  return prisma.substitutionWave.update({
    where: { id: waveId },
    data: { status: "NoResponse" },
  });
}

// ── Responses ─────────────────────────────────────────────────────────────────

/**
 * Records a "Готов" click.
 * Throws WAVE_NOT_ACTIVE if the wave is no longer active.
 * Throws ALREADY_RESPONDED if the player already clicked in this wave.
 * Throws PLAYER_NOT_LINKED if discordId has no player mapping.
 * Throws CANDIDATE_NOT_IN_WAVE if the player was not a candidate in this wave.
 *
 * @param username - Discord username (tag) as fallback if numeric ID not found in DB.
 */
export async function recordReadyResponse(waveId: string, discordId: string, username?: string) {
  // Look up player by numeric discordId first
  let player = await prisma.player.findUnique({
    where: { discordId },
  });

  // Fallback: DB may still store username instead of numeric ID
  if (!player && username) {
    player = await prisma.player.findFirst({
      where: { discordId: username },
    });
    if (player) {
      // One-time migration: replace username with numeric ID in DB
      await prisma.player
        .update({ where: { id: player.id }, data: { discordId } })
        .catch(() => {});
    }
  }

  if (!player) throw new Error("PLAYER_NOT_LINKED");

  // Check wave is active
  const wave = await prisma.substitutionWave.findUnique({
    where: { id: waveId },
    include: { candidates: true },
  });
  if (!wave || wave.status !== "Active") throw new Error("WAVE_NOT_ACTIVE");

  // Check player is a candidate in this wave
  const isCandidate = wave.candidates.some((c) => c.playerId === player.id);
  if (!isCandidate) throw new Error("CANDIDATE_NOT_IN_WAVE");

  // Check if player is still eligible (active in pool, not in team)
  const poolEntry = await prisma.substitutionPoolEntry.findFirst({
    where: { playerId: player.id, status: "Active" },
  });
  if (!poolEntry) throw new Error("PLAYER_NOT_IN_POOL");

  // Upsert response (prevents duplicates via @@unique constraint)
  return prisma.waveResponse.upsert({
    where: { waveId_playerId: { waveId, playerId: player.id } },
    create: { waveId, playerId: player.id, discordId, clickedAt: new Date() },
    update: {}, // no-op on duplicate
  });
}

// ── Selection ─────────────────────────────────────────────────────────────────

export interface SelectionResult {
  poolEntryId: string;
  playerId: string;
  nick: string;
  mmr: number;
  stake: number;
  subScore: number;
  roleFit: number;
  discordId: string | null;
}

/**
 * Scores all responders of a wave and selects the best candidate.
 * Returns null if no eligible responders remain (all left pool, etc.)
 */
export async function selectBestResponder(
  wave: {
    id: string;
    sessionId: string;
    responses: Array<{ playerId: string; discordId: string; clickedAt: Date }>;
    candidates: Array<{ playerId: string; queuePosition: number }>;
  },
  session: {
    neededRole: number;
    currentTeamAvgMmr: number;
    replacedPlayerMmr: number;
    currentPlayerCount: number;
    targetAvgMmr: number;
    maxDeviation: number;
  }
): Promise<SelectionResult | null> {
  const responderPlayerIds = wave.responses.map((r) => r.playerId);

  // Load pool entries for responders (must still be Active)
  const poolEntries = await prisma.substitutionPoolEntry.findMany({
    where: {
      playerId: { in: responderPlayerIds },
      status: "Active",
      player: { isDisqualified: false, isActiveInDatabase: true },
    },
    include: { player: true },
  });

  if (poolEntries.length === 0) return null;

  const scored = scoreCandidates(poolEntries as unknown as SubstitutionPoolEntry[], {
    neededRole: session.neededRole as RoleNumber,
    currentTeamAvgMmr: session.currentTeamAvgMmr,
    replacedPlayerMmr: session.replacedPlayerMmr,
    currentPlayerCount: session.currentPlayerCount,
    targetAvgMmr: session.targetAvgMmr,
    maxDeviation: session.maxDeviation,
  });

  // Tie-breakers: subScore desc → queuePosition asc → clickedAt asc
  const queuePos = new Map(wave.candidates.map((c) => [c.playerId, c.queuePosition]));
  const clickedAt = new Map(wave.responses.map((r) => [r.playerId, r.clickedAt.getTime()]));

  scored.sort((a, b) => {
    if (b.subScore !== a.subScore) return b.subScore - a.subScore;
    const posA = queuePos.get(a.playerId) ?? 999;
    const posB = queuePos.get(b.playerId) ?? 999;
    if (posA !== posB) return posA - posB;
    return (clickedAt.get(a.playerId) ?? 0) - (clickedAt.get(b.playerId) ?? 0);
  });

  const winner = scored[0];

  // Persist subScore and mark selected
  await prisma.$transaction([
    prisma.waveResponse.updateMany({
      where: { waveId: wave.id },
      data: { subScore: null, selected: false },
    }),
    prisma.waveResponse.updateMany({
      where: { waveId: wave.id, playerId: winner.playerId },
      data: { subScore: winner.subScore, selected: true },
    }),
    prisma.substitutionWave.update({
      where: { id: wave.id },
      data: { status: "Completed" },
    }),
  ]);

  // Find discordId from the winning pool entry's player
  const winnerEntry = poolEntries.find((e) => e.playerId === winner.playerId);
  const discordId = (winnerEntry?.player as { discordId?: string | null } | undefined)?.discordId ?? null;

  return {
    poolEntryId: winner.poolEntryId,
    playerId: winner.playerId,
    nick: winner.nick,
    mmr: winner.mmr,
    stake: winner.stake,
    subScore: winner.subScore,
    roleFit: winner.roleFit,
    discordId,
  };
}

/**
 * Scores all responders and returns the top N candidates for multi-slot assignment.
 * Tie-breakers: subScore desc → queuePosition asc → clickedAt asc.
 * Returns an empty array if no eligible responders remain.
 */
export async function selectBestNResponders(
  wave: {
    id: string;
    responses: Array<{ playerId: string; discordId: string; clickedAt: Date }>;
    candidates: Array<{ playerId: string; queuePosition: number }>;
  },
  session: {
    neededRole: number;
    currentTeamAvgMmr: number;
    replacedPlayerMmr: number;
    currentPlayerCount: number;
    targetAvgMmr: number;
    maxDeviation: number;
  },
  n: number
): Promise<SelectionResult[]> {
  if (n <= 0) return [];

  const responderIds = wave.responses.map((r) => r.playerId);
  const poolEntries = await prisma.substitutionPoolEntry.findMany({
    where: {
      playerId: { in: responderIds },
      status: "Active",
      player: { isDisqualified: false, isActiveInDatabase: true },
    },
    include: { player: true },
  });

  if (poolEntries.length === 0) return [];

  // Build queue position map from wave candidates (1-based for scoring)
  const totalInQueue = wave.candidates.length;
  const queuePositions = new Map(
    wave.candidates.map((c) => [c.playerId, c.queuePosition + 1])
  );

  const scored = scoreCandidates(
    poolEntries as unknown as SubstitutionPoolEntry[],
    {
      neededRole: session.neededRole as RoleNumber,
      currentTeamAvgMmr: session.currentTeamAvgMmr,
      replacedPlayerMmr: session.replacedPlayerMmr,
      currentPlayerCount: session.currentPlayerCount,
      targetAvgMmr: session.targetAvgMmr,
      maxDeviation: session.maxDeviation,
    },
    totalInQueue > 0 ? queuePositions : undefined
  );

  const clickedAt = new Map(wave.responses.map((r) => [r.playerId, r.clickedAt.getTime()]));
  const queuePos = new Map(wave.candidates.map((c) => [c.playerId, c.queuePosition]));

  scored.sort((a, b) => {
    if (b.subScore !== a.subScore) return b.subScore - a.subScore;
    const posA = queuePos.get(a.playerId) ?? 999;
    const posB = queuePos.get(b.playerId) ?? 999;
    if (posA !== posB) return posA - posB;
    return (clickedAt.get(a.playerId) ?? 0) - (clickedAt.get(b.playerId) ?? 0);
  });

  const winners = scored.slice(0, n);

  // Persist subScores and mark wave completed
  await prisma.$transaction([
    prisma.waveResponse.updateMany({ where: { waveId: wave.id }, data: { subScore: null, selected: false } }),
    ...winners.map((w) =>
      prisma.waveResponse.updateMany({
        where: { waveId: wave.id, playerId: w.playerId },
        data: { subScore: w.subScore, selected: true },
      })
    ),
    prisma.substitutionWave.update({ where: { id: wave.id }, data: { status: "Completed" } }),
  ]);

  return winners.map((w) => {
    const entry = poolEntries.find((e) => e.playerId === w.playerId);
    const discordId = (entry?.player as { discordId?: string | null } | undefined)?.discordId ?? null;
    return {
      poolEntryId: w.poolEntryId,
      playerId: w.playerId,
      nick: w.nick,
      mmr: w.mmr,
      stake: w.stake,
      subScore: w.subScore,
      roleFit: w.roleFit,
      discordId,
    };
  });
}

// ── Active wave recovery ──────────────────────────────────────────────────────

/** Returns all Active waves with their sessions (used on bot restart). */
export async function getActiveWavesForRecovery() {
  return prisma.substitutionWave.findMany({
    where: { status: "Active" },
    include: {
      session: true,
      candidates: true,
      responses: true,
    },
  });
}
