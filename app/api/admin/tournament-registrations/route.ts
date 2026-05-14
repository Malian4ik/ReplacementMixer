import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") ?? "MixerCup #2";

  const tournament = await prisma.adminTournament.findFirst({
    where: { name: { contains: name } },
    select: { id: true, name: true, participantCount: true },
  });

  if (!tournament) {
    const all = await prisma.adminTournament.findMany({ select: { name: true } });
    return NextResponse.json({ error: "Турнир не найден", available: all.map(t => t.name) }, { status: 404 });
  }

  const participations = await prisma.playerTournamentParticipation.findMany({
    where: { tournamentId: tournament.id },
    select: { bidSize: true, balance: true, tournamentStatus: true, qualifyRating: true },
  });

  const total = participations.length;
  const moreThanOne = participations.filter(p => (p.bidSize ?? 0) > 1).length;
  const exactly1 = participations.filter(p => (p.bidSize ?? 0) === 1).length;
  const zero = participations.filter(p => !p.bidSize || p.bidSize === 0).length;

  const byStatus: Record<string, number> = {};
  for (const p of participations) {
    const s = p.tournamentStatus ?? "unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  const bidSizes = participations
    .map(p => p.bidSize)
    .filter((b): b is number => b !== null && b !== undefined)
    .sort((a, b) => b - a);

  return NextResponse.json({
    tournament: tournament.name,
    total,
    moreThanOne,
    exactly1,
    zero,
    byStatus,
    topBids: bidSizes.slice(0, 10),
  });
}
