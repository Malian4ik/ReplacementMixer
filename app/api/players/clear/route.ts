import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/players/clear
// Deletes all players who are NOT currently in any team (OWNER only — enforced on client)
export async function POST() {
  const allTeams = await prisma.team.findMany({
    select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
  });
  const inTeamIds = new Set(
    allTeams.flatMap(t =>
      [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[]
    )
  );

  const result = await prisma.player.deleteMany({
    where: { id: { notIn: [...inTeamIds] } },
  });

  return NextResponse.json({ deleted: result.count });
}
