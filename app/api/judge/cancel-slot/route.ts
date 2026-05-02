import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const Schema = z.object({
  slotId: z.string(),
  judgeName: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });

  const { slotId } = parsed.data;

  const slot = await prisma.substitutionSlot.findUnique({
    where: { id: slotId },
    include: { session: true },
  });

  if (!slot) return NextResponse.json({ error: "Слот не найден" }, { status: 404 });
  if (slot.assignedPlayerId)
    return NextResponse.json({ error: "Слот уже заполнен — нельзя отменить" }, { status: 400 });
  if (slot.session.status !== "Active")
    return NextResponse.json({ error: "Сессия не активна" }, { status: 400 });

  // Remove the slot
  await prisma.substitutionSlot.delete({ where: { id: slotId } });

  // Decrease slotsNeeded by 1 (minimum 0)
  await prisma.substitutionSearchSession.update({
    where: { id: slot.sessionId },
    data: { slotsNeeded: { decrement: 1 } },
  });

  // If no unfilled slots remain → complete the session
  const remaining = await prisma.substitutionSlot.count({
    where: { sessionId: slot.sessionId, assignedPlayerId: null },
  });

  if (remaining === 0) {
    const lastFilled = await prisma.substitutionSlot.findFirst({
      where: { sessionId: slot.sessionId, assignedPlayerId: { not: null } },
      orderBy: { assignedAt: "desc" },
    });
    await prisma.substitutionSearchSession.update({
      where: { id: slot.sessionId },
      data: {
        status: "Completed",
        selectedPlayerId: lastFilled?.assignedPlayerId ?? null,
        selectedPoolEntryId: lastFilled?.assignedPoolEntryId ?? null,
      },
    });
  }

  return NextResponse.json({ ok: true, remainingOpen: remaining });
}
