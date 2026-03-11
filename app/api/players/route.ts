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
  nightMatches: z.number().int().min(0).optional(),
});

export async function GET() {
  const players = await prisma.player.findMany({
    orderBy: { nick: "asc" },
  });
  return NextResponse.json(players);
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
