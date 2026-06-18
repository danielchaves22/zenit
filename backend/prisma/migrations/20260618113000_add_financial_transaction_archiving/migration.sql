ALTER TABLE "FinancialTransaction"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedBy" INTEGER;

CREATE INDEX "FinancialTransaction_companyId_archivedAt_idx"
ON "FinancialTransaction"("companyId", "archivedAt");
