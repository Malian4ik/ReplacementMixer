import { prisma } from "@/lib/prisma";

export interface LogData {
  actionType: "Assign" | "Return" | "AddToPool";
  matchId?: string;
  teamId?: string;
  teamName?: string;
  neededRole?: number;
  replacedPlayerId?: string;
  replacedPlayerNick?: string;
  replacedPlayerMmr?: number;
  replacementPlayerId?: string;
  replacementPlayerNick?: string;
  replacementPlayerMmr?: number;
  judgeName?: string;
  comment?: string;
  resultStatus: string;
  poolEntryId?: string;
}

export async function createLog(data: LogData) {
  return prisma.matchSubstitutionLog.create({ data });
}
