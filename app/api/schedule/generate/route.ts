import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MATCH_MS = 1.5 * 60 * 60 * 1000;
const ROUND_MS = 19.5 * 60 * 60 * 1000;

function generateRoundRobin(teams: string[]) {
  const n = teams.length;
  const arr = [...teams.slice(1)];
  const fixed = teams[0];
  const matches: { round: number; slot: number; homeTeam: string; awayTeam: string; scheduledAt: Date; endsAt: Date }[] = [];

  const baseMs = Date.UTC(2026, 2, 13, 21, 0, 0); // 2026-03-14 00:00 MSK

  for (let r = 0; r < n - 1; r++) {
    const roundStart = baseMs + r * ROUND_MS;
    const pairs: { home: string; away: string }[] = [];

    pairs.push(r % 2 === 0 ? { home: fixed, away: arr[0] } : { home: arr[0], away: fixed });
    for (let i = 1; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      pairs.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }

    pairs.forEach((p, slot) => {
      const start = new Date(roundStart + slot * MATCH_MS);
      matches.push({ round: r + 1, slot, homeTeam: p.home, awayTeam: p.away, scheduledAt: start, endsAt: new Date(start.getTime() + MATCH_MS) });
    });

    arr.push(arr.shift()!);
  }
  return matches;
}

export async function POST(req: NextRequest) {
  try {
    const { teams, clearExisting } = await req.json() as { teams?: string[]; clearExisting?: boolean };

    let teamNames = teams;
    if (!teamNames || teamNames.length === 0) {
      const dbTeams = await prisma.team.findMany({ select: { name: true } });
      teamNames = dbTeams.map(t => t.name);
    }

    if (teamNames.length < 2) return NextResponse.json({ error: "Нужно минимум 2 команды" }, { status: 400 });
    if (teamNames.length % 2 !== 0) teamNames.push("BYE");

    if (clearExisting) {
      await prisma.tournamentMatch.deleteMany({});
    } else {
      const existing = await prisma.tournamentMatch.count();
      if (existing > 0) return NextResponse.json({ error: "Расписание уже существует. Передайте clearExisting: true для пересоздания." }, { status: 409 });
    }

    const matches = generateRoundRobin(teamNames);
    await prisma.tournamentMatch.createMany({ data: matches });

    return NextResponse.json({ ok: true, created: matches.length, teams: teamNames.length, rounds: teamNames.length - 1 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
