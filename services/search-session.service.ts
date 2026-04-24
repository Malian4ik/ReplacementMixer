import { prisma } from "@/lib/prisma";

export interface SlotInput {
  slotIndex: number;
  neededRole: number;
  teamSlot: number;
  replacedPlayerId?: string;
  replacedPlayerNick?: string;
  slotTeamId?: string;
  slotTeamName?: string;
}

export interface CreateSessionInput {
  teamId: string;
  teamName: string;
  neededRole: number;
  replacedPlayerId?: string;
  replacedPlayerNick?: string;
  replacedPlayerMmr?: number;
  currentPlayerCount: number;
  currentTeamAvgMmr: number;
  targetAvgMmr: number;
  maxDeviation?: number;
  triggeredBy: string;
  guildId: string;
  channelId: string;
  activeMatchId?: string;
  awayTeamId?: string;
  awayTeamName?: string;
  slots?: SlotInput[];
}

/**
 * Creates a new substitution search session.
 * Throws DUPLICATE_SESSION if an Active session already exists for this team.
 */
export async function createSearchSession(input: CreateSessionInput) {
  const orConditions: Array<{ teamId?: string; awayTeamId?: string; status: string }> = [
    { teamId: input.teamId, status: "Active" },
    { awayTeamId: input.teamId, status: "Active" },
  ];
  if (input.awayTeamId) {
    orConditions.push({ teamId: input.awayTeamId, status: "Active" });
    orConditions.push({ awayTeamId: input.awayTeamId, status: "Active" });
  }

  const existing = await prisma.substitutionSearchSession.findFirst({
    where: { OR: orConditions },
  });
  if (existing) throw new Error("DUPLICATE_SESSION");

  const slots = input.slots ?? [
    {
      slotIndex: 0,
      neededRole: input.neededRole,
      teamSlot: 1,
      replacedPlayerId: input.replacedPlayerId,
      replacedPlayerNick: input.replacedPlayerNick,
    },
  ];

  return prisma.substitutionSearchSession.create({
    data: {
      teamId: input.teamId,
      teamName: input.teamName,
      neededRole: input.neededRole,
      replacedPlayerId: input.replacedPlayerId ?? null,
      replacedPlayerNick: input.replacedPlayerNick ?? null,
      replacedPlayerMmr: input.replacedPlayerMmr ?? 0,
      currentPlayerCount: input.currentPlayerCount,
      currentTeamAvgMmr: input.currentTeamAvgMmr,
      targetAvgMmr: input.targetAvgMmr,
      maxDeviation: input.maxDeviation ?? 800,
      triggeredBy: input.triggeredBy,
      guildId: input.guildId,
      channelId: input.channelId,
      activeMatchId: input.activeMatchId ?? null,
      awayTeamId: input.awayTeamId ?? null,
      awayTeamName: input.awayTeamName ?? null,
      slotsNeeded: slots.length,
      slots: { createMany: { data: slots } },
    },
    include: { slots: true },
  });
}

export async function getActiveSession(sessionId: string) {
  return prisma.substitutionSearchSession.findFirst({
    where: { id: sessionId, status: "Active" },
    include: { waves: { include: { candidates: true } }, slots: true },
  });
}

export async function cancelSession(sessionId: string) {
  return prisma.substitutionSearchSession.update({
    where: { id: sessionId },
    data: { status: "Cancelled" },
  });
}

export async function markSessionCompleted(
  sessionId: string,
  selectedPlayerId: string,
  selectedPoolEntryId: string
) {
  return prisma.substitutionSearchSession.update({
    where: { id: sessionId },
    data: { status: "Completed", selectedPlayerId, selectedPoolEntryId },
  });
}

export async function markSessionExhausted(sessionId: string) {
  return prisma.substitutionSearchSession.update({
    where: { id: sessionId },
    data: { status: "Exhausted" },
  });
}

/** Returns all player IDs that were included in any wave for this session. */
export async function getContactedPlayerIds(sessionId: string): Promise<string[]> {
  const candidates = await prisma.waveCandidate.findMany({
    where: { wave: { sessionId } },
    select: { playerId: true },
  });
  return candidates.map((c) => c.playerId);
}
