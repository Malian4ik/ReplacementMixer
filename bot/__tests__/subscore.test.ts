/**
 * Tests for pure SubScore functions (services/subscore.service.ts).
 * These test the exact same functions used by both the website and the Discord bot.
 */

import {
  calculateStakeNorm,
  calculateMMRNorm,
  calculateRoleFit,
  calculateTeamMMRAfter,
  calculateBalanceFactor,
  calculateBaseScore,
  calculateSubScore,
} from "../../services/subscore.service";

describe("calculateStakeNorm", () => {
  it("returns 0 when maxStake is 0", () => {
    expect(calculateStakeNorm(100, 0)).toBe(0);
  });
  it("normalises correctly", () => {
    expect(calculateStakeNorm(500, 1000)).toBeCloseTo(0.5);
  });
  it("returns 1 when stake equals maxStake", () => {
    expect(calculateStakeNorm(800, 800)).toBe(1);
  });
});

describe("calculateMMRNorm", () => {
  it("returns 0 when maxMmr is 0", () => {
    expect(calculateMMRNorm(5000, 0)).toBe(0);
  });
  it("normalises correctly", () => {
    expect(calculateMMRNorm(3000, 6000)).toBeCloseTo(0.5);
  });
});

describe("calculateRoleFit", () => {
  it("returns 1.0 for exact main role match", () => {
    expect(calculateRoleFit(1, null, 1)).toBe(1.0);
  });
  it("returns 0.8 for flex role match", () => {
    expect(calculateRoleFit(2, 3, 3)).toBe(0.8);
  });
  it("returns 0.5 when no role matches", () => {
    expect(calculateRoleFit(4, 5, 1)).toBe(0.5);
  });
  it("main role takes priority over flex when same", () => {
    expect(calculateRoleFit(1, 1, 1)).toBe(1.0);
  });
});

describe("calculateTeamMMRAfter (replacement mode)", () => {
  it("computes correct MMR after swapping player", () => {
    // Team avg 5000 (5 players total = 25000), remove 3000, add 7000 → 29000/5 = 5800
    const result = calculateTeamMMRAfter(5000, 3000, 7000, 5);
    expect(result).toBeCloseTo(5800);
  });
});

describe("calculateTeamMMRAfter (addition mode)", () => {
  it("increases count when filling empty slot", () => {
    // Team avg 5000 (4 players = 20000), add 8000 → 28000/5 = 5600
    const result = calculateTeamMMRAfter(5000, 0, 8000, 4);
    expect(result).toBeCloseTo(5600);
  });
});

describe("calculateBalanceFactor", () => {
  it("returns 1 when team MMR matches target exactly", () => {
    expect(calculateBalanceFactor(5000, 5000, 800)).toBe(1);
  });
  it("returns 1 when maxDeviation is 0", () => {
    expect(calculateBalanceFactor(9999, 5000, 0)).toBe(1);
  });
  it("returns 0 when deviation equals maxDeviation", () => {
    expect(calculateBalanceFactor(5800, 5000, 800)).toBeCloseTo(0);
  });
  it("clamps to 0 for extreme deviation", () => {
    expect(calculateBalanceFactor(9000, 5000, 800)).toBe(0);
  });
});

describe("calculateBaseScore", () => {
  it("uses weights 0.6/0.3/0.1", () => {
    expect(calculateBaseScore(1, 1, 1)).toBeCloseTo(1.0);
    expect(calculateBaseScore(0, 0, 0)).toBe(0);
    expect(calculateBaseScore(1, 0, 0)).toBeCloseTo(0.6);
    expect(calculateBaseScore(0, 1, 0)).toBeCloseTo(0.3);
    expect(calculateBaseScore(0, 0, 1)).toBeCloseTo(0.1);
  });
});

describe("calculateSubScore", () => {
  it("multiplies baseScore by balanceFactor", () => {
    expect(calculateSubScore(0.8, 0.9)).toBeCloseTo(0.72);
  });
  it("returns 0 when balanceFactor is 0", () => {
    expect(calculateSubScore(0.9, 0)).toBe(0);
  });
});
