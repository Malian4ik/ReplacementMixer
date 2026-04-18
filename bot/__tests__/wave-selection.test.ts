/**
 * Tests for wave candidate selection and tie-breaker logic.
 * Uses scoreCandidates from queue.service directly (no mocking needed).
 */

import { scoreCandidates } from "../../services/queue.service";
import type { SubstitutionPoolEntry } from "../../types";

function makeEntry(overrides: Partial<{
  id: string;
  playerId: string;
  stake: number;
  mmr: number;
  mainRole: 1 | 2 | 3 | 4 | 5;
  flexRole: 1 | 2 | 3 | 4 | 5 | null;
  joinTime: string;
}>): SubstitutionPoolEntry {
  const {
    id = "entry-1",
    playerId = "player-1",
    stake = 1000,
    mmr = 5000,
    mainRole = 1,
    flexRole = null,
    joinTime = "2026-01-01T00:00:00Z",
  } = overrides;

  return {
    id,
    playerId,
    status: "Active",
    joinTime,
    assignedTeamId: null,
    replacedPlayerId: null,
    pickedTime: null,
    source: "manual_add",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    player: {
      id: playerId,
      nick: `Player_${playerId}`,
      mmr,
      stake,
      mainRole,
      flexRole,
      wallet: null,
      telegramId: null,
      nightMatches: 0,
      isActiveInDatabase: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  };
}

const baseContext = {
  neededRole: 1 as 1 | 2 | 3 | 4 | 5,
  currentTeamAvgMmr: 5000,
  replacedPlayerMmr: 4000,
  currentPlayerCount: 5,
  targetAvgMmr: 5000,
  maxDeviation: 800,
};

describe("scoreCandidates", () => {
  it("returns candidates sorted by subScore descending", () => {
    const candidates = [
      makeEntry({ id: "e1", playerId: "p1", stake: 200, mmr: 3000, mainRole: 5 }),
      makeEntry({ id: "e2", playerId: "p2", stake: 1000, mmr: 6000, mainRole: 1 }),
    ];
    const scored = scoreCandidates(candidates, baseContext);
    expect(scored[0].playerId).toBe("p2");
    expect(scored[0].subScore).toBeGreaterThan(scored[1].subScore);
  });

  it("role fit: main > flex > off-role", () => {
    const candidates = [
      makeEntry({ id: "e1", playerId: "offRole", mainRole: 5, flexRole: null, mmr: 5000, stake: 500 }),
      makeEntry({ id: "e2", playerId: "flexRole", mainRole: 5, flexRole: 1, mmr: 5000, stake: 500 }),
      makeEntry({ id: "e3", playerId: "mainRole", mainRole: 1, flexRole: null, mmr: 5000, stake: 500 }),
    ];
    const scored = scoreCandidates(candidates, baseContext);
    const byId = Object.fromEntries(scored.map((s) => [s.playerId, s]));
    expect(byId["mainRole"].roleFit).toBe(1.0);
    expect(byId["flexRole"].roleFit).toBe(0.8);
    expect(byId["offRole"].roleFit).toBe(0.5);
  });

  it("balanceFactor penalises extreme MMR mismatch", () => {
    const goodFit = makeEntry({ id: "e1", playerId: "good", mmr: 4500, mainRole: 1, stake: 1000 });
    const badFit = makeEntry({ id: "e2", playerId: "bad", mmr: 9999, mainRole: 1, stake: 1000 });
    const scored = scoreCandidates([goodFit, badFit], baseContext);
    const byId = Object.fromEntries(scored.map((s) => [s.playerId, s]));
    expect(byId["good"].balanceFactor).toBeGreaterThan(byId["bad"].balanceFactor);
  });

  it("handles single candidate without errors", () => {
    const candidates = [makeEntry({ id: "e1", playerId: "solo", mainRole: 1 })];
    const scored = scoreCandidates(candidates, baseContext);
    expect(scored).toHaveLength(1);
    expect(scored[0].subScore).toBeGreaterThanOrEqual(0);
  });
});

describe("tie-breaker ordering", () => {
  it("sorts equal-subScore candidates by queuePosition asc then clickedAt asc", () => {
    // Both candidates have identical attributes → identical subScore
    const c1 = makeEntry({ id: "e1", playerId: "p1", stake: 500, mmr: 5000, mainRole: 1, joinTime: "2026-01-01T00:00:00Z" });
    const c2 = makeEntry({ id: "e2", playerId: "p2", stake: 500, mmr: 5000, mainRole: 1, joinTime: "2026-01-01T00:00:00Z" });
    const scored = scoreCandidates([c1, c2], baseContext);

    // Both have the same subScore
    expect(scored[0].subScore).toBeCloseTo(scored[1].subScore);

    // Now simulate the tie-breaker sort as in wave.service.selectBestResponder
    const queuePos = new Map([
      ["p1", 0],
      ["p2", 1],
    ]);
    const clickedAt = new Map([
      ["p1", 1000],
      ["p2", 2000],
    ]);

    scored.sort((a, b) => {
      if (b.subScore !== a.subScore) return b.subScore - a.subScore;
      const posA = queuePos.get(a.playerId) ?? 999;
      const posB = queuePos.get(b.playerId) ?? 999;
      if (posA !== posB) return posA - posB;
      return (clickedAt.get(a.playerId) ?? 0) - (clickedAt.get(b.playerId) ?? 0);
    });

    // p1 should win: earlier in queue and earlier click
    expect(scored[0].playerId).toBe("p1");
  });
});
