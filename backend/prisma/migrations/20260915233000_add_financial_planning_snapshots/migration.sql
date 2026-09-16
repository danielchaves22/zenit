CREATE TYPE "FinancialPlanningObjectiveKind" AS ENUM ('MONTHLY_SAVINGS');

CREATE TYPE "FinancialPlanningSnapshotStatus" AS ENUM ('CONFIRMED');

CREATE TABLE "FinancialPlanningSnapshot" (
    "id" SERIAL NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "personalWorkspaceId" INTEGER NOT NULL,
    "objectiveKind" "FinancialPlanningObjectiveKind" NOT NULL DEFAULT 'MONTHLY_SAVINGS',
    "targetMonthlySavings" DECIMAL(15,2) NOT NULL,
    "historyMonths" INTEGER NOT NULL,
    "historyStartDate" TIMESTAMP(3) NOT NULL,
    "historyEndDate" TIMESTAMP(3) NOT NULL,
    "profileVersion" INTEGER NOT NULL,
    "methodologyVersion" INTEGER NOT NULL DEFAULT 1,
    "dataQualityScore" INTEGER NOT NULL,
    "dataQuality" JSONB NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "selectedSourceKeys" JSONB NOT NULL,
    "totals" JSONB NOT NULL,
    "monthlyIncome" DECIMAL(15,2) NOT NULL,
    "monthlyCommittedExpenses" DECIMAL(15,2) NOT NULL,
    "monthlyVariableExpenses" DECIMAL(15,2) NOT NULL,
    "monthlyProvisionContribution" DECIMAL(15,2) NOT NULL,
    "monthlyAvailableBeforeGoal" DECIMAL(15,2) NOT NULL,
    "monthlyBalanceAfterGoal" DECIMAL(15,2) NOT NULL,
    "status" "FinancialPlanningSnapshotStatus" NOT NULL DEFAULT 'CONFIRMED',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialPlanningSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancialPlanningSnapshot_ownerUserId_createdAt_idx"
ON "FinancialPlanningSnapshot"("ownerUserId", "createdAt");

CREATE INDEX "FinancialPlanningSnapshot_personalWorkspaceId_createdAt_idx"
ON "FinancialPlanningSnapshot"("personalWorkspaceId", "createdAt");

ALTER TABLE "FinancialPlanningSnapshot"
ADD CONSTRAINT "FinancialPlanningSnapshot_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialPlanningSnapshot"
ADD CONSTRAINT "FinancialPlanningSnapshot_personalWorkspaceId_fkey"
FOREIGN KEY ("personalWorkspaceId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
