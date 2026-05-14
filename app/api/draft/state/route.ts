import { NextRequest, NextResponse } from "next/server";
import { adminLogin, fetchDraftState } from "@/services/admin-source.service";

// In-memory cache (per serverless instance)
let cache: { ts: number; data: unknown } | null = null;
const CACHE_TTL = 10_000; // 10 seconds

export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get("tournamentId") ?? "23";

  try {
    const now = Date.now();
    if (cache && now - cache.ts < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }

    await adminLogin();
    const state = await fetchDraftState(tournamentId);
    if (!state) {
      return NextResponse.json({ error: "Турнир не найден" }, { status: 404 });
    }

    cache = { ts: now, data: state };
    return NextResponse.json(state);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
