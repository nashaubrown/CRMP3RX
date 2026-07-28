-- CreateTable
CREATE TABLE "Outlet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "merchantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outlet_merchantId_idx" ON "Outlet"("merchantId");

-- AddForeignKey
ALTER TABLE "Outlet" ADD CONSTRAINT "Outlet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every merchant that already has coordinates becomes its own primary
-- outlet, so nothing disappears from the map.
INSERT INTO "Outlet" ("id", "name", "address", "latitude", "longitude", "isPrimary", "merchantId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "name", "address", "latitude", "longitude", true, "id", now(), now()
FROM "Merchant"
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;
