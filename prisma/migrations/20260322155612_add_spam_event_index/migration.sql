-- CreateIndex
CREATE INDEX "SpamEvent_createdAt_isSpam_idx" ON "SpamEvent"("createdAt", "isSpam");
