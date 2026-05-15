import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ROLES: Record<number, string> = { 1: "Carry", 2: "Mid", 3: "Offlane", 4: "Soft Sup", 5: "Hard Sup" };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format") ?? "json";
  const tournamentName = searchParams.get("tournament") ?? "Mixer Cup #1";

  // Find MixerCup #1 to get per-tournament bid sizes
  const tournament = await prisma.adminTournament.findFirst({
    where: { name: { contains: tournamentName } },
    select: { id: true, name: true },
  });

  const [players, teams, participations] = await Promise.all([
    prisma.player.findMany({
      where: { isActiveInDatabase: true },
      orderBy: [{ matchesPlayed: "desc" }, { nightMatches: "desc" }],
      select: {
        id: true, nick: true, mmr: true, stake: true, mainRole: true,
        matchesPlayed: true, nightMatches: true,
      },
    }),
    prisma.team.findMany({
      select: {
        name: true,
        player1Id: true, player2Id: true, player3Id: true, player4Id: true, player5Id: true,
      },
    }),
    tournament
      ? prisma.playerTournamentParticipation.findMany({
          where: { tournamentId: tournament.id },
          select: { playerId: true, bidSize: true, qualifyRating: true },
        })
      : Promise.resolve([]),
  ]);

  // Build playerId → teamName map
  const playerTeam = new Map<string, string>();
  for (const t of teams) {
    for (const pid of [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id]) {
      if (pid) playerTeam.set(pid, t.name);
    }
  }

  // Build playerId → bidSize from the specific tournament
  const playerBid = new Map<string, number>();
  for (const p of participations) {
    if (p.bidSize != null) playerBid.set(p.playerId, p.bidSize);
  }

  const rows = players.map(p => ({
    nick: p.nick,
    mmr: p.mmr,
    stake: playerBid.get(p.id) ?? p.stake,
    role: ROLES[p.mainRole] ?? String(p.mainRole),
    matchesPlayed: p.matchesPlayed,
    nightMatches: p.nightMatches,
    team: playerTeam.get(p.id) ?? "—",
  }));

  if (format === "csv") {
    const header = "Ник,MMR,Стейк,Роль,Матчей сыграно,Ночных матчей,Команда";
    const lines = rows.map(r =>
      [r.nick, r.mmr, r.stake, r.role, r.matchesPlayed, r.nightMatches, r.team]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [header, ...lines].join("\n");
    return new Response("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="mixercup1-stats-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return NextResponse.json({ total: rows.length, exportedAt: new Date().toISOString(), rows });
}
