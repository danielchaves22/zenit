CREATE TYPE "CreditCardInvoiceSettlementType" AS ENUM ('TRANSFER', 'EXTERNAL');

ALTER TABLE "FinancialTransaction"
ADD COLUMN "isExternalCreditCardSettlement" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CreditCardInvoice"
ADD COLUMN "settlementType" "CreditCardInvoiceSettlementType",
ADD COLUMN "settledAt" TIMESTAMP(3);

UPDATE "CreditCardInvoice" AS invoice
SET
  "settlementType" = 'TRANSFER',
  "settledAt" = COALESCE(payment."effectiveDate", payment."date", invoice."dueDate")
FROM "FinancialTransaction" AS payment
WHERE invoice."paymentTransactionId" = payment."id";
