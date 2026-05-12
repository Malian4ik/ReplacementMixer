import { NextRequest, NextResponse } from "next/server";
import { syncPoolFromAdminWaitingList } from "@/services/admin-tournament-import.service";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { tournamentId, localTournamentId } = await req.json().catch(() => ({}));
  if (!tournamentId)
    return NextResponse.json({ error: "tournamentId required" }, { status: 400 });
  try {
    // Resolve localTournamentId: explicit param > find by externalId
    let localId = localTournamentId as string | undefined;
    if (!localId) {
      const found = await prisma.adminTournament.findUnique({
        where: { externalId: String(tournamentId) },
        select: { id: true },
      });
      localId = found?.id;
    }
    const result = await syncPoolFromAdminWaitingList(String(tournamentId), localId);
    return NextResponse.json(result);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
