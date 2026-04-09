export interface RemoteTournamentSummary {
  adminTournamentId: string;
  name: string;
  type: string | null;
  status: string | null;
  applicationTime: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface RemoteParticipantListItem {
  adminParticipantId: string;
  nickname: string;
  tournamentLabel: string;
  status: string | null;
  bidSize: number | null;
  balance: number | null;
  queuePosition: number | null;
}

export interface RemoteParticipantDetail extends RemoteParticipantListItem {
  adminUserId: string;
  qualifyRating: number | null;
}

export interface RemoteUserProfile {
  adminUserId: string;
  nickname: string;
  telegram: string | null;
  discordId: string | null;
  wallet: string | null;
  rating: number | null;
  preferredRoles: string[];
  participationCount: number;
}

export interface ImportAdminTournamentResult {
  syncRunId: string;
  tournamentId: string;
  adminTournamentId: string;
  tournamentName: string;
  createdPlayers: number;
  updatedPlayers: number;
  matchedByAdminUserId: number;
  matchedByWallet: number;
  matchedByDiscordId: number;
  matchedByFallback: number;
  failedCount: number;
}
