import { NextRequest, NextResponse } from "next/server";
import { recalculateMatchStats, debugPlayerStats } from "@/services/match-stats.service";

export async function POST() {
  const { totalMatches, playersUpdated } = await recalculateMatchStats();
  return NextResponse.json({ ok: true, totalMatches, playersUpdated });
}

export async function GET(req: NextRequest) {
  const nick = req.nextUrl.searchParams.get("debug");
  if (nick) {
    const info = await debugPlayerStats(nick);
    return NextResponse.json(info);
  }
  const { totalMatches, playersUpdated } = await recalculateMatchStats();
  return NextResponse.json({ ok: true, totalMatches, playersUpdated });
}
