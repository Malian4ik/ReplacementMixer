import { NextResponse } from "next/server";
import { recalculateMatchStats } from "@/services/match-stats.service";

export const maxDuration = 300;

export async function GET() {
  try {
    const result = await recalculateMatchStats();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[cron/recalculate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
