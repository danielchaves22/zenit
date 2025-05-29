/*
  Warnings:

  - A unique constraint covering the columns `[companyId,isDefault]` on the table `FinancialAccount` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[companyId,type,isDefault]` on the table `FinancialCategory` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "FinancialAccount" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "FinancialCategory" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "FinancialAccount_companyId_isDefault_idx" ON "FinancialAccount"("companyId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_companyId_isDefault_key" ON "FinancialAccount"("companyId", "isDefault");

-- CreateIndex
CREATE INDEX "FinancialCategory_companyId_type_isDefault_idx" ON "FinancialCategory"("companyId", "type", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialCategory_companyId_type_isDefault_key" ON "FinancialCategory"("companyId", "type", "isDefault");
