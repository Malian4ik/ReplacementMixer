import { prisma } from "@/lib/prisma";
import { createLog, LogData } from "./log.service";

export interface AssignContext {
  matchId?: string;
  teamId: string;
  teamName: string;
  neededRole: number;
  replacedPlayerId: string;
  replacedPlayerNick: string;
  replacedPlayerMmr: number;
  targetAvgMmr: number;
  maxDeviation: number;
  judgeName?: string;
  comment?: string;
}

export async function assignReplacement(
  poolEntryId: string,
  ctx: AssignContext
) {
  const entry = await prisma.replacementPoolEntry.findUniqueOrThrow({
    where: { id: poolEntryId },
    include: { player: true },
  });

  if (entry.status !== "Active") {
    throw new Error("ENTRY_NOT_ACTIVE");
  }

  const team = await prisma.team.findUniqueOrThrow({ where: { id: ctx.teamId } });

  // Find which slot has the replaced player
  const slotKey = (["player1Id", "player2Id", "player3Id", "player4Id", "player5Id"] as const).find(
    (k) => team[k] === ctx.replacedPlayerId
  );

  if (!slotKey) throw new Error("PLAYER_NOT_IN_TEAM");

  await prisma.team.update({
    where: { id: ctx.teamId },
    data: { [slotKey]: entry.playerId },
  });

  await prisma.replacementPoolEntry.update({
    where: { id: poolEntryId },
    data: {
      status: "Picked",
      assignedTeamId: ctx.teamId,
      pickedTime: new Date(),
    },
  });

  await createLog({
    actionType: "Assign",
    matchId: ctx.matchId,
    teamId: ctx.teamId,
    teamName: ctx.teamName,
    neededRole: ctx.neededRole,
    replacedPlayerId: ctx.replacedPlayerId,
    replacedPlayerNick: ctx.replacedPlayerNick,
    replacedPlayerMmr: ctx.replacedPlayerMmr,
    replacementPlayerId: entry.player.id,
    replacementPlayerNick: entry.player.nick,
    replacementPlayerMmr: entry.player.mmr,
    judgeName: ctx.judgeName,
    comment: ctx.comment,
    resultStatus: "Assigned",
    poolEntryId,
  });

  return entry;
}

export async function returnReplacementToQueue(
  poolEntryId: string,
  judgeName?: string,
  comment?: string
) {
  const entry = await prisma.replacementPoolEntry.findUniqueOrThrow({
    where: { id: poolEntryId },
    include: { player: true },
  });

  // If assigned to a team, revert the swap
  if (entry.assignedTeamId && entry.status === "Picked") {
    const team = await prisma.team.findUnique({ where: { id: entry.assignedTeamId } });
    if (team) {
      const slotKey = (["player1Id", "player2Id", "player3Id", "player4Id", "player5Id"] as const).find(
        (k) => team[k] === entry.playerId
      );
      // We don't have the original player stored here, just re-activate entry
      // The judge will handle roster manually if needed
    }
  }

  await prisma.replacementPoolEntry.update({
    where: { id: poolEntryId },
    data: {
      status: "Active",
      assignedTeamId: null,
      pickedTime: null,
    },
  });

  await createLog({
    actionType: "Return",
    replacementPlayerId: entry.player.id,
    replacementPlayerNick: entry.player.nick,
    replacementPlayerMmr: entry.player.mmr,
    judgeName,
    comment,
    resultStatus: "Returned",
    poolEntryId,
  });

  return entry;
}
