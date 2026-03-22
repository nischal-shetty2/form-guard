-- CreateTable
CREATE TABLE "Keyword" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "word" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SpamEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "isSpam" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_word_key" ON "Keyword"("word");
