import { NextRequest, NextResponse } from "next/server";
import { importTournamentParticipants } from "@/services/admin-tournament-import.service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({ tournamentId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Нужен tournamentId" }, { status: 400 });
  }
  try {
    const result = await importTournamentParticipants(parsed.data.tournamentId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка импорта";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Получить историю синхронизаций */
export async function GET() {
  const runs = await prisma.adminTournamentSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: { tournament: { select: { name: true } } },
  });
  return NextResponse.json(runs);
}
