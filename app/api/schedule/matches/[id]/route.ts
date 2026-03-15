import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTelegramMessage } from "@/lib/telegram";

const MATCH_MS = 1.5 * 60 * 60 * 1000;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action, techLossTeam, judgeName, comment } = await req.json() as {
      action: "tech_loss" | "postpone" | "complete";
      techLossTeam?: string;
      judgeName?: string;
      comment?: string;
    };

    const match = await prisma.tournamentMatch.findUnique({ where: { id } });
    if (!match) return NextResponse.json({ error: "Матч не найден" }, { status: 404 });

    if (action === "tech_loss") {
      if (!techLossTeam) return NextResponse.json({ error: "Укажите команду с тех. поражением" }, { status: 400 });
      await prisma.tournamentMatch.update({
        where: { id },
        data: { status: "TechLoss", techLossTeam, judgeName, comment, updatedAt: new Date() },
      });

      const winner = techLossTeam === match.homeTeam ? match.awayTeam : match.homeTeam;
      await sendTelegramMessage(
        `❌ Тех. поражение | Тур ${match.round}\n${match.homeTeam} vs ${match.awayTeam}\nТех. луз: ${techLossTeam} | Победитель: ${winner}${judgeName ? `\nСудья: ${judgeName}` : ""}${comment ? `\nКомментарий: ${comment}` : ""}`
      );

    } else if (action === "postpone") {
      // Find the match with the latest endsAt (excluding Postponed and the current match being postponed)
      const lastMatch = await prisma.tournamentMatch.findFirst({
        where: { status: { not: "Postponed" }, id: { not: id } },
        orderBy: { endsAt: "desc" },
      });

      const newStart = lastMatch ? new Date(lastMatch.endsAt.getTime()) : new Date();
      const newEnd = new Date(newStart.getTime() + MATCH_MS);

      await prisma.tournamentMatch.update({
        where: { id },
        data: {
          status: "Postponed",
          comment: comment ?? "Перенесён",
          judgeName,
          updatedAt: new Date(),
        },
      });

      // Create a new match at the new time
      await prisma.tournamentMatch.create({
        data: {
          round: match.round,
          slot: 999,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          scheduledAt: newStart,
          endsAt: newEnd,
          status: "Scheduled",
          comment: `Перенесён с тура ${match.round}`,
        },
      });

      const fmt = (d: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
      await sendTelegramMessage(
        `🔄 Перенос матча | Тур ${match.round}\n${match.homeTeam} vs ${match.awayTeam}\nНовое время: ${fmt(newStart)} МСК${judgeName ? `\nСудья: ${judgeName}` : ""}${comment ? `\nПричина: ${comment}` : ""}`
      );

    } else if (action === "complete") {
      await prisma.tournamentMatch.update({
        where: { id },
        data: { status: "Completed", judgeName, comment, updatedAt: new Date() },
      });
    } else {
      return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
