import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function deleteOptionalTable(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], table: string) {
  try {
    await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
  } catch {
    // Some production databases still have/don't have legacy Discord-wave tables.
  }
}

// POST /api/players/clear
// Deletes tournament data in FK-safe order. Disqualified players are preserved.
export async function POST() {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await deleteOptionalTable(tx, "ReplacementWaveResponse");
      await deleteOptionalTable(tx, "ReplacementWaveCandidate");
      await deleteOptionalTable(tx, "ReplacementWave");
      await tx.$executeRawUnsafe(`DELETE FROM "NightMatchEntry" WHERE "playerId" IN (SELECT "id" FROM "Player" WHERE "isDisqualified" = 0)`);

      await tx.matchSubstitutionLog.deleteMany();
      await tx.waveResponse.deleteMany();
      await tx.waveCandidate.deleteMany();
      await tx.substitutionWave.deleteMany();
      await tx.substitutionSlot.deleteMany();
      await tx.substitutionSearchSession.deleteMany();
      await tx.substitutionPoolEntry.deleteMany();
      await tx.adminTournamentSyncRun.deleteMany();
      await tx.playerTournamentParticipation.deleteMany();
      await tx.adminTournament.deleteMany();
      await tx.tournamentMatch.deleteMany();
      await tx.team.deleteMany();

      return tx.player.deleteMany({ where: { isDisqualified: false } });
    });

    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("CLEAR_PLAYERS_FAILED", error);
    return NextResponse.json({ error: "CLEAR_PLAYERS_FAILED" }, { status: 500 });
  }
}
