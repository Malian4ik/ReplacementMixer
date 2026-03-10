import { NextResponse } from "next/server";
import { buildDailyReport } from "@/lib/report";
import { sendTelegramMessage } from "@/lib/telegram";

// Called by Vercel Cron at 21:00 UTC = 00:00 Moscow
export async function GET() {
  try {
    const report = await buildDailyReport();
    await sendTelegramMessage(report);
    return NextResponse.json({ ok: true, sentAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[cron/daily-report]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
