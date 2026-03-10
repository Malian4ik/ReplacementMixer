import { NextResponse } from "next/server";
import { getTelegramUpdates } from "@/lib/telegram";

export async function GET() {
  try {
    const updates = await getTelegramUpdates();
    return NextResponse.json({ updates, configured: !!process.env.TELEGRAM_CHAT_ID });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
