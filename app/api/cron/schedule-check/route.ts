import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";
import { buildMatchCompletionMessage } from "@/lib/report";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

export async function GET() {
  try {
    const now = new Date();
    const in15min = new Date(now.getTime() + 15 * 60 * 1000);
    const in16min = new Date(now.getTime() + 16 * 60 * 1000);

    // 1. Notify matches starting in ~15 minutes (not yet notified)
    const toNotify = await prisma.tournamentMatch.findMany({
      where: {
        scheduledAt: { gte: in15min, lte: in16min },
        status: "Scheduled",
        notifiedAt: null,
      },
    });

    for (const m of toNotify) {
      await sendTelegramMessage(
        `⚔️ Через 15 минут!\nТур ${m.round}: ${m.homeTeam} vs ${m.awayTeam}\n🕐 ${fmt(m.scheduledAt)} — ${fmt(m.endsAt)} МСК`
      );
      await prisma.tournamentMatch.update({
        where: { id: m.id },
        data: { notifiedAt: now, updatedAt: now },
      });
    }

    // 2. Auto-complete matches that ended and are still Scheduled/Live
    const toComplete = await prisma.tournamentMatch.findMany({
      where: {
        endsAt: { lte: now },
        status: { in: ["Scheduled", "Live"] },
      },
    });

    for (const m of toComplete) {
      await prisma.tournamentMatch.update({
        where: { id: m.id },
        data: { status: "Completed", updatedAt: now },
      });
      const msg = await buildMatchCompletionMessage(m);
      await sendTelegramMessage(msg).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      notified: toNotify.length,
      completed: toComplete.length,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
