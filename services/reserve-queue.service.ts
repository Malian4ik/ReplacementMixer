import { prisma } from "@/lib/prisma";
import type { ReplacementPoolEntry } from "@/types";
import type { Prisma } from "@/app/generated/prisma/client";

export interface EligibleReserveQueueItem extends ReplacementPoolEntry {
  queuePosition: number;
}

type DbLike = Prisma.TransactionClient | typeof prisma;

function getDb(tx?: DbLike) {
  return tx ?? prisma;
}

export async function getEligibleReserveQueue(tx?: DbLike): Promise<EligibleReserveQueueItem[]> {
  const db = getDb(tx);
  const rawEntries = await db.replacementPoolEntry.findMany({
    where: {
      status: "Active",
      player: {
        isActiveInDatabase: true,
        discordUserId: { not: null },
      },
    },
    include: { player: true },
    orderBy: { joinTime: "asc" },
  });

  const teams = await db.team.findMany({
    select: {
      player1Id: true,
      player2Id: true,
      player3Id: true,
      player4Id: true,
      player5Id: true,
    },
  });

  const inTeamIds = new Set(
    teams.flatMap((team) =>
      [team.player1Id, team.player2Id, team.player3Id, team.player4Id, team.player5Id].filter(Boolean) as string[]
    )
  );

  const entries = rawEntries
    .filter((entry) => !inTeamIds.has(entry.playerId))
    .map((entry, index) => ({
      ...(entry as unknown as ReplacementPoolEntry),
      queuePosition: index + 1,
    }));

  return entries;
}
