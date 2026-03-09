-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nick" TEXT NOT NULL,
    "mmr" INTEGER NOT NULL,
    "stake" INTEGER NOT NULL,
    "mainRole" INTEGER NOT NULL,
    "flexRole" INTEGER,
    "wallet" TEXT,
    "nightMatches" INTEGER NOT NULL DEFAULT 0,
    "isActiveInDatabase" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "player3Id" TEXT NOT NULL,
    "player4Id" TEXT NOT NULL,
    "player5Id" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReplacementPoolEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "joinTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedTeamId" TEXT,
    "pickedTime" DATETIME,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplacementPoolEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReplacementPoolEntry_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchReplacementLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "matchId" TEXT,
    "teamId" TEXT,
    "teamName" TEXT,
    "neededRole" INTEGER,
    "replacedPlayerId" TEXT,
    "replacedPlayerNick" TEXT,
    "replacedPlayerMmr" INTEGER,
    "replacementPlayerId" TEXT,
    "replacementPlayerNick" TEXT,
    "replacementPlayerMmr" INTEGER,
    "judgeName" TEXT,
    "comment" TEXT,
    "resultStatus" TEXT NOT NULL,
    "poolEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchReplacementLog_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MatchReplacementLog_replacedPlayerId_fkey" FOREIGN KEY ("replacedPlayerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MatchReplacementLog_replacementPlayerId_fkey" FOREIGN KEY ("replacementPlayerId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MatchReplacementLog_poolEntryId_fkey" FOREIGN KEY ("poolEntryId") REFERENCES "ReplacementPoolEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_nick_key" ON "Player"("nick");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");
