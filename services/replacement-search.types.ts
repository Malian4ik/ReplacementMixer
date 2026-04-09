export interface StartReplacementSearchInput {
  teamQuery: string;
  replacedPlayerQuery?: string;
  neededRole?: number;
  matchId?: string;
  comment?: string;
  triggeredByDiscordUserId: string;
  triggeredByName: string;
  replacementsChannelId: string;
}

export interface ReplacementSearchContext {
  teamId: string;
  teamName: string;
  neededRole: number;
  replacedPlayerId?: string;
  replacedPlayerNick?: string;
  replacedPlayerMmr?: number;
  currentTeamAvgMmr: number;
  currentPlayerCount: number;
  targetAvgMmr: number;
  maxDeviation: number;
}

export interface WaveAnnouncementCandidate {
  playerId: string;
  nick: string;
  discordUserId: string;
  queuePosition: number;
  mmr: number;
  stake: number;
}

export interface WaveAnnouncementPayload {
  sessionId: string;
  waveId: string;
  waveNumber: number;
  channelId: string;
  teamName: string;
  neededRole: number;
  replacedPlayerNick?: string;
  matchId?: string;
  comment?: string;
  candidates: WaveAnnouncementCandidate[];
  expiresAt: Date;
}

export interface WaveResultPayload {
  sessionId: string;
  waveId: string;
  waveNumber: number;
  channelId: string;
  teamName: string;
  message: string;
}

export interface DiscordReplacementTransport {
  publishWave(payload: WaveAnnouncementPayload): Promise<{ messageId: string }>;
  publishWaveResult(payload: WaveResultPayload): Promise<void>;
}
