import { prisma } from "@/lib/prisma";
import { scoreCandidates } from "./queue.service";
import type { SubstitutionPoolEntry, RoleNumber } from "@/types";
import { WAVE_SIZE, WAVE_DURATION_MS } from "@/lib/substitution-config";

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
 * Returns the next `WAVE_SIZE` eligible candidates from the reserve queue,
 * excluding players already contacted in this session.
 *
 * Eligibility criteria:
 * - SubstitutionPoolEntry.status === "Active"
 * - Not currently assigned to a team
 * - Not disqualified
 * - isActiveInDatabase
 * - Not already contacted in this session (contactedIds)
 */
export async function getNextEligibleBatch(
  contactedIds: string[]
): Promise<SubstitutionPoolEntry[]> {
  const inTeamIds = await getInTeamPlayerIds();

  const rawEntries = await prisma.substitutionPoolEntry.findMany({
    where: {
      status: "Active",
      player: { isDisqualified: false, isActiveInDatabase: true },
    },
    include: { player: true },
    orderBy: { joinTime: "asc" },
  });

  const contactedSet = new Set(contactedIds);

  const eligible = rawEntries.filter(
    (e) => !inTeamIds.has(e.playerId) && !contactedSet.has(e.playerId)
  );

  return eligible.slice(0, WAVE_SIZE) as unknown as SubstitutionPoolEntry[];
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
 */
export async function recordReadyResponse(waveId: string, discordId: string) {
  // Look up player by discordId
  const player = await prisma.player.findUnique({
    where: { discordId },
  });
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

  return {
    poolEntryId: winner.poolEntryId,
    playerId: winner.playerId,
    nick: winner.nick,
    mmr: winner.mmr,
    stake: winner.stake,
    subScore: winner.subScore,
    roleFit: winner.roleFit,
  };
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
