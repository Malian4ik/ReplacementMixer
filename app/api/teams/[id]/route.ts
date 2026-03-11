import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const UpdateTeamSchema = z.object({
  name: z.string().min(1).optional(),
  player1Id: z.string().nullable().optional(),
  player2Id: z.string().nullable().optional(),
  player3Id: z.string().nullable().optional(),
  player4Id: z.string().nullable().optional(),
  player5Id: z.string().nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const team = await prisma.team.findUnique({ where: { id } });
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const playerIds = [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id]
    .filter(Boolean) as string[];
  const players = await prisma.player.findMany({ where: { id: { in: playerIds } } });
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const roster = [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id]
    .map((id) => (id ? playerMap.get(id) ?? null : null));
  const activePlayers = roster.filter(Boolean);
  const avgMmr = activePlayers.length
    ? Math.round(activePlayers.reduce((s, p) => s + p!.mmr, 0) / activePlayers.length)
    : 0;

  return NextResponse.json({ ...team, avgMmr, players: roster });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const data = UpdateTeamSchema.parse(body);
    const team = await prisma.team.update({ where: { id }, data });
    return NextResponse.json(team);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
