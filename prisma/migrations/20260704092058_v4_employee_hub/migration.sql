-- AlterTable
ALTER TABLE "User" ADD COLUMN "address" TEXT;
ALTER TABLE "User" ADD COLUMN "emergencyContact" TEXT;

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storedAs" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "dueDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "doneAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeekLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeekLock_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CompanySettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "weeklyHourLimit" REAL NOT NULL DEFAULT 40,
    "overtimeMultiplier" REAL NOT NULL DEFAULT 1.5,
    "overtimeAlertThreshold" REAL NOT NULL DEFAULT 10,
    "paidLeaveDaysPerYear" INTEGER NOT NULL DEFAULT 15,
    "sickLeaveDaysPerYear" INTEGER NOT NULL DEFAULT 10,
    "standardDayHours" REAL NOT NULL DEFAULT 8,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "payFrequencyDefault" TEXT NOT NULL DEFAULT 'WEEKLY'
);
INSERT INTO "new_CompanySettings" ("currencyCode", "id", "overtimeAlertThreshold", "overtimeMultiplier", "paidLeaveDaysPerYear", "payFrequencyDefault", "standardDayHours", "weeklyHourLimit") SELECT "currencyCode", "id", "overtimeAlertThreshold", "overtimeMultiplier", "paidLeaveDaysPerYear", "payFrequencyDefault", "standardDayHours", "weeklyHourLimit" FROM "CompanySettings";
DROP TABLE "CompanySettings";
ALTER TABLE "new_CompanySettings" RENAME TO "CompanySettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WeekLock_workerId_weekStart_key" ON "WeekLock"("workerId", "weekStart");
