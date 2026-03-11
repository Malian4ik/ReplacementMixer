import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/replacement-pool/cleanup
// Deactivates all Active pool entries for players who are currently in any team
export async function POST() {
  const allTeams = await prisma.team.findMany({
    select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
  });
  const inTeamIds = allTeams.flatMap(t =>
    [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[]
  );

  if (inTeamIds.length === 0) {
    return NextResponse.json({ deactivated: 0 });
  }

  const result = await prisma.replacementPoolEntry.updateMany({
    where: { playerId: { in: inTeamIds }, status: "Active" },
    data: { status: "Inactive" },
  });

  return NextResponse.json({ deactivated: result.count });
}
