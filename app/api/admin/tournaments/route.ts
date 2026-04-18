import { NextResponse } from "next/server";
import { getOrFetchTournamentList } from "@/services/admin-tournament-import.service";

export async function GET() {
  try {
    const tournaments = await getOrFetchTournamentList();
    return NextResponse.json(tournaments);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
