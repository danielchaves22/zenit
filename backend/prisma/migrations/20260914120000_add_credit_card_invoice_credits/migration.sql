CREATE TYPE "CreditCardCreditKind" AS ENUM ('REFUND', 'CASHBACK', 'ADJUSTMENT');

ALTER TABLE "FinancialTransaction"
  ADD COLUMN "creditCardCreditKind" "CreditCardCreditKind",
  ADD COLUMN "refundOfTransactionId" INTEGER;

CREATE INDEX "FinancialTransaction_refundOfTransactionId_idx"
  ON "FinancialTransaction"("refundOfTransactionId");

CREATE INDEX "idx_ft_invoice_credit_kind"
  ON "FinancialTransaction"("creditCardInvoiceId", "creditCardCreditKind");

ALTER TABLE "FinancialTransaction"
  ADD CONSTRAINT "FinancialTransaction_refundOfTransactionId_fkey"
  FOREIGN KEY ("refundOfTransactionId")
  REFERENCES "FinancialTransaction"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "FinancialTransaction"
  ADD CONSTRAINT "FinancialTransaction_credit_card_credit_shape_check"
  CHECK (
    ("creditCardCreditKind" IS NULL AND "refundOfTransactionId" IS NULL)
    OR
    (
      "creditCardCreditKind" IS NOT NULL
      AND "type" = 'INCOME'
      AND "toAccountId" IS NOT NULL
      AND "creditCardInvoiceId" IS NOT NULL
      AND (
        ("creditCardCreditKind" = 'REFUND' AND "refundOfTransactionId" IS NOT NULL)
        OR
        ("creditCardCreditKind" <> 'REFUND' AND "refundOfTransactionId" IS NULL)
      )
    )
  );
