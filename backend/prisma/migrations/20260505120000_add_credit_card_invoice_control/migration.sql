CREATE TYPE "CreditCardInvoiceStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');

ALTER TABLE "FinancialAccount"
ADD COLUMN "creditLimit" DECIMAL(15,2),
ADD COLUMN "statementClosingDay" INTEGER,
ADD COLUMN "statementDueDay" INTEGER;

ALTER TABLE "FinancialTransaction"
ADD COLUMN "purchaseGroupId" TEXT,
ADD COLUMN "creditCardInvoiceId" INTEGER;

CREATE TABLE "CreditCardInvoice" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "referenceMonth" INTEGER NOT NULL,
    "closingDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "CreditCardInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "totalAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paymentTransactionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unique_credit_card_invoice_reference" ON "CreditCardInvoice"("accountId", "referenceYear", "referenceMonth");
CREATE UNIQUE INDEX "CreditCardInvoice_paymentTransactionId_key" ON "CreditCardInvoice"("paymentTransactionId");
CREATE INDEX "CreditCardInvoice_accountId_dueDate_idx" ON "CreditCardInvoice"("accountId", "dueDate");
CREATE INDEX "CreditCardInvoice_status_dueDate_idx" ON "CreditCardInvoice"("status", "dueDate");
CREATE INDEX "FinancialTransaction_purchaseGroupId_idx" ON "FinancialTransaction"("purchaseGroupId");
CREATE INDEX "FinancialTransaction_creditCardInvoiceId_idx" ON "FinancialTransaction"("creditCardInvoiceId");

ALTER TABLE "FinancialTransaction"
ADD CONSTRAINT "FinancialTransaction_creditCardInvoiceId_fkey"
FOREIGN KEY ("creditCardInvoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditCardInvoice"
ADD CONSTRAINT "CreditCardInvoice_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardInvoice"
ADD CONSTRAINT "CreditCardInvoice_paymentTransactionId_fkey"
FOREIGN KEY ("paymentTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
