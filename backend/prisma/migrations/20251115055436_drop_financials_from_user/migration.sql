/*
  Warnings:

  - You are about to drop the column `manageFinancialAccounts` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `manageFinancialCategories` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "manageFinancialAccounts",
DROP COLUMN "manageFinancialCategories";
