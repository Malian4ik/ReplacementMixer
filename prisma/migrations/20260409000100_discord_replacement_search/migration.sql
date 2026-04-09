ALTER TABLE "Player" ADD COLUMN "discordUserId" TEXT;

CREATE UNIQUE INDEX "Player_discordUserId_key" ON "Player"("discordUserId");

CREATE TABLE "ReplacementSearchSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "teamId" TEXT NOT NULL,
  "teamName" TEXT NOT NULL,
  "matchId" TEXT,
  "neededRole" INTEGER NOT NULL,
  "replacedPlayerId" TEXT,
  "replacedPlayerNick" TEXT,
  "replacedPlayerMmr" INTEGER,
  "currentTeamAvgMmr" INTEGER NOT NULL,
  "currentPlayerCount" INTEGER NOT NULL,
  "targetAvgMmr" INTEGER NOT NULL,
  "maxDeviation" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "currentWaveNumber" INTEGER NOT NULL DEFAULT 0,
  "failureReason" TEXT,
  "triggeredByDiscordUserId" TEXT,
  "triggeredByName" TEXT,
  "discordChannelId" TEXT NOT NULL,
  "selectedPlayerId" TEXT,
  "selectedPoolEntryId" TEXT,
  "selectedAt" DATETIME,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplacementSearchSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReplacementSearchSession_replacedPlayerId_fkey" FOREIGN KEY ("replacedPlayerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReplacementSearchSession_selectedPlayerId_fkey" FOREIGN KEY ("selectedPlayerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReplacementSearchSession_selectedPoolEntryId_fkey" FOREIGN KEY ("selectedPoolEntryId") REFERENCES "ReplacementPoolEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ReplacementSearchWave" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "waveNumber" INTEGER NOT NULL,
  "discordChannelId" TEXT NOT NULL,
  "discordMessageId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "completionReason" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "processingStartedAt" DATETIME,
  "completedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplacementSearchWave_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReplacementSearchSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ReplacementWaveCandidate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "waveId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "poolEntryId" TEXT NOT NULL,
  "discordUserId" TEXT NOT NULL,
  "queuePosition" INTEGER NOT NULL,
  "wasPinged" BOOLEAN NOT NULL DEFAULT true,
  "respondedReady" BOOLEAN NOT NULL DEFAULT false,
  "readyAt" DATETIME,
  "wasSelected" BOOLEAN NOT NULL DEFAULT false,
  "selectionRank" INTEGER,
  "score" REAL,
  "baseScore" REAL,
  "stakeNorm" REAL,
  "mmrNorm" REAL,
  "roleFit" REAL,
  "balanceFactor" REAL,
  "teamMmrAfter" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplacementWaveCandidate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReplacementSearchSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReplacementWaveCandidate_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "ReplacementSearchWave" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReplacementWaveCandidate_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReplacementWaveCandidate_poolEntryId_fkey" FOREIGN KEY ("poolEntryId") REFERENCES "ReplacementPoolEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ReplacementWaveResponse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "waveId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "discordUserId" TEXT NOT NULL,
  "interactionId" TEXT,
  "readyAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReplacementWaveResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReplacementSearchSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReplacementWaveResponse_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "ReplacementSearchWave" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReplacementWaveResponse_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ReplacementWaveCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReplacementWaveResponse_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ReplacementSearchSession_teamId_status_idx" ON "ReplacementSearchSession"("teamId", "status");
CREATE INDEX "ReplacementSearchSession_status_updatedAt_idx" ON "ReplacementSearchSession"("status", "updatedAt");
CREATE UNIQUE INDEX "ReplacementSearchWave_sessionId_waveNumber_key" ON "ReplacementSearchWave"("sessionId", "waveNumber");
CREATE INDEX "ReplacementSearchWave_status_expiresAt_idx" ON "ReplacementSearchWave"("status", "expiresAt");
CREATE UNIQUE INDEX "ReplacementWaveCandidate_sessionId_playerId_key" ON "ReplacementWaveCandidate"("sessionId", "playerId");
CREATE UNIQUE INDEX "ReplacementWaveCandidate_waveId_playerId_key" ON "ReplacementWaveCandidate"("waveId", "playerId");
CREATE INDEX "ReplacementWaveCandidate_waveId_queuePosition_idx" ON "ReplacementWaveCandidate"("waveId", "queuePosition");
CREATE UNIQUE INDEX "ReplacementWaveResponse_waveId_discordUserId_key" ON "ReplacementWaveResponse"("waveId", "discordUserId");
CREATE INDEX "ReplacementWaveResponse_sessionId_readyAt_idx" ON "ReplacementWaveResponse"("sessionId", "readyAt");
