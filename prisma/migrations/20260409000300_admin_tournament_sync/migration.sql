ALTER TABLE "Player" ADD COLUMN "adminUserId" TEXT;
ALTER TABLE "Player" ADD COLUMN "adminParticipationCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN "hasPlayedBefore" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Player" ADD COLUMN "lastImportedTournamentName" TEXT;
ALTER TABLE "Player" ADD COLUMN "lastSyncedAt" DATETIME;

CREATE UNIQUE INDEX "Player_adminUserId_key" ON "Player"("adminUserId");

CREATE TABLE "AdminTournament" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "adminTournamentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT,
  "status" TEXT,
  "applicationTime" DATETIME,
  "startTime" DATETIME,
  "endTime" DATETIME,
  "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AdminTournament_adminTournamentId_key" ON "AdminTournament"("adminTournamentId");

CREATE TABLE "PlayerTournamentParticipation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "tournamentId" TEXT NOT NULL,
  "adminParticipantId" TEXT NOT NULL,
  "adminUserId" TEXT,
  "nicknameSnapshot" TEXT NOT NULL,
  "status" TEXT,
  "queuePosition" INTEGER,
  "qualifyRating" INTEGER,
  "bidSize" REAL,
  "balance" REAL,
  "participationCount" INTEGER,
  "playedBefore" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PlayerTournamentParticipation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlayerTournamentParticipation_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "AdminTournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlayerTournamentParticipation_adminParticipantId_key" ON "PlayerTournamentParticipation"("adminParticipantId");
CREATE UNIQUE INDEX "PlayerTournamentParticipation_playerId_tournamentId_key" ON "PlayerTournamentParticipation"("playerId", "tournamentId");
CREATE INDEX "PlayerTournamentParticipation_tournamentId_status_idx" ON "PlayerTournamentParticipation"("tournamentId", "status");

CREATE TABLE "AdminTournamentSyncRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tournamentId" TEXT,
  "adminTournamentId" TEXT NOT NULL,
  "tournamentName" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdPlayers" INTEGER NOT NULL DEFAULT 0,
  "updatedPlayers" INTEGER NOT NULL DEFAULT 0,
  "matchedByAdminUserId" INTEGER NOT NULL DEFAULT 0,
  "matchedByWallet" INTEGER NOT NULL DEFAULT 0,
  "matchedByDiscordId" INTEGER NOT NULL DEFAULT 0,
  "matchedByFallback" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "errorSummary" TEXT,
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AdminTournamentSyncRun_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "AdminTournament" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AdminTournamentSyncRun_adminTournamentId_startedAt_idx" ON "AdminTournamentSyncRun"("adminTournamentId", "startedAt");
