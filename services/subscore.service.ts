import type { RoleNumber } from "@/types";

export function calculateStakeNorm(stake: number, maxStake: number): number {
  if (maxStake === 0) return 0;
  return stake / maxStake;
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

/**
 * currentPlayerCount: how many players are currently in the team (before this replacement/addition)
 * replacedMmr: mmr of the player being removed. Pass 0 if filling an empty slot (addition).
 * If replacedMmr === 0 and currentPlayerCount < 5: addition mode — count increases by 1.
 * Otherwise: replacement mode — count stays same.
 */
export function calculateTeamMMRAfter(
  currentAvgMmr: number,
  replacedMmr: number,
  candidateMmr: number,
  currentPlayerCount: number = 5,
): number {
  const currentTotal = currentAvgMmr * currentPlayerCount;
  if (replacedMmr === 0 && currentPlayerCount < 5) {
    // Addition to empty slot: count increases
    return (currentTotal + candidateMmr) / (currentPlayerCount + 1);
  }
  // Replacement: count stays the same
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

export function calculateBaseScore(
  stakeNorm: number,
  mmrNorm: number,
  roleFit: number
): number {
  return 0.6 * stakeNorm + 0.3 * mmrNorm + 0.1 * roleFit;
}

export function calculateSubScore(
  baseScore: number,
  balanceFactor: number
): number {
  return baseScore * balanceFactor;
}
