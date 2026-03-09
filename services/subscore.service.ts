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
  return 0.2;
}

export function calculateTeamMMRAfter(
  currentAvgMmr: number,
  replacedMmr: number,
  candidateMmr: number
): number {
  return (currentAvgMmr * 5 - replacedMmr + candidateMmr) / 5;
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
