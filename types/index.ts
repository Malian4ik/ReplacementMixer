export type RoleNumber = 1 | 2 | 3 | 4 | 5;

export interface Player {
  id: string;
  nick: string;
  mmr: number;
  stake: number;
  mainRole: RoleNumber;
  flexRole: RoleNumber | null;
  telegramId: string | null;
  wallet: string | null;
  nightMatches: number;
  isActiveInDatabase: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  name: string;
  player1Id: string | null;
  player2Id: string | null;
  player3Id: string | null;
  player4Id: string | null;
  player5Id: string | null;
  avgMmr: number;
  players?: (Player | null)[];
  createdAt: string;
  updatedAt: string;
}

export interface ReplacementPoolEntry {
  id: string;
  playerId: string;
  player: Player;
  status: "Active" | "Picked" | "Inactive";
  joinTime: string;
  assignedTeamId: string | null;
  replacedPlayerId: string | null;
  pickedTime: string | null;
  source: "reduction" | "manual_add" | "returned" | "transferred_from_main_pool";
  createdAt: string;
  updatedAt: string;
}

export interface CandidateScore {
  poolEntryId: string;
  playerId: string;
  nick: string;
  mmr: number;
  stake: number;
  mainRole: RoleNumber;
  flexRole: RoleNumber | null;
  stakeNorm: number;
  mmrNorm: number;
  roleFit: number;
  baseScore: number;
  teamMmrAfter: number;
  balanceFactor: number;
  subScore: number;
}

export interface MatchReplacementLog {
  id: string;
  timestamp: string;
  actionType: "Assign" | "Return" | "AddToPool";
  matchId: string | null;
  teamId: string | null;
  teamName: string | null;
  neededRole: RoleNumber | null;
  replacedPlayerId: string | null;
  replacedPlayerNick: string | null;
  replacedPlayerMmr: number | null;
  replacementPlayerId: string | null;
  replacementPlayerNick: string | null;
  replacementPlayerMmr: number | null;
  judgeName: string | null;
  comment: string | null;
  resultStatus: string;
  poolEntryId: string | null;
  createdAt: string;
}
