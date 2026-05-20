CREATE TYPE "FinancialAccountPurpose" AS ENUM ('GENERAL', 'BUDGET');
CREATE TYPE "BudgetKind" AS ENUM ('SPENDING', 'SAVINGS');
CREATE TYPE "BudgetStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'EXPIRED', 'DELETED');
CREATE TYPE "BudgetEntryType" AS ENUM ('INCOME', 'EXPENSE', 'MANUAL_ADJUSTMENT');
CREATE TYPE "BudgetEntryAllocationMode" AS ENUM ('PRINCIPAL', 'EXTRA');

ALTER TABLE "Company"
ADD COLUMN "isPersonalWorkspace" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "personalWorkspaceOwnerId" INTEGER;

ALTER TABLE "FinancialAccount"
ADD COLUMN "purpose" "FinancialAccountPurpose" NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "isSystemManaged" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Budget" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "clientKey" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "kind" "BudgetKind" NOT NULL,
  "status" "BudgetStatus" NOT NULL DEFAULT 'ACTIVE',
  "initialBalance" DECIMAL(15,2) NOT NULL,
  "currentBalance" DECIMAL(15,2) NOT NULL,
  "targetEndingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "dailyBudgetInitial" DECIMAL(15,2) NOT NULL,
  "dailyBudgetCurrent" DECIMAL(15,2) NOT NULL,
  "dayExtraBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "lastDailyBudgetDate" TIMESTAMP(3) NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "financialAccountId" INTEGER NOT NULL,
  "clientCreatedAt" TIMESTAMP(3) NOT NULL,
  "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BudgetEntry" (
  "id" SERIAL NOT NULL,
  "budgetId" INTEGER NOT NULL,
  "clientKey" TEXT NOT NULL,
  "entryType" "BudgetEntryType" NOT NULL,
  "allocationMode" "BudgetEntryAllocationMode",
  "amount" DECIMAL(15,2) NOT NULL,
  "principalImpactAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "description" TEXT,
  "affectsBudgetBalance" BOOLEAN NOT NULL DEFAULT true,
  "financialTransactionId" INTEGER,
  "clientCreatedAt" TIMESTAMP(3) NOT NULL,
  "clientUpdatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BudgetEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_personalWorkspaceOwnerId_key" ON "Company"("personalWorkspaceOwnerId");
CREATE UNIQUE INDEX "Budget_financialAccountId_key" ON "Budget"("financialAccountId");
CREATE UNIQUE INDEX "BudgetEntry_financialTransactionId_key" ON "BudgetEntry"("financialTransactionId");
CREATE UNIQUE INDEX "unique_budget_client_key" ON "Budget"("companyId", "userId", "clientKey");
CREATE UNIQUE INDEX "unique_budget_entry_client_key" ON "BudgetEntry"("budgetId", "clientKey");

CREATE INDEX "Budget_companyId_userId_idx" ON "Budget"("companyId", "userId");
CREATE INDEX "Budget_companyId_status_idx" ON "Budget"("companyId", "status");
CREATE INDEX "BudgetEntry_budgetId_occurredAt_idx" ON "BudgetEntry"("budgetId", "occurredAt");

ALTER TABLE "Company"
ADD CONSTRAINT "Company_personalWorkspaceOwnerId_fkey"
FOREIGN KEY ("personalWorkspaceOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Budget"
ADD CONSTRAINT "Budget_financialAccountId_fkey"
FOREIGN KEY ("financialAccountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetEntry"
ADD CONSTRAINT "BudgetEntry_budgetId_fkey"
FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetEntry"
ADD CONSTRAINT "BudgetEntry_financialTransactionId_fkey"
FOREIGN KEY ("financialTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
