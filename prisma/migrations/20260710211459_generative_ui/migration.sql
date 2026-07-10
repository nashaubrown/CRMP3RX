
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "generativeUi" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CanvasView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvasView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvasView_userId_createdAt_idx" ON "CanvasView"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CanvasView" ADD CONSTRAINT "CanvasView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

