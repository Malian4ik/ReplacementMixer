import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: true });

    const message = body.message;
    if (!message?.text?.startsWith("/start")) return NextResponse.json({ ok: true });

    const chatId = String(message.chat.id);
    const username = message.from?.username as string | undefined;

    if (username) {
      // Find player by username stored in telegramId (with or without @)
      const updated = await prisma.player.updateMany({
        where: { telegramId: { in: [username, `@${username}`] } },
        data: { telegramId: chatId },
      });

      if (updated.count > 0) {
        await sendTelegramMessage(
          `✅ <b>Вы зарегистрированы!</b>\n\nТеперь вы будете получать уведомления о начале ваших матчей прямо сюда.`,
          chatId
        );
      } else {
        await sendTelegramMessage(
          `⚠️ Ваш Telegram (@${username}) не найден в базе игроков.\n\nОбратитесь к организатору чтобы вас добавили.`,
          chatId
        );
      }
    } else {
      await sendTelegramMessage(
        `⚠️ У вас не установлен Telegram username. Зайдите в настройки Telegram и добавьте @юзернейм.`,
        chatId
      );
    }
  } catch (err) {
    console.error("[telegram/webhook]", err);
  }

  return NextResponse.json({ ok: true });
}
