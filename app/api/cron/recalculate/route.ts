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

  try {
    const result = await recalculateMatchStats();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Error";
    console.error("[cron/recalculate]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
