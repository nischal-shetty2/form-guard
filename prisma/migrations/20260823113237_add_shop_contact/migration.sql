-- CreateTable
CREATE TABLE "ShopContact" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "shopName" TEXT,
    "ownerName" TEXT,
    "email" TEXT,
    "contactEmail" TEXT,
    "country" TEXT,
    "plan" TEXT,
    "devStore" BOOLEAN,
    "shopCreatedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
