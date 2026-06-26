-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "geminiApiKey" TEXT,
    "updatedAt" DATETIME NOT NULL
);
