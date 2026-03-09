import { prisma } from "@/lib/prisma";
import { createLog } from "./log.service";

export async function checkNoDuplicate(playerId: string): Promise<void> {
  const existing = await prisma.replacementPoolEntry.findFirst({
    where: { playerId, status: "Active" },
  });
  if (existing) {
    throw new Error("DUPLICATE");
  }
}

export async function addPlayerToReplacementPool(
  playerId: string,
  source: string,
  judgeName?: string
) {
  await checkNoDuplicate(playerId);

  const player = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });

  const entry = await prisma.replacementPoolEntry.create({
    data: { playerId, source, status: "Active" },
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
