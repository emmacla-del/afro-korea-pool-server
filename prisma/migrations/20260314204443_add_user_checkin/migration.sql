-- CreateTable
CREATE TABLE "UserCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkInDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reward" INTEGER,
    CONSTRAINT "UserCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCheckIn_userId_checkInDate_key" ON "UserCheckIn"("userId", "checkInDate");

-- AddForeignKey
ALTER TABLE "UserCheckIn" ADD CONSTRAINT "UserCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
