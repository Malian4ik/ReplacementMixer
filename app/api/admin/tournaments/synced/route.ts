import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const tournaments = await prisma.adminTournament.findMany({
    where: { lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: "desc" },
    select: { id: true, externalId: true, name: true, isActive: true, lastSyncedAt: true, participantCount: true, startDate: true },
  });
  return NextResponse.json(tournaments);
}
