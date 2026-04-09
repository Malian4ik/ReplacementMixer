ALTER TABLE "ReplacementSearchSession" ADD COLUMN "recommendationWaveId" TEXT;
ALTER TABLE "ReplacementSearchSession" ADD COLUMN "recommendedPlayerId" TEXT;
ALTER TABLE "ReplacementSearchSession" ADD COLUMN "recommendedPoolEntryId" TEXT;
ALTER TABLE "ReplacementSearchSession" ADD COLUMN "recommendationRank" INTEGER;
ALTER TABLE "ReplacementSearchSession" ADD COLUMN "recommendationScore" REAL;
ALTER TABLE "ReplacementSearchSession" ADD COLUMN "recommendationReadyAt" DATETIME;

ALTER TABLE "ReplacementWaveCandidate" ADD COLUMN "wasOffered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReplacementWaveCandidate" ADD COLUMN "offeredAt" DATETIME;
ALTER TABLE "ReplacementWaveCandidate" ADD COLUMN "rejectedAt" DATETIME;

CREATE INDEX "ReplacementSearchSession_status_teamId_idx" ON "ReplacementSearchSession"("status", "teamId");
