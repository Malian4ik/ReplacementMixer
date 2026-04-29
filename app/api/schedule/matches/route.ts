import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MATCH_MS = 1.5 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { round, homeTeam, awayTeam, scheduledAt } = await req.json() as {
      round: number;
      homeTeam: string;
      awayTeam: string;
      scheduledAt: string; // "YYYY-MM-DDTHH:mm" в МСК (UTC+3)
    };

    if (!round || !homeTeam?.trim() || !awayTeam?.trim() || !scheduledAt) {
      return NextResponse.json({ error: "Нужны round, homeTeam, awayTeam, scheduledAt" }, { status: 400 });
    }
    if (homeTeam.trim() === awayTeam.trim()) {
      return NextResponse.json({ error: "Команды не могут совпадать" }, { status: 400 });
    }

    const start = new Date(scheduledAt + ":00+03:00");
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: "Неверный формат времени" }, { status: 400 });
    }

    const end = new Date(start.getTime() + MATCH_MS);
    const slot = await prisma.tournamentMatch.count({ where: { round } });

    const match = await prisma.tournamentMatch.create({
      data: { round, slot, homeTeam: homeTeam.trim(), awayTeam: awayTeam.trim(), scheduledAt: start, endsAt: end },
    });

    return NextResponse.json(match, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const result = await prisma.tournamentMatch.deleteMany({});
    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const view = req.nextUrl.searchParams.get("view") ?? "all"; // all | upcoming | live | today
    const now = new Date();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = {};

    if (view === "live") {
      where = { scheduledAt: { lte: now }, endsAt: { gte: now }, status: { in: ["Scheduled", "Live"] } };
    } else if (view === "upcoming") {
      const in4h = new Date(now.getTime() + 4 * 60 * 60 * 1000);
      where = { scheduledAt: { gte: now, lte: in4h } };
    } else if (view === "today") {
      const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(now); dayEnd.setHours(23, 59, 59, 999);
      where = { scheduledAt: { gte: dayStart, lte: dayEnd } };
    }

    const matches = await prisma.tournamentMatch.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { slot: "asc" }],
      take: view === "all" ? undefined : 50,
    });

    return NextResponse.json(matches);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
