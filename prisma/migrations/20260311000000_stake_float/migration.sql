-- AlterTable: change stake from INTEGER to REAL (SQLite requires table recreation)
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nick" TEXT NOT NULL,
    "mmr" INTEGER NOT NULL,
    "stake" REAL NOT NULL,
    "mainRole" INTEGER NOT NULL,
    "flexRole" INTEGER,
    "wallet" TEXT,
    "nightMatches" INTEGER NOT NULL DEFAULT 0,
    "telegramId" TEXT,
    "isActiveInDatabase" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_Player" SELECT "id", "nick", "mmr", "stake", "mainRole", "flexRole", "wallet", "nightMatches", "telegramId", "isActiveInDatabase", "createdAt", "updatedAt" FROM "Player";

DROP TABLE "Player";

ALTER TABLE "new_Player" RENAME TO "Player";

CREATE UNIQUE INDEX "Player_nick_key" ON "Player"("nick");

PRAGMA foreign_keys=ON;
