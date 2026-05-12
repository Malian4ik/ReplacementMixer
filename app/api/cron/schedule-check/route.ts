import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

async function getTeamTelegramIds(teamName: string): Promise<string[]> {
  const team = await prisma.team.findFirst({ where: { name: teamName } });
  if (!team) return [];
  const ids = [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id]
    .filter(Boolean) as string[];
  if (!ids.length) return [];
  const players = await prisma.player.findMany({
    where: { id: { in: ids } },
    select: { telegramId: true },
  });
  return players.map(p => p.telegramId).filter(Boolean) as string[];
}

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
      const timeStr = `${fmt(m.scheduledAt)} — ${fmt(m.endsAt)} МСК`;

      // Group chat notification
      await sendTelegramMessage(
        `⚔️ Через 15 минут!\nТур ${m.round}: ${m.homeTeam} vs ${m.awayTeam}\n🕐 ${timeStr}`
      );

      // Personal notifications to each player
      const [homeTgIds, awayTgIds] = await Promise.all([
        getTeamTelegramIds(m.homeTeam),
        getTeamTelegramIds(m.awayTeam),
      ]);
      const allTgIds = [...new Set([...homeTgIds, ...awayTgIds])];
      const personalText =
        `⏰ <b>Через 15 минут ваш матч!</b>\n\n` +
        `🏠 <b>${m.homeTeam}</b> vs <b>${m.awayTeam}</b>\n` +
        `🕐 ${timeStr}\n\nБудьте готовы!`;
      for (const tgId of allTgIds) {
        try {
          await sendTelegramMessage(personalText, tgId);
        } catch {
          // ignore individual send errors
        }
      }

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
