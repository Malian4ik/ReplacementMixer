import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assignSubstitution } from "@/services/substitution.service";
import { z } from "zod";

const Schema = z.object({
  sessionId: z.string(),
  playerId: z.string(),
  judgeName: z.string().min(1),
  /** For multi-slot sessions: which slot to fill */
  slotId: z.string().optional(),
  comment: z.string().optional(),
});

/**
 * POST /api/judge/pick-responder
 * Назначает игрока, который нажал "Готов", не дожидаясь конца волны.
 * Для матч-сессий передаётся slotId чтобы знать в какую команду/роль назначить.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });

  const { sessionId, playerId, judgeName, slotId, comment } = parsed.data;

  const session = await prisma.substitutionSearchSession.findUnique({
    where: { id: sessionId },
    include: { slots: { orderBy: { slotIndex: "asc" } } },
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

  // Resolve slot info — use specific slot if provided (only if still open), otherwise first open slot
  let targetSlot = slotId
    ? (session.slots.find((s) => s.id === slotId && !s.assignedPlayerId)
        ?? session.slots.find((s) => !s.assignedPlayerId)
        ?? null)
    : session.slots.find((s) => !s.assignedPlayerId) ?? null;

  const teamId = (targetSlot as typeof targetSlot & { slotTeamId?: string | null } | null)?.slotTeamId ?? session.teamId;
  const teamName = (targetSlot as typeof targetSlot & { slotTeamName?: string | null } | null)?.slotTeamName ?? session.teamName;
  const neededRole = targetSlot?.neededRole ?? session.neededRole;
  const replacedPlayerId = targetSlot?.replacedPlayerId ?? session.replacedPlayerId ?? undefined;
  const replacedPlayerNick = targetSlot?.replacedPlayerNick ?? session.replacedPlayerNick ?? undefined;

  try {
    await assignSubstitution(poolEntry.id, {
      teamId,
      teamName,
      neededRole,
      replacedPlayerId,
      replacedPlayerNick,
      replacedPlayerMmr: session.replacedPlayerMmr ?? undefined,
      targetAvgMmr: session.targetAvgMmr,
      maxDeviation: session.maxDeviation,
      judgeName,
      comment,
    });

    // Mark the specific slot as assigned
    if (targetSlot) {
      await prisma.substitutionSlot.update({
        where: { id: targetSlot.id },
        data: {
          assignedPlayerId: playerId,
          assignedPoolEntryId: poolEntry.id,
          assignedAt: new Date(),
        },
      });
    }

    // Complete session only when ALL slots are filled (or no slots — single-slot mode)
    const totalSlots = session.slots.length;
    if (totalSlots <= 1) {
      // Single-slot: complete immediately
      await prisma.substitutionSearchSession.update({
        where: { id: sessionId },
        data: { status: "Completed", selectedPlayerId: playerId, selectedPoolEntryId: poolEntry.id },
      });
    } else {
      // Multi-slot: complete when all slots assigned
      const remainingUnassigned = await prisma.substitutionSlot.count({
        where: { sessionId, assignedPlayerId: null },
      });
      if (remainingUnassigned === 0) {
        await prisma.substitutionSearchSession.update({
          where: { id: sessionId },
          data: { status: "Completed", selectedPlayerId: playerId, selectedPoolEntryId: poolEntry.id },
        });
      }
    }

    return NextResponse.json({ ok: true, nick: poolEntry.player.nick, teamName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
