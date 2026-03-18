/*
  Warnings:

  - A unique constraint covering the columns `[name,divisionId]` on the table `Neighbourhood` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `divisionId` to the `Neighbourhood` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('HUB_PICKUP', 'SATELLITE_HOME', 'SATELLITE_HUB');

-- DropIndex
DROP INDEX "Neighbourhood_name_key";

-- AlterTable
ALTER TABLE "Neighbourhood" ADD COLUMN     "divisionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryType" "DeliveryType" NOT NULL DEFAULT 'HUB_PICKUP',
ADD COLUMN     "satelliteFeeXaf" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Pool" ADD COLUMN     "hubAddress" TEXT,
ADD COLUMN     "hubContactPhone" TEXT,
ADD COLUMN     "hubName" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "totalLogisticsSavingsXaf" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_name_key" ON "Region"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Division_name_regionId_key" ON "Division"("name", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "Neighbourhood_name_divisionId_key" ON "Neighbourhood"("name", "divisionId");

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Neighbourhood" ADD CONSTRAINT "Neighbourhood_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
