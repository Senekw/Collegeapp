-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'local',
    "name" TEXT,
    "gradeLevel" INTEGER,
    "gradYear" INTEGER,
    "gpaUnweighted" REAL,
    "gpaWeighted" REAL,
    "rigor" TEXT,
    "satTotal" INTEGER,
    "actComposite" INTEGER,
    "intendedMajor" TEXT,
    "state" TEXT,
    "contextNotes" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL DEFAULT 'local',
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "role" TEXT,
    "description" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "hoursPerWeek" REAL,
    "weeksPerYear" INTEGER,
    "evidenceUrl" TEXT,
    "spikeTheme" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Activity_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchDetail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "outputType" TEXT NOT NULL DEFAULT 'NONE',
    "authorship" TEXT NOT NULL DEFAULT 'NONE',
    "contribution" TEXT NOT NULL,
    "venue" TEXT,
    "independence" INTEGER,
    "narrative" TEXT,
    CONSTRAINT "ResearchDetail_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityScore" (
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
    "creditMultiplier" REAL,
    "rationale" TEXT NOT NULL,
    "followUpQuestions" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityScore_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProfileSynthesis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "primarySpike" TEXT NOT NULL,
    "spikeStrength" INTEGER NOT NULL,
    "secondaryThemes" TEXT NOT NULL,
    "academicStrength" INTEGER NOT NULL,
    "overallNarrative" TEXT NOT NULL,
    "gaps" TEXT NOT NULL,
    "feasibleMoves" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProfileSynthesis_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "admitRate" REAL,
    "gpaMid50Low" REAL,
    "gpaMid50High" REAL,
    "satMid50Low" INTEGER,
    "satMid50High" INTEGER,
    "type" TEXT,
    "size" INTEGER,
    "strongMajors" TEXT,
    "sourceUrl" TEXT
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "gradeEligibility" TEXT NOT NULL,
    "deadlineMonth" INTEGER,
    "deadlineNote" TEXT,
    "selectivityNote" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false
);

-- CreateIndex
CREATE INDEX "Student_userId_idx" ON "Student"("userId");

-- CreateIndex
CREATE INDEX "Activity_userId_idx" ON "Activity"("userId");

-- CreateIndex
CREATE INDEX "Activity_studentId_idx" ON "Activity"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchDetail_activityId_key" ON "ResearchDetail"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityScore_activityId_key" ON "ActivityScore"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileSynthesis_studentId_key" ON "ProfileSynthesis"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "School_name_key" ON "School"("name");
