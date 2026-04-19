import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/players/clear
// Deletes all tournament data (logs, pool, teams, non-disqualified players).
// Disqualified players are preserved — they are managed separately.
// OWNER only — enforced on client.
export async function POST() {
  // Delete in FK-safe order. Disqualified players are preserved.
  await prisma.matchSubstitutionLog.deleteMany();
  await prisma.waveResponse.deleteMany();
  await prisma.waveCandidate.deleteMany();
  await prisma.substitutionWave.deleteMany();
  await prisma.substitutionSearchSession.deleteMany();
  await prisma.substitutionPoolEntry.deleteMany();
  await prisma.playerTournamentParticipation.deleteMany();
  await prisma.team.deleteMany();
  const result = await prisma.player.deleteMany({ where: { isDisqualified: false } });

  return NextResponse.json({ deleted: result.count });
}
