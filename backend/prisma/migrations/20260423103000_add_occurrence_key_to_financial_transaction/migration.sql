-- Add idempotency key for fixed transaction occurrences
ALTER TABLE "FinancialTransaction"
ADD COLUMN "occurrenceKey" TEXT;

CREATE UNIQUE INDEX "FinancialTransaction_occurrenceKey_key"
ON "FinancialTransaction"("occurrenceKey");
