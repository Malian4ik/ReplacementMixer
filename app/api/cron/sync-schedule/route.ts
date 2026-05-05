import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminLogin, fetchTournamentScheduleData } from "@/services/admin-source.service";

const MATCH_MS = 75 * 60 * 1000; // 75 min per match

/**
 * GET /api/cron/sync-schedule
 * Автоматически синхронизирует расписание из Django admin.
 * Находит последний синкнутый турнир, тянет все матчи, апсертит по паре команд:
 * - если время изменилось → обновляет
 * - если матч новый → создаёт
 * - если в admin матч завершён, а локально Scheduled/Live → помечает Completed
 * Статусы Completed/TechLoss/Postponed локально — не трогаются.
 */
export async function GET() {
  try {
    // Find the most recently synced tournament
    const tournament = await prisma.adminTournament.findFirst({
      where: { lastSyncedAt: { not: null } },
      orderBy: { lastSyncedAt: "desc" },
    });

    if (!tournament) {
      return NextResponse.json({ ok: true, message: "Нет синкнутых турниров", updated: 0, created: 0 });
    }

    await adminLogin();
    const adminMatches = await fetchTournamentScheduleData(tournament.externalId);

    if (adminMatches.length === 0) {
      return NextResponse.json({ ok: true, message: "Матчи в admin не найдены", updated: 0, created: 0 });
    }

    let updated = 0;
    let created = 0;
    let completed = 0;

    for (const m of adminMatches) {
      if (!m.homeTeam || !m.awayTeam) continue;

      const adminStatus = (m.adminStatus ?? "").toLowerCase();
      const isAdminCompleted =
        adminStatus &&
        adminStatus !== "pending" &&
        adminStatus !== "scheduled" &&
        adminStatus !== "запланирован";

      // Find existing local match by team pair (regardless of time)
      const existing = await prisma.tournamentMatch.findFirst({
        where: { homeTeam: m.homeTeam, awayTeam: m.awayTeam },
      });

      if (isAdminCompleted) {
        // If admin says finished but we have it as Scheduled/Live → complete it
        if (existing && (existing.status === "Scheduled" || existing.status === "Live")) {
          await prisma.tournamentMatch.update({
            where: { id: existing.id },
            data: { status: "Completed", updatedAt: new Date() },
          });
          completed++;
        }
        continue;
      }

      // Match is pending/scheduled in admin
      if (!m.scheduledAt) continue;
      const endsAt = m.endsAt ?? new Date(m.scheduledAt.getTime() + MATCH_MS);

      if (existing) {
        // Don't touch locally completed/postponed matches
        if (["Completed", "TechLoss", "Postponed"].includes(existing.status)) continue;

        // Update time if it changed (more than 1 minute drift to avoid noise)
        const timeDrift = Math.abs(existing.scheduledAt.getTime() - m.scheduledAt.getTime());
        if (timeDrift > 60_000 || existing.round !== (m.round || 1)) {
          await prisma.tournamentMatch.update({
            where: { id: existing.id },
            data: {
              scheduledAt: m.scheduledAt,
              endsAt,
              round: m.round || existing.round,
              updatedAt: new Date(),
            },
          });
          updated++;
        }
      } else {
        // Create new match
        await prisma.tournamentMatch.create({
          data: {
            round: m.round || 1,
            slot: 0,
            homeTeam: m.homeTeam,
            awayTeam: m.awayTeam,
            scheduledAt: m.scheduledAt,
            endsAt,
          },
        });
        created++;
      }
    }

    return NextResponse.json({ ok: true, updated, created, completed, total: adminMatches.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка синхронизации";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
