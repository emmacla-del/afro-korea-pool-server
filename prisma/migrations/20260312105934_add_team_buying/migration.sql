-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('MOQ_POOL', 'TEAM_DEAL');

-- AlterTable
ALTER TABLE "Pool" ADD COLUMN     "currentBuyers" INTEGER DEFAULT 0,
ADD COLUMN     "dealType" "DealType" NOT NULL DEFAULT 'MOQ_POOL',
ADD COLUMN     "minBuyers" INTEGER,
ADD COLUMN     "teamPrice" INTEGER;
