import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/replacement-pool/cleanup
// Sets Active pool entries to Picked for players who are currently in any team
export async function POST() {
  const allTeams = await prisma.team.findMany({
    select: { id: true, player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
  });

  // Build a map: playerId -> teamId
  const playerTeamMap = new Map<string, string>();
  for (const t of allTeams) {
    for (const id of [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]) {
      if (id) playerTeamMap.set(id, t.id);
    }
  }

  if (playerTeamMap.size === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const inTeamIds = [...playerTeamMap.keys()];

  // Find Active pool entries for in-team players
  const entries = await prisma.replacementPoolEntry.findMany({
    where: { playerId: { in: inTeamIds }, status: "Active" },
  });

  // Update each entry individually to set assignedTeamId correctly
  let count = 0;
  for (const entry of entries) {
    const teamId = playerTeamMap.get(entry.playerId);
    if (teamId) {
      await prisma.replacementPoolEntry.update({
        where: { id: entry.id },
        data: { status: "Picked", assignedTeamId: teamId, pickedTime: new Date() },
      });
      count++;
    }
  }

  return NextResponse.json({ updated: count });
}
