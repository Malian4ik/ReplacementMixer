import { NextRequest, NextResponse } from "next/server";
import { syncPoolFromAdminWaitingList } from "@/services/admin-tournament-import.service";

export async function POST(req: NextRequest) {
  const { tournamentId } = await req.json().catch(() => ({}));
  if (!tournamentId)
    return NextResponse.json({ error: "tournamentId required" }, { status: 400 });
  try {
    const result = await syncPoolFromAdminWaitingList(String(tournamentId));
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
