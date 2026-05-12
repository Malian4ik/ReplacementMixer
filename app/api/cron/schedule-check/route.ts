import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminLogin, fetchTournamentScheduleData } from "@/services/admin-source.service";
import { sendTelegramMessage } from "@/lib/telegram";

const PENDING_RE = /^(pending|scheduled|запланирован)$/i;
const DONE_RE = /^(завершен|завершён|completed|finished|done|canceled|cancelled|tech_loss|техническое\s*поражение)$/i;

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

    // Use the active tournament; fall back to last synced
    const tournament =
      (await prisma.adminTournament.findFirst({ where: { isActive: true } })) ??
      (await prisma.adminTournament.findFirst({
        where: { lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: "desc" },
      }));

    let notified = 0;

    if (tournament) {
      await adminLogin();
      const adminMatches = await fetchTournamentScheduleData(tournament.externalId);

      // Window: matches starting in 13–18 minutes from now
      // (wide enough to catch the match regardless of exact cron timing)
      const windowStart = new Date(now.getTime() + 13 * 60 * 1000);
      const windowEnd = new Date(now.getTime() + 18 * 60 * 1000);

      for (const m of adminMatches) {
        if (!m.homeTeam || !m.awayTeam || !m.scheduledAt) continue;

        const status = (m.adminStatus ?? "").trim().toLowerCase();
        // Only notify pending/scheduled matches (not already active or done)
        if (status && !PENDING_RE.test(status)) continue;

        // Check if this match starts within the notification window
        if (m.scheduledAt < windowStart || m.scheduledAt > windowEnd) continue;

        // Check if we already sent a 15-min notification for this match
        // (notifiedAt set within last 30 min = already notified for this occurrence)
        const alreadyNotified = await prisma.tournamentMatch.findFirst({
          where: {
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            notifiedAt: { not: null, gte: new Date(now.getTime() - 30 * 60 * 1000) },
          },
        });
        if (alreadyNotified) continue;

        const timeStr = `${fmt(m.scheduledAt)} МСК`;

        // Group chat notification
        await sendTelegramMessage(
          `⚔️ Через 15 минут!\nТур ${m.round}: ${m.homeTeam} vs ${m.awayTeam}\n🕐 ${timeStr}`
        );

        // Personal notifications
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

        // Record notification to prevent duplicate sends
        const existing = await prisma.tournamentMatch.findFirst({
          where: { homeTeam: m.homeTeam, awayTeam: m.awayTeam },
        });
        if (existing) {
          await prisma.tournamentMatch.update({
            where: { id: existing.id },
            data: { notifiedAt: now, updatedAt: now },
          });
        } else {
          await prisma.tournamentMatch.create({
            data: {
              round: m.round || 1,
              slot: 0,
              homeTeam: m.homeTeam,
              awayTeam: m.awayTeam,
              scheduledAt: m.scheduledAt,
              endsAt: m.endsAt ?? new Date(m.scheduledAt.getTime() + 90 * 60 * 1000),
              status: "Scheduled",
              notifiedAt: now,
            },
          });
        }

        notified++;
      }
    }

    // Auto-complete local matches that have ended (still useful for UI)
    const completed = await prisma.tournamentMatch.updateMany({
      where: {
        endsAt: { lte: now },
        status: { in: ["Scheduled", "Active", "Live"] },
      },
      data: { status: "Completed" },
    });

    return NextResponse.json({ ok: true, notified, autoCompleted: completed.count });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
