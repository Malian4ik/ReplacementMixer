import { prisma } from "@/lib/prisma";
import { createLog } from "./log.service";

export interface AssignContext {
  matchId?: string;
  teamId: string;
  teamName: string;
  neededRole: number;
  replacedPlayerId?: string;   // empty / undefined = filling an empty slot
  replacedPlayerNick?: string;
  replacedPlayerMmr?: number;
  targetAvgMmr: number;
  maxDeviation: number;
  judgeName?: string;
  comment?: string;
}

const SLOTS = ["player1Id", "player2Id", "player3Id", "player4Id", "player5Id"] as const;
type SlotKey = typeof SLOTS[number];

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

  // Check we won't exceed 5 players
  const team = await prisma.team.findUniqueOrThrow({ where: { id: ctx.teamId } });

  let slotKey: SlotKey | undefined;

  if (ctx.replacedPlayerId) {
    // Replace an existing player — find their slot
    slotKey = SLOTS.find((k) => team[k] === ctx.replacedPlayerId);
    if (!slotKey) throw new Error("PLAYER_NOT_IN_TEAM");
  } else {
    // Fill an empty slot — check there is one
    slotKey = SLOTS.find((k) => team[k] === null);
    if (!slotKey) throw new Error("TEAM_FULL");
  }

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
      replacedPlayerId: ctx.replacedPlayerId ?? null,
    },
  });

  // If the replaced player had an active/picked pool entry, re-activate it (end of queue)
  if (ctx.replacedPlayerId) {
    const replacedEntry = await prisma.replacementPoolEntry.findFirst({
      where: {
        playerId: ctx.replacedPlayerId,
        OR: [{ status: "Active" }, { status: "Picked" }],
      },
    });
    if (replacedEntry) {
      await prisma.replacementPoolEntry.update({
        where: { id: replacedEntry.id },
        data: { status: "Active", assignedTeamId: null, pickedTime: null, replacedPlayerId: null, joinTime: new Date() },
      });
    }
  }

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

  // Remove replacement player from the team (set their slot to null)
  if (entry.assignedTeamId && entry.status === "Picked") {
    const team = await prisma.team.findUnique({ where: { id: entry.assignedTeamId } });
    if (team) {
      const slotKey = SLOTS.find((k) => team[k] === entry.playerId);
      if (slotKey) {
        await prisma.team.update({
          where: { id: entry.assignedTeamId },
          data: { [slotKey]: null },
        });
      }
    }
  }

  await prisma.replacementPoolEntry.update({
    where: { id: poolEntryId },
    data: {
      status: "Active",
      assignedTeamId: null,
      pickedTime: null,
      replacedPlayerId: null,
      joinTime: new Date(),
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
