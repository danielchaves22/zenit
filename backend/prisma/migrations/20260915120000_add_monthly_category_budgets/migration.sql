CREATE TABLE "MonthlyCategoryBudget" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "referenceMonth" TIMESTAMP(3) NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "limitAmount" DECIMAL(15,2) NOT NULL,
    "includeChildren" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyCategoryBudget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlyCategoryBudget_companyId_referenceMonth_categoryId_key"
ON "MonthlyCategoryBudget"("companyId", "referenceMonth", "categoryId");

CREATE INDEX "MonthlyCategoryBudget_companyId_referenceMonth_idx"
ON "MonthlyCategoryBudget"("companyId", "referenceMonth");

CREATE INDEX "MonthlyCategoryBudget_categoryId_idx"
ON "MonthlyCategoryBudget"("categoryId");

ALTER TABLE "MonthlyCategoryBudget"
ADD CONSTRAINT "MonthlyCategoryBudget_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MonthlyCategoryBudget"
ADD CONSTRAINT "MonthlyCategoryBudget_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "FinancialCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
