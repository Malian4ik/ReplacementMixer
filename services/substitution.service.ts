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

// Night = 00:00–07:00 Moscow time (UTC+3)
function isNightTimeMsk(): boolean {
  const now = new Date();
  const mskMinutes = ((now.getUTCHours() + 3) % 24) * 60 + now.getUTCMinutes();
  return mskMinutes < 7 * 60; // 0–419 min = 00:00–06:59 MSK
}

// Pinned players have joinTime >= 2099. New/returned players must go before them.
const PINNED_THRESHOLD = new Date("2099-01-01T00:00:00.000Z");
async function getNextNonPinnedTime(): Promise<Date> {
  const last = await prisma.substitutionPoolEntry.findFirst({
    where: { joinTime: { lt: PINNED_THRESHOLD } },
    orderBy: { joinTime: "desc" },
    select: { joinTime: true },
  });
  return new Date((last ? last.joinTime.getTime() : Date.now()) + 1000);
}
type SlotKey = typeof SLOTS[number];

export async function assignSubstitution(
  poolEntryId: string,
  ctx: AssignContext
) {
  const entry = await prisma.substitutionPoolEntry.findUniqueOrThrow({
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

  await prisma.substitutionPoolEntry.update({
    where: { id: poolEntryId },
    data: {
      status: "Picked",
      assignedTeamId: ctx.teamId,
      pickedTime: new Date(),
      replacedPlayerId: ctx.replacedPlayerId ?? null,
    },
  });

  // Add replaced player to the end of the pool queue and reset their night matches
  if (ctx.replacedPlayerId) {
    const endTime = await getNextNonPinnedTime();

    const existingEntry = await prisma.substitutionPoolEntry.findFirst({
      where: {
        playerId: ctx.replacedPlayerId,
        OR: [{ status: "Active" }, { status: "Picked" }],
      },
    });
    if (existingEntry) {
      await prisma.substitutionPoolEntry.update({
        where: { id: existingEntry.id },
        data: { status: "Active", assignedTeamId: null, pickedTime: null, replacedPlayerId: null, joinTime: endTime },
      });
    } else {
      await prisma.substitutionPoolEntry.create({
        data: {
          playerId: ctx.replacedPlayerId,
          status: "Active",
          source: "returned",
          joinTime: endTime,
        },
      });
    }
    // If replaced player was captain — move captain badge to player with highest stake
    const teamAfter = await prisma.team.findUnique({ where: { id: ctx.teamId } });
    if (teamAfter?.captainId === ctx.replacedPlayerId) {
      const remainingIds = [teamAfter.player1Id, teamAfter.player2Id, teamAfter.player3Id, teamAfter.player4Id, teamAfter.player5Id]
        .filter((pid): pid is string => !!pid && pid !== ctx.replacedPlayerId);
      if (remainingIds.length > 0) {
        const remaining = await prisma.player.findMany({ where: { id: { in: remainingIds } } });
        const newCaptain = remaining.reduce((best, p) => p.stake > best.stake ? p : best, remaining[0]);
        await prisma.team.update({ where: { id: ctx.teamId }, data: { captainId: newCaptain.id } });
      } else {
        await prisma.team.update({ where: { id: ctx.teamId }, data: { captainId: null } });
      }
    }

    // Reset night matches only if replacement happens during night hours (00:00–06:30 MSK)
    if (isNightTimeMsk()) {
      await prisma.player.update({
        where: { id: ctx.replacedPlayerId },
        data: { nightMatches: 0 },
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

export async function returnSubstitutionToQueue(
  poolEntryId: string,
  judgeName?: string,
  comment?: string
) {
  const entry = await prisma.substitutionPoolEntry.findUniqueOrThrow({
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

  await prisma.substitutionPoolEntry.update({
    where: { id: poolEntryId },
    data: {
      status: "Active",
      assignedTeamId: null,
      pickedTime: null,
      replacedPlayerId: null,
      joinTime: await getNextNonPinnedTime(),
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
