/*
  Warnings:

  - The primary key for the `UserCompany` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[userId,companyId]` on the table `UserCompany` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "UserCompany" DROP CONSTRAINT "UserCompany_pkey",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompany_userId_companyId_key" ON "UserCompany"("userId", "companyId");
