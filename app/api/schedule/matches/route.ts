import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
