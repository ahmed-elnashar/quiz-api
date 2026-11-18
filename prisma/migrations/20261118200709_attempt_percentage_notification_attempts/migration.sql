/*
  Warnings:

  - You are about to drop the column `nextTryAt` on the `Notification` table. All the data in the column will be lost.
  - You are about to drop the column `tryCount` on the `Notification` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN "percentage" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Notification" ("attemptId", "channel", "createdAt", "id", "lastError", "payload", "sentAt", "status", "type", "updatedAt", "userId") SELECT "attemptId", "channel", "createdAt", "id", "lastError", "payload", "sentAt", "status", "type", "updatedAt", "userId" FROM "Notification";
DROP TABLE "Notification";
ALTER TABLE "new_Notification" RENAME TO "Notification";
CREATE UNIQUE INDEX "Notification_attemptId_key" ON "Notification"("attemptId");
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
