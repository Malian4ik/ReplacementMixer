import type { CandidateScore } from "@/types";

export interface RankedReadyCandidate extends CandidateScore {
  queuePosition: number;
  readyAt: Date;
}

export interface QueueCandidate {
  playerId: string;
  queuePosition: number;
}

export function pickNextWaveCandidates<T extends QueueCandidate>(
  queue: T[],
  alreadyPingedPlayerIds: Set<string>,
  limit = 15
): T[] {
  const selected: T[] = [];
  for (const candidate of queue) {
    if (alreadyPingedPlayerIds.has(candidate.playerId)) continue;
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function rankReadyCandidates<T extends RankedReadyCandidate>(candidates: T[]): T[] {
  return [...candidates].sort((a, b) => {
    if (b.subScore !== a.subScore) return b.subScore - a.subScore;
    if (a.queuePosition !== b.queuePosition) return a.queuePosition - b.queuePosition;
    if (a.readyAt.getTime() !== b.readyAt.getTime()) return a.readyAt.getTime() - b.readyAt.getTime();
    return a.playerId.localeCompare(b.playerId);
  });
}
