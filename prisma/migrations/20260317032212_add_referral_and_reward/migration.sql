--CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('FOOD_PRODUCE', 'TRANSFORMED_FOOD', 'HOUSEHOLD_EQUIPMENT', 'CONSTRUCTION_MATERIAL', 'ELECTRONICS');

-- AlterTable
ALTER TABLE "User" 
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referrerId" TEXT,
ADD COLUMN     "rewardBalance" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "superCreatorId" TEXT;

-- AlterTable
ALTER TABLE "Product" 
ADD COLUMN     "catEnum" "ProductCategory";

-- AlterTable
ALTER TABLE "Pool" 
ADD COLUMN     "creatorId" TEXT,
ADD COLUMN     "rewardQuantity" INTEGER;

-- AlterTable
ALTER TABLE "Commitment" 
ADD COLUMN     "referrerId" TEXT;

-- AlterTable
ALTER TABLE "Order" 
ADD COLUMN     "deliveryAddress" TEXT,
ADD COLUMN     "deliveryMethod" TEXT,
ADD COLUMN     "pickupPoint" TEXT;

-- CreateTable
CREATE TABLE "RewardTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_superCreatorId_fkey" FOREIGN KEY ("superCreatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardTransaction" ADD CONSTRAINT "RewardTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
