import { NextResponse } from "next/server";
import { fetchActiveGame } from "@/services/active-match.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** GET /api/schedule/matches/active
 *  Returns the currently active tournament match with team rosters.
 *  Result is cached briefly inside the service.
 *  Returns null (200) when no active match is found.
 */
export async function GET() {
  try {
    const game = await fetchActiveGame();
    return NextResponse.json(game ?? null, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err) {
    console.error("[GET /api/schedule/matches/active]", err);
    return NextResponse.json(null, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  }
}
