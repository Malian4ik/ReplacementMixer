import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/judge/active-session?teamId=X
 *  Возвращает активную сессию поиска для команды вместе с откликнувшимися.
 */
export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ session: null });

  const session = await prisma.substitutionSearchSession.findFirst({
    where: { teamId, status: "Active" },
    include: {
      waves: {
        where: { status: "Active" },
        orderBy: { waveNumber: "desc" },
        take: 1,
        include: {
          responses: {
            include: { player: { select: { id: true, nick: true, mmr: true, mainRole: true, flexRole: true, wallet: true } } },
            orderBy: { clickedAt: "asc" },
          },
          candidates: {
            include: { player: { select: { nick: true } } },
            orderBy: { queuePosition: "asc" },
          },
        },
      },
    },
  });

  return NextResponse.json({ session });
}

/** DELETE /api/judge/active-session?teamId=X  — отмена сессии */
export async function DELETE(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get("teamId");
  if (!teamId) return NextResponse.json({ error: "teamId required" }, { status: 400 });

  const session = await prisma.substitutionSearchSession.findFirst({
    where: { teamId, status: "Active" },
  });
  if (!session) return NextResponse.json({ error: "Нет активной сессии" }, { status: 404 });

  await prisma.substitutionSearchSession.update({
    where: { id: session.id },
    data: { status: "Cancelled" },
  });
  return NextResponse.json({ ok: true, sessionId: session.id });
}
