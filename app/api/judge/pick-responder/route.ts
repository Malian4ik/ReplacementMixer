import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assignSubstitution } from "@/services/substitution.service";
import { z } from "zod";

const Schema = z.object({
  sessionId: z.string(),
  playerId: z.string(),
  judgeName: z.string().min(1),
  comment: z.string().optional(),
});

/**
 * POST /api/judge/pick-responder
 * Назначает игрока, который нажал "Готов", не дожидаясь конца волны.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });

  const { sessionId, playerId, judgeName, comment } = parsed.data;

  const session = await prisma.substitutionSearchSession.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.status !== "Active") {
    return NextResponse.json({ error: "Сессия не активна" }, { status: 400 });
  }

  // Find pool entry for this player
  const poolEntry = await prisma.substitutionPoolEntry.findFirst({
    where: { playerId, status: "Active" },
    include: { player: true },
  });
  if (!poolEntry) {
    return NextResponse.json({ error: "Игрок не найден в активном пуле" }, { status: 404 });
  }

  try {
    await assignSubstitution(poolEntry.id, {
      teamId: session.teamId,
      teamName: session.teamName,
      neededRole: session.neededRole,
      replacedPlayerId: session.replacedPlayerId ?? undefined,
      replacedPlayerNick: session.replacedPlayerNick ?? undefined,
      replacedPlayerMmr: session.replacedPlayerMmr ?? undefined,
      targetAvgMmr: session.targetAvgMmr,
      maxDeviation: session.maxDeviation,
      judgeName,
      comment,
    });

    // Mark session completed
    await prisma.substitutionSearchSession.update({
      where: { id: sessionId },
      data: { status: "Completed", selectedPlayerId: playerId, selectedPoolEntryId: poolEntry.id },
    });

    return NextResponse.json({ ok: true, nick: poolEntry.player.nick });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
