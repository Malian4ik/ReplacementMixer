import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateTeamSchema = z.object({
  name: z.string().min(1),
  player1Id: z.string().min(1),
  player2Id: z.string().min(1),
  player3Id: z.string().min(1),
  player4Id: z.string().min(1),
  player5Id: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = CreateTeamSchema.parse(body);
    const team = await prisma.team.create({ data });
    return NextResponse.json(team, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function GET() {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
  });

  const playerIds = teams.flatMap((t) => [
    t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id,
  ]);
  const uniqueIds = [...new Set(playerIds)];
  const players = await prisma.player.findMany({ where: { id: { in: uniqueIds } } });
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const teamsWithAvg = teams.map((t) => {
    const roster = [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]
      .map((id) => playerMap.get(id))
      .filter(Boolean);
    const avgMmr = roster.length
      ? Math.round(roster.reduce((s, p) => s + p!.mmr, 0) / roster.length)
      : 0;
    return { ...t, avgMmr, players: roster };
  });

  return NextResponse.json(teamsWithAvg);
}
