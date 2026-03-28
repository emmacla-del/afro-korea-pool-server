-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "min_buyers" INTEGER,
ADD COLUMN     "team_deal_neighbourhood_id" TEXT,
ADD COLUMN     "team_price" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "checkinStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Product_team_price_idx" ON "Product"("team_price");
