import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { id, externalId, resetPlayers = true } = await req.json().catch(() => ({}));
  if (!id && !externalId) return NextResponse.json({ error: "id or externalId required" }, { status: 400 });

  const tournament = id
    ? await prisma.adminTournament.findUnique({ where: { id } })
    : await prisma.adminTournament.findUnique({ where: { externalId: String(externalId) } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  // Switch active tournament flag
  await prisma.$transaction([
    prisma.adminTournament.updateMany({ where: {}, data: { isActive: false } }),
    prisma.adminTournament.update({ where: { id: tournament.id }, data: { isActive: true } }),
  ]);

  if (!resetPlayers) {
    return NextResponse.json({ ok: true, activeTournamentId: tournament.id, tournamentName: tournament.name, resetPlayers: false });
  }

  // Get player IDs that participated in this tournament
  const participations = await prisma.playerTournamentParticipation.findMany({
    where: { tournamentId: tournament.id },
    select: { playerId: true },
  });
  const participantIds = participations.map(p => p.playerId);

  // Deactivate all players
  await prisma.player.updateMany({ where: {}, data: { isActiveInDatabase: false } });

  // Activate only participants of this tournament (not disqualified)
  const activated = await prisma.player.updateMany({
    where: { id: { in: participantIds }, isDisqualified: false },
    data: { isActiveInDatabase: true },
  });

  // Reset match stats — fresh start for the new tournament
  await prisma.player.updateMany({ where: {}, data: { matchesPlayed: 0 } });

  // Clear substitution pool (stale entries from previous tournament)
  await prisma.substitutionPoolEntry.updateMany({
    where: { status: "Active" },
    data: { status: "Inactive" },
  });

  const totalPlayers = await prisma.player.count();
  const activePlayers = await prisma.player.count({ where: { isActiveInDatabase: true } });

  return NextResponse.json({
    ok: true,
    activeTournamentId: tournament.id,
    tournamentName: tournament.name,
    participantsActivated: activated.count,
    totalPlayersInDb: totalPlayers,
    activePlayers,
  });
}
