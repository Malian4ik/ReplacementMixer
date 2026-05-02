import { NextResponse } from "next/server";
import { recalculateMatchStats } from "@/services/match-stats.service";

export async function POST() {
  const { totalMatches, playersUpdated } = await recalculateMatchStats();
  return NextResponse.json({ ok: true, totalMatches, playersUpdated });
}
