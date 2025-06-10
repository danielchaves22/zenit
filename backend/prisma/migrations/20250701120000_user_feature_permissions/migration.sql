-- Add columns for feature permissions
ALTER TABLE "User" ADD COLUMN "manageFinancialAccounts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "manageFinancialCategories" BOOLEAN NOT NULL DEFAULT false;
