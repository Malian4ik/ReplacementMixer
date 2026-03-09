import type { ReplacementPoolEntry, CandidateScore, RoleNumber } from "@/types";
import {
  calculateStakeNorm,
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
  targetAvgMmr: number;
  maxDeviation: number;
}

export function buildBaseQueue(
  poolEntries: ReplacementPoolEntry[]
): ReplacementPoolEntry[] {
  return poolEntries
    .filter((e) => e.status === "Active")
    .sort((a, b) => {
      if (b.player.stake !== a.player.stake) return b.player.stake - a.player.stake;
      return new Date(a.joinTime).getTime() - new Date(b.joinTime).getTime();
    });
}

export function getTop10Candidates(
  baseQueue: ReplacementPoolEntry[]
): ReplacementPoolEntry[] {
  return baseQueue.slice(0, 10);
}

export function scoreCandidates(
  candidates: ReplacementPoolEntry[],
  context: QueueContext
): CandidateScore[] {
  const maxStake = Math.max(...candidates.map((c) => c.player.stake), 1);
  const maxMmr = Math.max(...candidates.map((c) => c.player.mmr), 1);

  return candidates
    .map((entry) => {
      const p = entry.player;
      const stakeNorm = calculateStakeNorm(p.stake, maxStake);
      const mmrNorm = calculateMMRNorm(p.mmr, maxMmr);
      const roleFit = calculateRoleFit(
        p.mainRole as RoleNumber,
        p.flexRole as RoleNumber | null,
        context.neededRole
      );
      const teamMmrAfter = calculateTeamMMRAfter(
        context.currentTeamAvgMmr,
        context.replacedPlayerMmr,
        p.mmr
      );
      const balanceFactor = calculateBalanceFactor(
        teamMmrAfter,
        context.targetAvgMmr,
        context.maxDeviation
      );
      const baseScore = calculateBaseScore(stakeNorm, mmrNorm, roleFit);
      const subScore = calculateSubScore(baseScore, balanceFactor);

      return {
        poolEntryId: entry.id,
        playerId: p.id,
        nick: p.nick,
        mmr: p.mmr,
        stake: p.stake,
        mainRole: p.mainRole as RoleNumber,
        flexRole: p.flexRole as RoleNumber | null,
        stakeNorm,
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
