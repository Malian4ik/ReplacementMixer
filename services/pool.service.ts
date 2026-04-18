import { prisma } from "@/lib/prisma";
import { createLog } from "./log.service";

export async function checkNoDuplicate(playerId: string): Promise<void> {
  const existing = await prisma.substitutionPoolEntry.findFirst({
    where: { playerId, status: "Active" },
  });
  if (existing) {
    throw new Error("DUPLICATE");
  }
}

export async function checkNotInTeam(playerId: string): Promise<void> {
  const team = await prisma.team.findFirst({
    where: {
      OR: [
        { player1Id: playerId },
        { player2Id: playerId },
        { player3Id: playerId },
        { player4Id: playerId },
        { player5Id: playerId },
      ],
    },
  });
  if (team) {
    throw new Error("IN_TEAM");
  }
}

export async function addPlayerToSubstitutionPool(
  playerId: string,
  source: string,
  judgeName?: string
) {
  await checkNoDuplicate(playerId);
  await checkNotInTeam(playerId);

  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });

  const entry = await prisma.substitutionPoolEntry.create({
    data: { playerId, source, status: "Active", joinTime: new Date() },
    include: { player: true },
  });

  await createLog({
    actionType: "AddToPool",
    replacedPlayerId: player.id,
    replacedPlayerNick: player.nick,
    judgeName,
    resultStatus: "Added",
    poolEntryId: entry.id,
  });

  return entry;
}
