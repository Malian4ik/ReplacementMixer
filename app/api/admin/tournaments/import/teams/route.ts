import { NextRequest, NextResponse } from "next/server";
import { importTournamentTeams } from "@/services/admin-tournament-import.service";
import { z } from "zod";

const Schema = z.object({ tournamentId: z.string().min(1) });

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Нужен tournamentId" }, { status: 400 });
  }
  try {
    const result = await importTournamentTeams(parsed.data.tournamentId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка импорта команд";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
