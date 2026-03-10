import { NextResponse } from "next/server";
import { buildDailyReport } from "@/lib/report";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST() {
  try {
    const report = await buildDailyReport();
    await sendTelegramMessage(report);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
