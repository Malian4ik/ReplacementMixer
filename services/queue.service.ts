import type { SubstitutionPoolEntry, CandidateScore, RoleNumber } from "@/types";
import {
  calculateQueuePositionNorm,
  calculateMMRNorm,
  calculateRoleFit,
  calculateTeamMMRAfter,
  calculateBalanceFactor,
  calculateBaseScore,
  calculateSubScore,
} from "./subscore.service";

export interface QueueContext {
  neededRole: RoleNumber;
  currentTeamAvgMmr: number;
  replacedPlayerMmr: number;
  currentPlayerCount: number;
  targetAvgMmr: number;
  maxDeviation: number;
}

export function buildBaseQueue(
  poolEntries: SubstitutionPoolEntry[]
): SubstitutionPoolEntry[] {
  return poolEntries
    .filter((e) => e.status === "Active")
    .sort((a, b) => new Date(a.joinTime).getTime() - new Date(b.joinTime).getTime());
}

export function getTop10Candidates(
  baseQueue: SubstitutionPoolEntry[]
): SubstitutionPoolEntry[] {
  return baseQueue.slice(0, 10);
}

/**
 * Scores candidates using QueuePositionNorm (60%), MMRNorm (30%), RoleFit (10%).
 *
 * @param queuePositions - optional map of playerId → 1-based position in the reserve queue.
 *   If provided, queue position drives the 60% weight. If omitted, all players get norm=0.
 */
export function scoreCandidates(
  candidates: SubstitutionPoolEntry[],
  context: QueueContext,
  queuePositions?: Map<string, number>
): CandidateScore[] {
  const totalInQueue = queuePositions?.size ?? 0;
  const maxMmr = Math.max(...candidates.map((c) => c.player.mmr), 1);

  return candidates
    .map((entry) => {
      const p = entry.player;
      const rawPos = queuePositions?.get(p.id) ?? 0;
      const queuePositionNorm = calculateQueuePositionNorm(rawPos, totalInQueue);
      const mmrNorm = calculateMMRNorm(p.mmr, maxMmr);
      const roleFit = calculateRoleFit(
        p.mainRole as RoleNumber,
        p.flexRole as RoleNumber | null,
        context.neededRole
      );
      const teamMmrAfter = calculateTeamMMRAfter(
        context.currentTeamAvgMmr,
        context.replacedPlayerMmr,
        p.mmr,
        context.currentPlayerCount,
      );
      const balanceFactor = calculateBalanceFactor(
        teamMmrAfter,
        context.targetAvgMmr,
        context.maxDeviation
      );
      const baseScore = calculateBaseScore(queuePositionNorm, mmrNorm, roleFit);
      const subScore = calculateSubScore(baseScore, balanceFactor);

      return {
        poolEntryId: entry.id,
        playerId: p.id,
        nick: p.nick,
        wallet: p.wallet ?? null,
        mmr: p.mmr,
        stake: p.stake,
        mainRole: p.mainRole as RoleNumber,
        flexRole: p.flexRole as RoleNumber | null,
        stakeNorm: queuePositionNorm, // field reused for display, semantics changed
        mmrNorm,
        roleFit,
        baseScore,
        teamMmrAfter,
        balanceFactor,
        subScore,
      };
    })
    .sort((a, b) => b.subScore - a.subScore);
}
