CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "firstDueDate" TIMESTAMP(3) NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FinancialTransaction"
ADD COLUMN "installmentPlanId" TEXT;

CREATE INDEX "InstallmentPlan_companyId_idx" ON "InstallmentPlan"("companyId");
CREATE INDEX "InstallmentPlan_companyId_createdAt_idx" ON "InstallmentPlan"("companyId", "createdAt");
CREATE INDEX "FinancialTransaction_installmentPlanId_idx" ON "FinancialTransaction"("installmentPlanId");

ALTER TABLE "InstallmentPlan"
ADD CONSTRAINT "InstallmentPlan_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InstallmentPlan"
ADD CONSTRAINT "InstallmentPlan_createdBy_fkey"
FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialTransaction"
ADD CONSTRAINT "FinancialTransaction_installmentPlanId_fkey"
FOREIGN KEY ("installmentPlanId") REFERENCES "InstallmentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
