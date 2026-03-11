import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/players/clear
// Deletes ALL logs, pool entries, teams, and players (full reset). OWNER only — enforced on client.
export async function POST() {
  // Must delete in FK-safe order: logs → pool entries → teams → players
  await prisma.matchReplacementLog.deleteMany();
  await prisma.replacementPoolEntry.deleteMany();
  await prisma.team.deleteMany();
  const result = await prisma.player.deleteMany();

  return NextResponse.json({ deleted: result.count });
}
