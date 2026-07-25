-- CreateEnum
CREATE TYPE "GeofenceType" AS ENUM ('TERRITORY', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "GeofenceShape" AS ENUM ('POLYGON', 'CIRCLE');

-- CreateTable
CREATE TABLE "Geofence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "GeofenceType" NOT NULL DEFAULT 'TERRITORY',
    "shape" "GeofenceShape" NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#16a34a',
    "points" JSONB NOT NULL,
    "radiusM" INTEGER,
    "offer" TEXT,
    "ownerId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Geofence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Geofence_type_idx" ON "Geofence"("type");

-- CreateIndex
CREATE INDEX "Geofence_ownerId_idx" ON "Geofence"("ownerId");

-- AddForeignKey
ALTER TABLE "Geofence" ADD CONSTRAINT "Geofence_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
