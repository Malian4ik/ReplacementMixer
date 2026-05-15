import { NextRequest, NextResponse } from "next/server";
import { recalculateMatchStats, debugPlayerStats } from "@/services/match-stats.service";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const nick = req.nextUrl.searchParams.get("nick");
  if (nick) {
    const info = await debugPlayerStats(nick);
    return NextResponse.json(info);
  }

  const top = req.nextUrl.searchParams.get("top");
  if (top) {
    const players = await prisma.player.findMany({
      select: { nick: true, matchesPlayed: true, nightMatches: true },
      orderBy: { matchesPlayed: "desc" },
      take: parseInt(top) || 20,
    });
    return NextResponse.json(players);
  }

  try {
    const result = await recalculateMatchStats();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[cron/recalculate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
