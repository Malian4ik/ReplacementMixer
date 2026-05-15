import { NextRequest, NextResponse } from "next/server";
import { recalculateMatchStats, debugPlayerStats } from "@/services/match-stats.service";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

const ROLES: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft Sup", 5: "Hard Sup" };

export async function GET(req: NextRequest) {
  const nick = req.nextUrl.searchParams.get("nick");
  if (nick) {
    const info = await debugPlayerStats(nick);
    return NextResponse.json(info);
  }

  const top = req.nextUrl.searchParams.get("top");
  if (top) {
    const players = await prisma.player.findMany({
      select: { nick: true, matchesPlayed: true, nightMatches: true },
      orderBy: { matchesPlayed: "desc" },
      take: parseInt(top) || 20,
    });
    return NextResponse.json(players);
  }

  const exportCsv = req.nextUrl.searchParams.get("export");
  if (exportCsv === "csv") {
    const [players, teams] = await Promise.all([
      prisma.player.findMany({
        where: { isActiveInDatabase: true },
        orderBy: [{ matchesPlayed: "desc" }, { nightMatches: "desc" }],
        select: { id: true, nick: true, mmr: true, stake: true, mainRole: true, matchesPlayed: true, nightMatches: true },
      }),
      prisma.team.findMany({
        select: { name: true, player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
      }),
    ]);
    const playerTeam = new Map<string, string>();
    for (const t of teams) {
      for (const pid of [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]) {
        if (pid) playerTeam.set(pid, t.name);
      }
    }
    const header = "Ник,MMR,Стейк,Роль,Матчей сыграно,Ночных матчей,Команда";
    const lines = players.map(p =>
      [p.nick, p.mmr, p.stake, ROLES[p.mainRole] ?? p.mainRole, p.matchesPlayed, p.nightMatches, playerTeam.get(p.id) ?? "—"]
        .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = "﻿" + [header, ...lines].join("\n");
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mixercup1-final-${date}.csv"`,
      },
    });
  }

  const fixNight = req.nextUrl.searchParams.get("fixNight");
  if (fixNight === "1") {
    // Reconstruct nightMatches from scheduledAt of completed matches (00:00–06:59 MSK)
    const allCompleted = await prisma.tournamentMatch.findMany({
      where: { status: { in: ["Completed", "TechLoss"] } },
      select: { homeTeam: true, awayTeam: true, scheduledAt: true },
    });
    const nightMatches = allCompleted.filter(m => {
      const mskHour = (m.scheduledAt.getUTCHours() + 3) % 24;
      return mskHour < 7;
    });
    const teamNames = [...new Set(nightMatches.flatMap(m => [m.homeTeam, m.awayTeam]))];
    const teams = await prisma.team.findMany({
      where: { name: { in: teamNames } },
      select: { name: true, player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true },
    });
    const teamMap = new Map(teams.map(t => [t.name, t]));
    const playerCounts = new Map<string, number>();
    for (const m of nightMatches) {
      for (const teamName of [m.homeTeam, m.awayTeam]) {
        const t = teamMap.get(teamName);
        if (!t) continue;
        for (const pid of [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]) {
          if (pid) playerCounts.set(pid, (playerCounts.get(pid) ?? 0) + 1);
        }
      }
    }
    await prisma.player.updateMany({ where: {}, data: { nightMatches: 0 } });
    for (const [playerId, count] of playerCounts) {
      await prisma.player.updateMany({ where: { id: playerId }, data: { nightMatches: count } });
    }
    return NextResponse.json({
      ok: true,
      completedMatches: allCompleted.length,
      nightMatchesFound: nightMatches.length,
      playersUpdated: playerCounts.size,
    });
  }

  try {
    const result = await recalculateMatchStats();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[cron/recalculate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
