import { NextResponse } from "next/server";
import { buildDailyReport } from "@/lib/report";
import { sendTelegramMessage } from "@/lib/telegram";

// Called by Vercel Cron at 21:00 UTC = 00:00 Moscow
// Reports start from 2026-05-01
const REPORTS_START = new Date("2026-05-01T00:00:00.000Z");

export async function GET() {
  if (new Date() < REPORTS_START) {
    return NextResponse.json({ ok: true, skipped: "before May 1" });
  }
  try {
    const report = await buildDailyReport();
    await sendTelegramMessage(report, "-1003817419649");
    return NextResponse.json({ ok: true, sentAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[cron/daily-report]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
