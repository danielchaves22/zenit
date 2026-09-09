CREATE TYPE "CreditCardReconciliationSessionStatus" AS ENUM ('OPEN', 'COMPLETED');
CREATE TYPE "CreditCardReconciliationItemResolution" AS ENUM ('PENDING', 'IMPORTED', 'LINKED_FIXED', 'CONFIRMED_EXISTING', 'IGNORED');

CREATE TABLE "CreditCardReconciliationSession" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "referenceYear" INTEGER NOT NULL,
    "referenceMonth" INTEGER NOT NULL,
    "sourceType" "FinancialTransactionImportSourceType" NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileData" BYTEA NOT NULL,
    "statementSnapshot" JSONB NOT NULL,
    "parserVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "CreditCardReconciliationSessionStatus" NOT NULL DEFAULT 'OPEN',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "activeMutationToken" UUID,
    "activeMutationAt" TIMESTAMP(3),
    "createdBy" INTEGER NOT NULL,
    "updatedBy" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardReconciliationSession_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_card_reconciliation_reference_valid" CHECK ("referenceYear" BETWEEN 2000 AND 2200 AND "referenceMonth" BETWEEN 1 AND 12),
    CONSTRAINT "credit_card_reconciliation_revision_valid" CHECK ("revision" > 0)
);

CREATE TABLE "CreditCardReconciliationItem" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "sourceItemId" VARCHAR(64) NOT NULL,
    "identityKey" VARCHAR(64) NOT NULL,
    "position" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "resolution" "CreditCardReconciliationItemResolution" NOT NULL DEFAULT 'PENDING',
    "resolutionData" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCardReconciliationItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_card_reconciliation_item_position_valid" CHECK ("position" > 0)
);

CREATE TABLE "CreditCardReconciliationItemTransaction" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "transactionId" INTEGER,
    "transactionSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardReconciliationItemTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditCardReconciliationEvent" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "userId" INTEGER,
    "action" VARCHAR(32) NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCardReconciliationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unique_credit_card_reconciliation_session"
ON "CreditCardReconciliationSession"("accountId", "referenceYear", "referenceMonth");

CREATE INDEX "CreditCardReconciliationSession_accountId_status_idx"
ON "CreditCardReconciliationSession"("accountId", "status");

CREATE INDEX "CreditCardReconciliationSession_activeMutationAt_idx"
ON "CreditCardReconciliationSession"("activeMutationAt");

CREATE UNIQUE INDEX "unique_credit_card_reconciliation_source_item"
ON "CreditCardReconciliationItem"("sessionId", "sourceItemId");

CREATE UNIQUE INDEX "unique_credit_card_reconciliation_item_identity"
ON "CreditCardReconciliationItem"("sessionId", "identityKey");

CREATE INDEX "CreditCardReconciliationItem_sessionId_resolution_idx"
ON "CreditCardReconciliationItem"("sessionId", "resolution");

CREATE UNIQUE INDEX "unique_credit_card_reconciliation_item_transaction"
ON "CreditCardReconciliationItemTransaction"("itemId", "transactionId");

CREATE UNIQUE INDEX "unique_credit_card_reconciliation_transaction_claim"
ON "CreditCardReconciliationItemTransaction"("transactionId");

CREATE INDEX "CreditCardReconciliationEvent_sessionId_createdAt_idx"
ON "CreditCardReconciliationEvent"("sessionId", "createdAt");

CREATE INDEX "CreditCardReconciliationEvent_itemId_idx"
ON "CreditCardReconciliationEvent"("itemId");

ALTER TABLE "CreditCardReconciliationSession"
ADD CONSTRAINT "CreditCardReconciliationSession_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardReconciliationItem"
ADD CONSTRAINT "CreditCardReconciliationItem_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "CreditCardReconciliationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardReconciliationItemTransaction"
ADD CONSTRAINT "CreditCardReconciliationItemTransaction_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "CreditCardReconciliationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardReconciliationItemTransaction"
ADD CONSTRAINT "CreditCardReconciliationItemTransaction_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CreditCardReconciliationEvent"
ADD CONSTRAINT "CreditCardReconciliationEvent_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "CreditCardReconciliationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CreditCardReconciliationEvent"
ADD CONSTRAINT "CreditCardReconciliationEvent_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "CreditCardReconciliationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
