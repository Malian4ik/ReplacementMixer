import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const tournament = await prisma.adminTournament.findUnique({ where: { id } });
  if (!tournament) return NextResponse.json({ error: "Tournament not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.adminTournament.updateMany({ where: {}, data: { isActive: false } }),
    prisma.adminTournament.update({ where: { id }, data: { isActive: true } }),
  ]);

  return NextResponse.json({ ok: true, activeTournamentId: id });
}
