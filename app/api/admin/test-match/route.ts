import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateActiveGameCache } from "@/services/active-match.service";

const TEST_COMMENT = "__test_match__";

// POST — создать тестовый матч
export async function POST() {
  // Найти игроков Kobz и M#L
  const [kobz, mhl] = await Promise.all([
    prisma.player.findFirst({ where: { nick: { contains: "Kobz" } } }),
    prisma.player.findFirst({ where: { nick: { contains: "M#L" } } }),
  ]);

  if (!kobz) return NextResponse.json({ error: 'Игрок "Kobz" не найден в базе' }, { status: 404 });
  if (!mhl) return NextResponse.json({ error: 'Игрок "M#L" не найден в базе' }, { status: 404 });

  // Найти команды, в которых состоят эти игроки
  const teamWithKobz = await prisma.team.findFirst({
    where: {
      OR: [
        { player1Id: kobz.id }, { player2Id: kobz.id }, { player3Id: kobz.id },
        { player4Id: kobz.id }, { player5Id: kobz.id },
      ],
    },
  });

  const teamWithMhl = await prisma.team.findFirst({
    where: {
      OR: [
        { player1Id: mhl.id }, { player2Id: mhl.id }, { player3Id: mhl.id },
        { player4Id: mhl.id }, { player5Id: mhl.id },
      ],
    },
  });

  // Если игрок не в команде — создаём тестовую команду с ним + 4 случайных игрока
  async function ensureTeam(anchorPlayer: { id: string; nick: string }, suffix: string) {
    if (
      suffix === "A" ? teamWithKobz : teamWithMhl
    ) {
      return suffix === "A" ? teamWithKobz! : teamWithMhl!;
    }

    const others = await prisma.player.findMany({
      where: {
        id: { not: anchorPlayer.id },
        isActiveInDatabase: true,
        isDisqualified: false,
      },
      take: 4,
    });

    const slots = [anchorPlayer.id, ...others.map((p) => p.id)].slice(0, 5);
    const name = `_ТЕСТ ${suffix}_`;

    return prisma.team.upsert({
      where: { name },
      update: {
        player1Id: slots[0] ?? null,
        player2Id: slots[1] ?? null,
        player3Id: slots[2] ?? null,
        player4Id: slots[3] ?? null,
        player5Id: slots[4] ?? null,
      },
      create: {
        name,
        player1Id: slots[0] ?? null,
        player2Id: slots[1] ?? null,
        player3Id: slots[2] ?? null,
        player4Id: slots[3] ?? null,
        player5Id: slots[4] ?? null,
      },
    });
  }

  const homeTeam = await ensureTeam(kobz, "A");
  const awayTeam = await ensureTeam(mhl, "B");

  if (!homeTeam || !awayTeam) {
    return NextResponse.json({ error: "Не удалось создать команды" }, { status: 500 });
  }

  // Снять статус Active со старых тест-матчей
  await prisma.tournamentMatch.updateMany({
    where: { comment: TEST_COMMENT, status: "Active" },
    data: { status: "Completed" },
  });

  // Создать новый тест-матч
  const now = new Date();
  const endsAt = new Date(now.getTime() + 90 * 60 * 1000); // +90 мин

  const match = await prisma.tournamentMatch.create({
    data: {
      round: 1,
      slot: 1,
      homeTeam: homeTeam.name,
      awayTeam: awayTeam.name,
      scheduledAt: now,
      endsAt,
      status: "Active",
      comment: TEST_COMMENT,
    },
  });

  invalidateActiveGameCache();

  return NextResponse.json({
    ok: true,
    matchId: match.id,
    homeTeam: homeTeam.name,
    awayTeam: awayTeam.name,
  });
}

// DELETE — удалить тестовый матч
export async function DELETE() {
  const result = await prisma.tournamentMatch.updateMany({
    where: { comment: TEST_COMMENT, status: "Active" },
    data: { status: "Completed" },
  });

  invalidateActiveGameCache();

  return NextResponse.json({ ok: true, deactivated: result.count });
}
