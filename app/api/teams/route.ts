import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreateTeamSchema = z.object({
  name: z.string().min(1),
  player1Id: z.string().optional().nullable(),
  player2Id: z.string().optional().nullable(),
  player3Id: z.string().optional().nullable(),
  player4Id: z.string().optional().nullable(),
  player5Id: z.string().optional().nullable(),
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

  const playerIds = teams.flatMap((t) =>
    [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[]
  );
  const uniqueIds = [...new Set(playerIds)];
  const players = await prisma.player.findMany({ where: { id: { in: uniqueIds } } });
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const teamsWithAvg = teams.map((t) => {
    const roster = [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]
      .map((id) => (id ? playerMap.get(id) ?? null : null));
    const activePlayers = roster.filter(Boolean);
    const avgMmr = activePlayers.length
      ? Math.round(activePlayers.reduce((s, p) => s + p!.mmr, 0) / activePlayers.length)
      : 0;
    return { ...t, avgMmr, players: roster };
  });

  return NextResponse.json(teamsWithAvg);
}
