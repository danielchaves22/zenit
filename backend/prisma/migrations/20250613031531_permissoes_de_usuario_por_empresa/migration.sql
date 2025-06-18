/*
  Warnings:

  - You are about to drop the column `manageFinancialAccounts` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `manageFinancialCategories` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "manageFinancialAccounts",
DROP COLUMN IF EXISTS "manageFinancialCategories";

-- AlterTable
ALTER TABLE "UserCompany" ADD COLUMN     "manageFinancialAccounts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manageFinancialCategories" BOOLEAN NOT NULL DEFAULT false;
