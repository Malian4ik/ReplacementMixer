import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminLogin, fetchTournamentScheduleData } from "@/services/admin-source.service";
import { sendTelegramMessage } from "@/lib/telegram";
import { creditNightMatches } from "@/services/match-stats.service";

const PENDING_RE = /pending|scheduled|запланирован|в\s*ожидании/i;
const DONE_RE = /завершен|завершён|завершена|победа|поражение|completed|finished|done|canceled|cancelled|tech_loss|техническое\s*поражение/i;

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
    // Use the active tournament as source; fall back to last synced
    const tournament =
      (await prisma.adminTournament.findFirst({ where: { isActive: true } })) ??
      (await prisma.adminTournament.findFirst({
        where: { lastSyncedAt: { not: null } },
        orderBy: { lastSyncedAt: "desc" },
      }));

    if (!tournament) {
      return NextResponse.json({ ok: true, message: "Нет синкнутых турниров", notified: 0 });
    }

    await adminLogin();
    const adminMatches = await fetchTournamentScheduleData(tournament.externalId);

    let notified = 0;

    for (const m of adminMatches) {
      if (!m.homeTeam || !m.awayTeam) continue;

      const status = (m.adminStatus ?? "").trim().toLowerCase();
      // Skip matches that are pending/scheduled or already finished
      if (!status || PENDING_RE.test(status) || DONE_RE.test(status)) continue;

      // Only notify if match is scheduled within ±2h of now:
      // - skip if scheduled more than 2h ago (stale old match)
      // - skip if scheduled more than 15min in the future (judge activated too early)
      if (m.scheduledAt) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const fifteenMinFromNow = new Date(Date.now() + 15 * 60 * 1000);
        if (m.scheduledAt < twoHoursAgo || m.scheduledAt > fifteenMinFromNow) continue;
      }

      // Match is active/live on admin site.
      // Check if we already sent the "match started" notification (tracked via comment field).
      const alreadyNotified = await prisma.tournamentMatch.findFirst({
        where: { homeTeam: m.homeTeam, awayTeam: m.awayTeam, comment: "match_started" },
      });
      if (alreadyNotified) continue;

      // Send Telegram notifications to all players in both teams
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

      // Record notification so we don't send it again.
      // Upsert into TournamentMatch — create minimal record if doesn't exist yet.
      const now = new Date();
      const existing = await prisma.tournamentMatch.findFirst({
        where: { homeTeam: m.homeTeam, awayTeam: m.awayTeam },
      });

      // Mark as "match started" notification sent (separate from 15-min notifiedAt)
      if (existing) {
        await prisma.tournamentMatch.update({
          where: { id: existing.id },
          data: { status: "Active", comment: "match_started", updatedAt: now },
        });
      } else {
        await prisma.tournamentMatch.create({
          data: {
            round: m.round || 1,
            slot: 0,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            scheduledAt: m.scheduledAt ?? now,
            endsAt: m.endsAt ?? new Date(now.getTime() + 90 * 60 * 1000),
            status: "Active",
            comment: "match_started",
          },
        });
      }

      notified++;
    }

    // Начислить ночные стрики для матчей, завершённых в admin
    let nightCredited = 0;
    for (const m of adminMatches) {
      if (!m.homeTeam || !m.awayTeam || !m.scheduledAt) continue;
      const status = (m.adminStatus ?? "").trim().toLowerCase();
      if (!DONE_RE.test(status)) continue; // только завершённые
      try {
        await creditNightMatches(m.homeTeam, m.awayTeam, m.scheduledAt);
        nightCredited++;
      } catch { /* игнорируем ошибки отдельных матчей */ }
    }

    return NextResponse.json({ ok: true, notified, nightCredited });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
