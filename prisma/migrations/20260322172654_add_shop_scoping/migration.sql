-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TEMP TABLE "_FormGuardShop" AS
SELECT DISTINCT "shop"
FROM "Session"
WHERE "shop" IS NOT NULL
  AND "shop" != "";

CREATE TABLE "new_Keyword" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "word" TEXT NOT NULL
);
INSERT INTO "new_Keyword" ("shop", "word")
SELECT "_FormGuardShop"."shop", "Keyword"."word"
FROM "Keyword", "_FormGuardShop"
UNION ALL
SELECT 'legacy-unscoped', "Keyword"."word"
FROM "Keyword"
WHERE NOT EXISTS (SELECT 1 FROM "_FormGuardShop");
DROP TABLE "Keyword";
ALTER TABLE "new_Keyword" RENAME TO "Keyword";
CREATE UNIQUE INDEX "Keyword_shop_word_key" ON "Keyword"("shop", "word");
CREATE TABLE "new_Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);
INSERT INTO "new_Setting" ("shop", "key", "value")
SELECT "_FormGuardShop"."shop", "Setting"."key", "Setting"."value"
FROM "Setting", "_FormGuardShop"
UNION ALL
SELECT 'legacy-unscoped', "Setting"."key", "Setting"."value"
FROM "Setting"
WHERE NOT EXISTS (SELECT 1 FROM "_FormGuardShop");
DROP TABLE "Setting";
ALTER TABLE "new_Setting" RENAME TO "Setting";
CREATE UNIQUE INDEX "Setting_shop_key_key" ON "Setting"("shop", "key");
CREATE TABLE "new_SpamEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "isSpam" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
WITH "inferred_shop" AS (
    SELECT CASE
        WHEN (SELECT COUNT(*) FROM "_FormGuardShop") = 1
            THEN (SELECT "shop" FROM "_FormGuardShop" LIMIT 1)
        ELSE 'legacy-unscoped'
    END AS "shop"
)
INSERT INTO "new_SpamEvent" ("shop", "isSpam", "reason", "createdAt")
SELECT "inferred_shop"."shop", "SpamEvent"."isSpam", "SpamEvent"."reason", "SpamEvent"."createdAt"
FROM "SpamEvent"
CROSS JOIN "inferred_shop";
DROP TABLE "SpamEvent";
ALTER TABLE "new_SpamEvent" RENAME TO "SpamEvent";
CREATE INDEX "SpamEvent_shop_createdAt_isSpam_idx" ON "SpamEvent"("shop", "createdAt", "isSpam");
DROP TABLE "_FormGuardShop";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
