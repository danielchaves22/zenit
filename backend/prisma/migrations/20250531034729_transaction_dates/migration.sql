-- AlterTable
ALTER TABLE "FinancialTransaction" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "effectiveDate" TIMESTAMP(3),
ADD COLUMN     "originalAmount" DECIMAL(15,2),
ADD COLUMN     "paidAmount" DECIMAL(15,2),
ALTER COLUMN "status" SET DEFAULT 'COMPLETED';

-- CreateIndex
CREATE INDEX "FinancialTransaction_dueDate_status_idx" ON "FinancialTransaction"("dueDate", "status");

-- CreateIndex
CREATE INDEX "FinancialTransaction_effectiveDate_idx" ON "FinancialTransaction"("effectiveDate");

-- CreateIndex
CREATE INDEX "FinancialTransaction_companyId_effectiveDate_status_idx" ON "FinancialTransaction"("companyId", "effectiveDate", "status");
