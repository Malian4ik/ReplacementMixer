import { NextResponse } from "next/server";
import { fetchActiveGame } from "@/services/active-match.service";

/** GET /api/schedule/matches/active
 *  Returns the currently active tournament match with team rosters.
 *  Result is cached for 2 minutes inside the service.
 *  Returns null (200) when no active match is found.
 */
export async function GET() {
  try {
    const game = await fetchActiveGame();
    return NextResponse.json(game ?? null);
  } catch (err) {
    console.error("[GET /api/schedule/matches/active]", err);
    return NextResponse.json(null);
  }
}
