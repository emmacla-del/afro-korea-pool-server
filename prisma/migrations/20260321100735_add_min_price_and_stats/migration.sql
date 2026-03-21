-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('VIEW', 'LIKE', 'SHARE');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "sentCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Pool" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "minPrice" INTEGER;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "description" TEXT,
ADD COLUMN     "neighbourhoodId" TEXT;

-- CreateTable
CREATE TABLE "ProductStats" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProductInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProductInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductStats_productId_key" ON "ProductStats"("productId");

-- CreateIndex
CREATE INDEX "ProductStats_score_idx" ON "ProductStats"("score");

-- CreateIndex
CREATE INDEX "UserProductInteraction_userId_idx" ON "UserProductInteraction"("userId");

-- CreateIndex
CREATE INDEX "UserProductInteraction_productId_idx" ON "UserProductInteraction"("productId");

-- CreateIndex
CREATE INDEX "UserProductInteraction_userId_productId_idx" ON "UserProductInteraction"("userId", "productId");

-- CreateIndex
CREATE INDEX "UserProductInteraction_productId_userId_idx" ON "UserProductInteraction"("productId", "userId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Pool_productId_idx" ON "Pool"("productId");

-- CreateIndex
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Product_isActive_createdAt_idx" ON "Product"("isActive", "createdAt");

-- CreateIndex
CREATE INDEX "Product_minPrice_idx" ON "Product"("minPrice");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE INDEX "Supplier_neighbourhoodId_idx" ON "Supplier"("neighbourhoodId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_neighbourhoodId_fkey" FOREIGN KEY ("neighbourhoodId") REFERENCES "Neighbourhood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStats" ADD CONSTRAINT "ProductStats_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProductInteraction" ADD CONSTRAINT "UserProductInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProductInteraction" ADD CONSTRAINT "UserProductInteraction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
