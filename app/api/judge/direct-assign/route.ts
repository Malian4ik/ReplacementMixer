import { NextRequest, NextResponse } from "next/server";
import { assignSubstitution } from "@/services/substitution.service";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  poolEntryId: z.string(),
  teamId: z.string(),
  teamName: z.string(),
  replacedPlayerId: z.string().optional(),
  neededRole: z.number().int().min(1).max(5),
  judgeName: z.string().min(1),
  targetAvgMmr: z.number(),
  maxDeviation: z.number().default(1000),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });

  const { poolEntryId, teamId, teamName, replacedPlayerId, neededRole, judgeName, targetAvgMmr, maxDeviation } = parsed.data;

  const poolEntry = await prisma.substitutionPoolEntry.findUnique({
    where: { id: poolEntryId },
    include: { player: true },
  });
  if (!poolEntry || poolEntry.status !== "Active") {
    return NextResponse.json({ error: "Игрок не найден в активном пуле" }, { status: 404 });
  }

  const replacedPlayer = replacedPlayerId
    ? await prisma.player.findUnique({ where: { id: replacedPlayerId }, select: { nick: true, mmr: true } })
    : null;

  try {
    await assignSubstitution(poolEntryId, {
      teamId,
      teamName,
      neededRole,
      replacedPlayerId,
      replacedPlayerNick: replacedPlayer?.nick,
      replacedPlayerMmr: replacedPlayer?.mmr,
      targetAvgMmr,
      maxDeviation,
      judgeName,
    });
    return NextResponse.json({ ok: true, nick: poolEntry.player.nick });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
