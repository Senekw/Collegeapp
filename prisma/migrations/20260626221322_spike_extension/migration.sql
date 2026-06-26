-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "deepDive" TEXT;
ALTER TABLE "Activity" ADD COLUMN "programKey" TEXT;

-- CreateTable
CREATE TABLE "ProgramEnrichment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "programKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "aliases" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "cycleYear" INTEGER NOT NULL,
    "asOfYear" INTEGER NOT NULL,
    "isFallbackYear" BOOLEAN NOT NULL DEFAULT false,
    "applicantCount" INTEGER,
    "acceptedCount" INTEGER,
    "acceptanceRate" REAL,
    "participantCount" INTEGER,
    "awardWinnerCount" INTEGER,
    "awardLevels" TEXT,
    "notableWinners" TEXT,
    "prestigeTier" INTEGER,
    "admissionsImpactNote" TEXT,
    "attendVsWinNote" TEXT NOT NULL,
    "sources" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'NONE',
    "enrichedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modelUsed" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "AdmitDistribution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "schoolId" TEXT NOT NULL,
    "statType" TEXT NOT NULL,
    "buckets" TEXT NOT NULL,
    "asOfYear" INTEGER NOT NULL,
    "isFallbackYear" BOOLEAN NOT NULL DEFAULT false,
    "sources" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'NONE',
    "enrichedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdmitDistribution_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdmitArchetype" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archetypeKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "statBand" TEXT NOT NULL,
    "spikeSignature" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "exampleOutcomes" TEXT NOT NULL,
    "sources" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'NONE',
    "asOfYear" INTEGER
);

-- CreateTable
CREATE TABLE "SpikeAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "spikeIndex" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "dominantTheme" TEXT NOT NULL,
    "peakActivityIds" TEXT NOT NULL,
    "components" TEXT NOT NULL,
    "rarityAnchor" TEXT,
    "gapToNextTier" TEXT NOT NULL,
    "breakdown" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "spikeVersion" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpikeAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ActivityScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "impact" INTEGER NOT NULL,
    "originality" INTEGER NOT NULL,
    "initiative" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "selectivity" INTEGER NOT NULL,
    "spikeAlignment" INTEGER NOT NULL,
    "substantiated" BOOLEAN NOT NULL,
    "inflationFlags" TEXT NOT NULL,
    "creditMultiplier" REAL NOT NULL DEFAULT 1.0,
    "selectivityBreakdown" TEXT NOT NULL DEFAULT '{}',
    "enrichmentHashUsed" TEXT,
    "rationale" TEXT NOT NULL,
    "followUpQuestions" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityScore_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ActivityScore" ("activityId", "createdAt", "creditMultiplier", "depth", "followUpQuestions", "id", "impact", "inflationFlags", "initiative", "inputHash", "modelUsed", "originality", "rationale", "selectivity", "spikeAlignment", "substantiated", "tier") SELECT "activityId", "createdAt", coalesce("creditMultiplier", 1.0) AS "creditMultiplier", "depth", "followUpQuestions", "id", "impact", "inflationFlags", "initiative", "inputHash", "modelUsed", "originality", "rationale", "selectivity", "spikeAlignment", "substantiated", "tier" FROM "ActivityScore";
DROP TABLE "ActivityScore";
ALTER TABLE "new_ActivityScore" RENAME TO "ActivityScore";
CREATE UNIQUE INDEX "ActivityScore_activityId_key" ON "ActivityScore"("activityId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ProgramEnrichment_programKey_cycleYear_key" ON "ProgramEnrichment"("programKey", "cycleYear");

-- CreateIndex
CREATE UNIQUE INDEX "AdmitDistribution_schoolId_statType_asOfYear_key" ON "AdmitDistribution"("schoolId", "statType", "asOfYear");

-- CreateIndex
CREATE UNIQUE INDEX "AdmitArchetype_archetypeKey_key" ON "AdmitArchetype"("archetypeKey");

-- CreateIndex
CREATE UNIQUE INDEX "SpikeAssessment_studentId_key" ON "SpikeAssessment"("studentId");
