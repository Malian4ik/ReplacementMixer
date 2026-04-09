import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/app/generated/prisma/client";

type DbLike = Prisma.TransactionClient | typeof prisma;

function getDb(tx?: DbLike) {
  return tx ?? prisma;
}

export async function getTargetAverageMmr(tx?: DbLike): Promise<number> {
  const db = getDb(tx);
  const teams = await db.team.findMany();
  if (teams.length === 0) return 0;

  const playerIds = [
    ...new Set(
      teams.flatMap((team) =>
        [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id].filter(Boolean) as string[]
      )
    ),
  ];

  if (playerIds.length === 0) return 0;

  const players = await db.player.findMany({
    where: { id: { in: playerIds } },
    select: { mmr: true },
  });

  if (players.length === 0) return 0;

  const totalMmr = players.reduce((sum, player) => sum + player.mmr, 0);
  return Math.round(totalMmr / players.length);
}
