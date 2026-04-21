import type { RoleNumber } from "@/types";

/** @deprecated Use calculateQueuePositionNorm instead. */
export function calculateStakeNorm(stake: number, maxStake: number): number {
  if (maxStake === 0) return 0;
  return stake / maxStake;
}

/**
 * QueuePositionNorm: first in queue (position=1) → 1.0; last (position=N) → 1/N.
 * If player is not in the queue (position=0 or totalInQueue=0) → 0.
 */
export function calculateQueuePositionNorm(position: number, totalInQueue: number): number {
  if (totalInQueue === 0 || position <= 0) return 0;
  return (totalInQueue - position + 1) / totalInQueue;
}

export function calculateMMRNorm(mmr: number, maxMmr: number): number {
  if (maxMmr === 0) return 0;
  return mmr / maxMmr;
}

export function calculateRoleFit(
  candidateMain: RoleNumber,
  candidateFlex: RoleNumber | null,
  neededRole: RoleNumber
): number {
  if (candidateMain === neededRole) return 1.0;
  if (candidateFlex === neededRole) return 0.8;
  return 0.5;
}

export function calculateTeamMMRAfter(
  currentAvgMmr: number,
  replacedMmr: number,
  candidateMmr: number,
  currentPlayerCount: number = 5,
): number {
  const currentTotal = currentAvgMmr * currentPlayerCount;
  if (replacedMmr === 0 && currentPlayerCount < 5) {
    return (currentTotal + candidateMmr) / (currentPlayerCount + 1);
  }
  return (currentTotal - replacedMmr + candidateMmr) / currentPlayerCount;
}

export function calculateBalanceFactor(
  teamMmrAfter: number,
  targetAvgMmr: number,
  maxDeviation: number
): number {
  if (maxDeviation === 0) return 1;
  return Math.max(0, 1 - Math.abs(teamMmrAfter - targetAvgMmr) / maxDeviation);
}

/**
 * BaseScore = 0.6 × QueuePositionNorm + 0.3 × MMRNorm + 0.1 × RoleFit
 * The first argument was formerly stakeNorm — now replaced with queuePositionNorm.
 */
export function calculateBaseScore(
  queuePositionNorm: number,
  mmrNorm: number,
  roleFit: number
): number {
  return 0.6 * queuePositionNorm + 0.3 * mmrNorm + 0.1 * roleFit;
}

export function calculateSubScore(
  baseScore: number,
  balanceFactor: number
): number {
  return baseScore * balanceFactor;
}
