import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/players/clear
// Deletes all tournament data (logs, pool, teams, non-disqualified players).
// Disqualified players are preserved — they are managed separately.
// OWNER only — enforced on client.
export async function POST() {
  // Must delete in FK-safe order: logs → pool entries → teams → players
  await prisma.matchSubstitutionLog.deleteMany();
  await prisma.substitutionPoolEntry.deleteMany();
  await prisma.team.deleteMany();
  // Keep disqualified players — they persist across tournaments
  const result = await prisma.player.deleteMany({ where: { isDisqualified: false } });

  return NextResponse.json({ deleted: result.count });
}
