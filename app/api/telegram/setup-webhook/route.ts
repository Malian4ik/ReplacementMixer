import { NextRequest, NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "8213706792:AAHbzu5bM0mJyIMRacnyOInQSk_PntOQ1V4";

// GET /api/telegram/setup-webhook?url=https://your-domain.vercel.app
// Call once after deploy to register the webhook with Telegram
export async function GET(req: NextRequest) {
  const webhookUrl = req.nextUrl.searchParams.get("url");
  if (!webhookUrl) {
    return NextResponse.json({ error: "url param required, e.g. ?url=https://your-domain.vercel.app" }, { status: 400 });
  }

  const fullUrl = `${webhookUrl}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: fullUrl }),
  });
  const data = await res.json();
  return NextResponse.json({ webhookSet: fullUrl, telegram: data });
}
