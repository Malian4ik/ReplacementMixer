import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const CreatePlayerSchema = z.object({
  nick: z.string().min(1),
  mmr: z.number().int().min(0),
  stake: z.number().min(0),
  mainRole: z.number().int().min(1).max(5),
  flexRole: z.number().int().min(1).max(5).nullable().optional(),
  telegramId: z.string().nullable().optional(),
  wallet: z.string().nullable().optional(),
  discordId: z.string().nullable().optional(),
  nightMatches: z.number().int().min(0).optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const disqualified = searchParams.get("disqualified") === "true";

  const players = await prisma.player.findMany({
    where: disqualified ? { isDisqualified: true } : { isDisqualified: false },
    orderBy: { nick: "asc" },
  });

  const allTeams = await prisma.team.findMany({
    select: { player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true, captainId: true },
  });
  const inTeamIds = new Set(
    allTeams.flatMap(t =>
      [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(Boolean) as string[]
    )
  );
  const captainIds = new Set(allTeams.map(t => t.captainId).filter(Boolean) as string[]);

  return NextResponse.json(players.map(p => ({ ...p, inTeam: inTeamIds.has(p.id), isCaptain: captainIds.has(p.id) })));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = CreatePlayerSchema.parse(body);
    const player = await prisma.player.create({ data });
    return NextResponse.json(player, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
