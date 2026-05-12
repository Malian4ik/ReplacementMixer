import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminLogin, fetchTournamentScheduleData } from "@/services/admin-source.service";
import { sendTelegramMessage } from "@/lib/telegram";

const PENDING_RE = /^(pending|scheduled|запланирован)$/i;
const DONE_RE = /^(завершен|завершён|completed|finished|done|canceled|cancelled|tech_loss|техническое\s*поражение)$/i;

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
    const tournament = await prisma.adminTournament.findFirst({
      where: { lastSyncedAt: { not: null } },
      orderBy: { lastSyncedAt: "desc" },
    });

    if (!tournament) {
      return NextResponse.json({ ok: true, message: "Нет синкнутых турниров", notified: 0 });
    }

    await adminLogin();
    const adminMatches = await fetchTournamentScheduleData(tournament.externalId);

    let notified = 0;

    for (const m of adminMatches) {
      if (!m.homeTeam || !m.awayTeam) continue;

      const status = (m.adminStatus ?? "").trim().toLowerCase();
      if (!status || PENDING_RE.test(status) || DONE_RE.test(status)) continue;

      // Status is active/live — check if already notified
      const existing = await prisma.tournamentMatch.findFirst({
        where: { homeTeam: m.homeTeam, awayTeam: m.awayTeam, notifiedAt: null },
      });
      if (!existing) continue;

      const now = new Date();
      const [homeTgIds, awayTgIds] = await Promise.all([
        getTeamTelegramIds(m.homeTeam),
        getTeamTelegramIds(m.awayTeam),
      ]);
      const allTgIds = [...new Set([...homeTgIds, ...awayTgIds])];

      const text =
        `⚔️ <b>Ваш матч начался!</b>\n\n` +
        `🏠 <b>${m.homeTeam}</b> vs <b>${m.awayTeam}</b>\n\n` +
        `Заходите в лобби прямо сейчас!`;

      for (const tgId of allTgIds) {
        try {
          await sendTelegramMessage(text, tgId);
        } catch {
          // ignore individual send errors
        }
      }

      await prisma.tournamentMatch.update({
        where: { id: existing.id },
        data: { notifiedAt: now, updatedAt: now },
      });
      notified++;
    }

    return NextResponse.json({ ok: true, notified });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
