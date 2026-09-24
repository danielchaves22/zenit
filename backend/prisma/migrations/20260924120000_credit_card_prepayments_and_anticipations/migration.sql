ALTER TYPE "CreditCardCreditKind" ADD VALUE 'ANTICIPATION_DISCOUNT';

CREATE TABLE "CreditCardInvoicePayment" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardInvoicePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCardInvoicePayment_transactionId_key"
ON "CreditCardInvoicePayment"("transactionId");

CREATE INDEX "CreditCardInvoicePayment_invoiceId_paymentDate_idx"
ON "CreditCardInvoicePayment"("invoiceId", "paymentDate");

ALTER TABLE "CreditCardInvoicePayment"
ADD CONSTRAINT "CreditCardInvoicePayment_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardInvoicePayment"
ADD CONSTRAINT "CreditCardInvoicePayment_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CreditCardInvoicePayment" (
    "invoiceId",
    "transactionId",
    "amount",
    "paymentDate",
    "notes"
)
SELECT
    invoice."id",
    payment."id",
    payment."amount",
    COALESCE(payment."effectiveDate", payment."date", invoice."settledAt", invoice."dueDate"),
    payment."notes"
FROM "CreditCardInvoice" invoice
JOIN "FinancialTransaction" payment ON payment."id" = invoice."paymentTransactionId";

CREATE TABLE "CreditCardInstallmentAnticipation" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "targetInvoiceId" INTEGER NOT NULL,
    "anticipatedAt" TIMESTAMP(3) NOT NULL,
    "discountAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "discountTransactionId" INTEGER,
    "notes" TEXT,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardInstallmentAnticipation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCardInstallmentAnticipation_discountTransactionId_key"
ON "CreditCardInstallmentAnticipation"("discountTransactionId");

CREATE INDEX "CreditCardInstallmentAnticipation_accountId_anticipatedAt_idx"
ON "CreditCardInstallmentAnticipation"("accountId", "anticipatedAt");

CREATE INDEX "CreditCardInstallmentAnticipation_targetInvoiceId_idx"
ON "CreditCardInstallmentAnticipation"("targetInvoiceId");

ALTER TABLE "CreditCardInstallmentAnticipation"
ADD CONSTRAINT "CreditCardInstallmentAnticipation_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardInstallmentAnticipation"
ADD CONSTRAINT "CreditCardInstallmentAnticipation_targetInvoiceId_fkey"
FOREIGN KEY ("targetInvoiceId") REFERENCES "CreditCardInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardInstallmentAnticipation"
ADD CONSTRAINT "CreditCardInstallmentAnticipation_discountTransactionId_fkey"
FOREIGN KEY ("discountTransactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CreditCardInstallmentAnticipationItem" (
    "id" SERIAL NOT NULL,
    "anticipationId" INTEGER NOT NULL,
    "transactionId" INTEGER NOT NULL,
    "originalReferenceYear" INTEGER NOT NULL,
    "originalReferenceMonth" INTEGER NOT NULL,
    "originalDueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardInstallmentAnticipationItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCardInstallmentAnticipationItem_transactionId_key"
ON "CreditCardInstallmentAnticipationItem"("transactionId");

CREATE INDEX "CreditCardInstallmentAnticipationItem_anticipationId_idx"
ON "CreditCardInstallmentAnticipationItem"("anticipationId");

ALTER TABLE "CreditCardInstallmentAnticipationItem"
ADD CONSTRAINT "CreditCardInstallmentAnticipationItem_anticipationId_fkey"
FOREIGN KEY ("anticipationId") REFERENCES "CreditCardInstallmentAnticipation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardInstallmentAnticipationItem"
ADD CONSTRAINT "CreditCardInstallmentAnticipationItem_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
