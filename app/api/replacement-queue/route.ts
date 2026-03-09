import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildBaseQueue, getTop10Candidates, scoreCandidates } from "@/services/queue.service";
import type { ReplacementPoolEntry, RoleNumber } from "@/types";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const teamId = sp.get("teamId") ?? "";
  const replacedPlayerId = sp.get("replacedPlayerId") ?? "";
  const maxDeviation = Number(sp.get("maxDeviation") ?? 800);
  const neededRole = Number(sp.get("neededRole") ?? 1) as RoleNumber;

  // Auto-calculate targetAvgMmr from all teams if not provided
  let targetAvgMmr = sp.get("targetAvgMmr") ? Number(sp.get("targetAvgMmr")) : 0;
  if (!targetAvgMmr) {
    const allTeams = await prisma.team.findMany();
    if (allTeams.length > 0) {
      const pids = [...new Set(allTeams.flatMap(t =>
        [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]
      ))];
      const ps = await prisma.player.findMany({ where: { id: { in: pids } } });
      targetAvgMmr = ps.length ? Math.round(ps.reduce((s, p) => s + p.mmr, 0) / ps.length) : 9000;
    } else {
      targetAvgMmr = 9000;
    }
  }

  // Default: assume replacing an average player → neutral balance effect
  let currentTeamAvgMmr = targetAvgMmr;
  let replacedPlayerMmr = targetAvgMmr;

  if (teamId) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (team) {
      const ids = [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id];
      const players = await prisma.player.findMany({ where: { id: { in: ids } } });
      currentTeamAvgMmr = Math.round(players.reduce((s, p) => s + p.mmr, 0) / (players.length || 1));
      const replaced = players.find((p) => p.id === replacedPlayerId);
      replacedPlayerMmr = replaced ? replaced.mmr : currentTeamAvgMmr;
    }
  }

  const rawEntries = await prisma.replacementPoolEntry.findMany({
    where: { status: "Active" },
    include: { player: true },
    orderBy: { joinTime: "asc" },
  });

  const entries = rawEntries as unknown as ReplacementPoolEntry[];
  const baseQueue = buildBaseQueue(entries);
  const top10 = getTop10Candidates(baseQueue);

  if (top10.length === 0) {
    return NextResponse.json([]);
  }

  const scored = scoreCandidates(top10, {
    neededRole,
    currentTeamAvgMmr,
    replacedPlayerMmr,
    targetAvgMmr,
    maxDeviation,
  });

  return NextResponse.json(scored);
}
