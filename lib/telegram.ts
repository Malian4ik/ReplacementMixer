const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

export async function sendTelegramMessage(text: string, chatId = CHAT_ID): Promise<void> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN не настроен");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID не настроен");

  // Split into ≤4000-char chunks at newlines
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 4000) {
    const cut = remaining.lastIndexOf("\n", 4000);
    const splitAt = cut > 1000 ? cut : 4000;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);

  for (const chunk of chunks) {
    const res = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Telegram: ${(err as { description?: string }).description ?? res.status}`);
    }
  }
}

/** Returns the latest chat IDs from bot updates (for setup) */
export async function getTelegramUpdates(): Promise<{ chatId: string; name: string; text: string }[]> {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN не настроен");
  const res = await fetch(`${API}/getUpdates?limit=10&offset=-10`);
  if (!res.ok) throw new Error("getUpdates failed");
  const data = await res.json() as {
    ok: boolean;
    result: Array<{
      message?: {
        chat: { id: number; first_name?: string; username?: string };
        text?: string;
      };
    }>;
  };
  const seen = new Set<string>();
  const out: { chatId: string; name: string; text: string }[] = [];
  for (const u of data.result ?? []) {
    const m = u.message;
    if (!m) continue;
    const id = String(m.chat.id);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      chatId: id,
      name: m.chat.username ? `@${m.chat.username}` : (m.chat.first_name ?? id),
      text: m.text ?? "",
    });
  }
  return out;
}
