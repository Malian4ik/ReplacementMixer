import test from "node:test";
import assert from "node:assert/strict";
import { pickNextWaveCandidates, rankReadyCandidates } from "@/services/replacement-search.helpers";

test("pickNextWaveCandidates preserves queue order and skips already pinged players", () => {
  const queue = [
    { playerId: "p1", discordUserId: "d1", queuePosition: 1 },
    { playerId: "p2", discordUserId: "d2", queuePosition: 2 },
    { playerId: "p3", discordUserId: "d3", queuePosition: 3 },
    { playerId: "p4", discordUserId: "d4", queuePosition: 4 },
  ];

  const selected = pickNextWaveCandidates(queue, new Set(["p2"]), 2);
  assert.deepEqual(
    selected.map((item) => item.playerId),
    ["p1", "p3"]
  );
});

test("rankReadyCandidates uses deterministic tie breakers", () => {
  const readyAt = new Date("2026-04-09T10:00:00.000Z");
  const ranked = rankReadyCandidates([
    {
      poolEntryId: "e2",
      playerId: "player-b",
      nick: "B",
      wallet: null,
      mmr: 9000,
      stake: 20,
      mainRole: 1,
      flexRole: null,
      stakeNorm: 1,
      mmrNorm: 1,
      roleFit: 1,
      baseScore: 1,
      teamMmrAfter: 9000,
      balanceFactor: 1,
      subScore: 0.9,
      queuePosition: 2,
      readyAt,
    },
    {
      poolEntryId: "e1",
      playerId: "player-a",
      nick: "A",
      wallet: null,
      mmr: 9000,
      stake: 20,
      mainRole: 1,
      flexRole: null,
      stakeNorm: 1,
      mmrNorm: 1,
      roleFit: 1,
      baseScore: 1,
      teamMmrAfter: 9000,
      balanceFactor: 1,
      subScore: 0.9,
      queuePosition: 1,
      readyAt,
    },
  ]);

  assert.equal(ranked[0]?.playerId, "player-a");
  assert.equal(ranked[1]?.playerId, "player-b");
});
