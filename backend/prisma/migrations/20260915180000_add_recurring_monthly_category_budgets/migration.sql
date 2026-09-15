CREATE TABLE "RecurringMonthlyCategoryBudget" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "limitAmount" DECIMAL(15,2) NOT NULL,
    "includeChildren" BOOLEAN NOT NULL DEFAULT true,
    "startMonth" TIMESTAMP(3) NOT NULL,
    "endMonth" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringMonthlyCategoryBudget_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MonthlyCategoryBudget"
ADD COLUMN "isExcluded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recurringBudgetId" INTEGER;

CREATE UNIQUE INDEX "RecurringMonthlyCategoryBudget_companyId_categoryId_startMonth_key"
ON "RecurringMonthlyCategoryBudget"("companyId", "categoryId", "startMonth");

CREATE INDEX "RecurringMonthlyCategoryBudget_companyId_startMonth_endMonth_idx"
ON "RecurringMonthlyCategoryBudget"("companyId", "startMonth", "endMonth");

CREATE INDEX "RecurringMonthlyCategoryBudget_categoryId_idx"
ON "RecurringMonthlyCategoryBudget"("categoryId");

CREATE INDEX "MonthlyCategoryBudget_recurringBudgetId_idx"
ON "MonthlyCategoryBudget"("recurringBudgetId");

ALTER TABLE "RecurringMonthlyCategoryBudget"
ADD CONSTRAINT "RecurringMonthlyCategoryBudget_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecurringMonthlyCategoryBudget"
ADD CONSTRAINT "RecurringMonthlyCategoryBudget_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MonthlyCategoryBudget"
ADD CONSTRAINT "MonthlyCategoryBudget_recurringBudgetId_fkey"
FOREIGN KEY ("recurringBudgetId") REFERENCES "RecurringMonthlyCategoryBudget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
