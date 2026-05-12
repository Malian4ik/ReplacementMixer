import { NextRequest, NextResponse } from "next/server";
import { importTournamentTeams } from "@/services/admin-tournament-import.service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  tournamentId: z.string().min(1),
  localTournamentId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Нужен tournamentId" }, { status: 400 });
  }
  try {
    // Resolve localTournamentId: explicit param > find by externalId > active tournament
    let localId = parsed.data.localTournamentId;
    if (!localId) {
      const found = await prisma.adminTournament.findUnique({
        where: { externalId: String(parsed.data.tournamentId) },
        select: { id: true },
      });
      localId = found?.id;
    }
    const result = await importTournamentTeams(parsed.data.tournamentId, localId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка импорта команд";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
