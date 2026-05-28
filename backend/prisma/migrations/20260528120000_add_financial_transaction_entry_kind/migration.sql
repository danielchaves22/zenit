CREATE TYPE "FinancialTransactionEntryKind" AS ENUM ('NORMAL', 'BALANCE_ADJUSTMENT');

ALTER TABLE "FinancialTransaction"
ADD COLUMN "entryKind" "FinancialTransactionEntryKind" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "FinancialTransaction_companyId_entryKind_idx"
ON "FinancialTransaction"("companyId", "entryKind");
