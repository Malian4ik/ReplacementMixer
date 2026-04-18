import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const SwapSchema = z.object({
  playerAId: z.string(),
  teamAId: z.string(),
  playerBId: z.string(),
  teamBId: z.string(),
});

const SLOTS = ["player1Id", "player2Id", "player3Id", "player4Id", "player5Id"] as const;
type SlotKey = typeof SLOTS[number];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { playerAId, teamAId, playerBId, teamBId } = SwapSchema.parse(body);

    if (teamAId === teamBId && playerAId === playerBId) {
      return NextResponse.json({ error: "Нельзя поменять игрока самим с собой" }, { status: 400 });
    }

    const [teamA, teamB] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamAId } }),
      prisma.team.findUnique({ where: { id: teamBId } }),
    ]);

    if (!teamA || !teamB) {
      return NextResponse.json({ error: "Команда не найдена" }, { status: 404 });
    }

    // Find which slot each player occupies
    const slotA = SLOTS.find(s => teamA[s] === playerAId);
    const slotB = SLOTS.find(s => teamB[s] === playerBId);

    if (!slotA) return NextResponse.json({ error: "Игрок A не найден в команде A" }, { status: 400 });
    if (!slotB) return NextResponse.json({ error: "Игрок B не найден в команде B" }, { status: 400 });

    // Handle captainId transfers
    const newCaptainA = teamA.captainId === playerAId
      ? playerBId
      : teamA.captainId === playerBId ? playerAId : teamA.captainId;
    const newCaptainB = teamB.captainId === playerBId
      ? playerAId
      : teamB.captainId === playerAId ? playerBId : teamB.captainId;

    if (teamAId === teamBId) {
      // Swap within same team
      await prisma.team.update({
        where: { id: teamAId },
        data: {
          [slotA]: playerBId,
          [slotB as SlotKey]: playerAId,
          captainId: newCaptainA,
        },
      });
    } else {
      // Swap across teams
      await Promise.all([
        prisma.team.update({
          where: { id: teamAId },
          data: { [slotA]: playerBId, captainId: newCaptainA },
        }),
        prisma.team.update({
          where: { id: teamBId },
          data: { [slotB]: playerAId, captainId: newCaptainB },
        }),
      ]);
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
