-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "completedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementImport" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "fileHash" VARCHAR(64) NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "fileData" BYTEA NOT NULL,
    "bank" VARCHAR(16) NOT NULL,
    "format" VARCHAR(3) NOT NULL,
    "bankAccount" TEXT,
    "importedForMonth" VARCHAR(7) NOT NULL,
    "metadata" JSONB NOT NULL,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementItem" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "identityKey" VARCHAR(180) NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "description" TEXT NOT NULL,
    "normalizedDescription" TEXT NOT NULL,
    "externalId" TEXT,
    "document" TEXT,
    "activeGroupId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementImportItem" (
    "importId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "BankStatementImportItem_pkey" PRIMARY KEY ("importId","itemId")
);

-- CreateTable
CREATE TABLE "BankReconciliationGroup" (
    "id" SERIAL NOT NULL,
    "reconciliationId" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'CONFIRMED',
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "suggestion" JSONB,

    CONSTRAINT "BankReconciliationGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliationGroupItem" (
    "groupId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,

    CONSTRAINT "BankReconciliationGroupItem_pkey" PRIMARY KEY ("groupId","itemId")
);

-- CreateTable
CREATE TABLE "BankReconciliationTransaction" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "transactionId" INTEGER,
    "originalTransactionId" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "BankReconciliationTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliationEvent" (
    "id" SERIAL NOT NULL,
    "reconciliationId" INTEGER NOT NULL,
    "groupId" INTEGER,
    "userId" INTEGER,
    "action" VARCHAR(32) NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatchDecision" (
    "id" SERIAL NOT NULL,
    "reconciliationId" INTEGER NOT NULL,
    "contextKey" VARCHAR(64) NOT NULL,
    "itemIds" JSONB NOT NULL,
    "transactionIds" JSONB NOT NULL,
    "decision" VARCHAR(16) NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankMatchDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankMatchCache" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankMatchCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_accountId_month_key" ON "BankReconciliation"("accountId", "month");

-- CreateIndex
CREATE INDEX "BankStatementImport_accountId_importedForMonth_idx" ON "BankStatementImport"("accountId", "importedForMonth");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementImport_accountId_fileHash_key" ON "BankStatementImport"("accountId", "fileHash");

-- CreateIndex
CREATE INDEX "BankStatementItem_accountId_date_activeGroupId_idx" ON "BankStatementItem"("accountId", "date", "activeGroupId");

-- CreateIndex
CREATE INDEX "BankStatementItem_activeGroupId_idx" ON "BankStatementItem"("activeGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatementItem_accountId_identityKey_key" ON "BankStatementItem"("accountId", "identityKey");

-- CreateIndex
CREATE INDEX "BankStatementImportItem_itemId_idx" ON "BankStatementImportItem"("itemId");

-- CreateIndex
CREATE INDEX "BankReconciliationGroup_reconciliationId_status_idx" ON "BankReconciliationGroup"("reconciliationId", "status");

-- CreateIndex
CREATE INDEX "BankReconciliationGroupItem_itemId_idx" ON "BankReconciliationGroupItem"("itemId");

-- CreateIndex
CREATE INDEX "BankReconciliationTransaction_transactionId_idx" ON "BankReconciliationTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "BankReconciliationTransaction_groupId_idx" ON "BankReconciliationTransaction"("groupId");

-- CreateIndex
CREATE INDEX "BankReconciliationTransaction_accountId_active_idx" ON "BankReconciliationTransaction"("accountId", "active");

-- CreateIndex
CREATE INDEX "BankReconciliationEvent_reconciliationId_createdAt_idx" ON "BankReconciliationEvent"("reconciliationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatchDecision_contextKey_key" ON "BankMatchDecision"("contextKey");

-- CreateIndex
CREATE INDEX "BankMatchDecision_reconciliationId_idx" ON "BankMatchDecision"("reconciliationId");

-- CreateIndex
CREATE UNIQUE INDEX "BankMatchCache_key_key" ON "BankMatchCache"("key");

-- CreateIndex
CREATE INDEX "BankMatchCache_accountId_expiresAt_idx" ON "BankMatchCache"("accountId", "expiresAt");

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImport" ADD CONSTRAINT "BankStatementImport_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementItem" ADD CONSTRAINT "BankStatementItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementItem" ADD CONSTRAINT "BankStatementItem_activeGroupId_fkey" FOREIGN KEY ("activeGroupId") REFERENCES "BankReconciliationGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImportItem" ADD CONSTRAINT "BankStatementImportItem_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankStatementImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementImportItem" ADD CONSTRAINT "BankStatementImportItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BankStatementItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationGroup" ADD CONSTRAINT "BankReconciliationGroup_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationGroupItem" ADD CONSTRAINT "BankReconciliationGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BankReconciliationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationGroupItem" ADD CONSTRAINT "BankReconciliationGroupItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "BankStatementItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationTransaction" ADD CONSTRAINT "BankReconciliationTransaction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BankReconciliationGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationTransaction" ADD CONSTRAINT "BankReconciliationTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationEvent" ADD CONSTRAINT "BankReconciliationEvent_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchDecision" ADD CONSTRAINT "BankMatchDecision_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankMatchCache" ADD CONSTRAINT "BankMatchCache_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A transfer may be reconciled once on each account, but never twice on one side.
CREATE UNIQUE INDEX "bank_active_transaction_once" ON "BankReconciliationTransaction" ("accountId", "transactionId")
  WHERE "active" = true AND "transactionId" IS NOT NULL;
CREATE INDEX "BankStatementItem_accountId_externalId_idx" ON "BankStatementItem" ("accountId", "externalId");
ALTER TABLE "BankStatementItem" ADD CONSTRAINT "bank_item_nonzero" CHECK (amount <> 0);
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "bank_month_valid" CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "bank_session_status" CHECK (status IN ('OPEN', 'COMPLETED'));
ALTER TABLE "BankReconciliationGroup" ADD CONSTRAINT "bank_group_status" CHECK (status IN ('CONFIRMED', 'REVIEW', 'UNDONE'));

-- Every financial writer (including invoice settlement, archive and reset) observes this invariant.
-- Snapshots and memberships remain as audit evidence; only active claims are released.
CREATE FUNCTION invalidate_bank_reconciliation() RETURNS trigger AS $$
DECLARE affected_groups INTEGER[];
DECLARE affected_months INTEGER[];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.amount, OLD."paidAmount", OLD.type, OLD."entryKind", OLD.status, OLD.date, OLD."effectiveDate",
        OLD."fromAccountId", OLD."toAccountId", OLD."archivedAt", OLD."isExternalCreditCardSettlement", OLD."companyId")
       IS NOT DISTINCT FROM
       (NEW.amount, NEW."paidAmount", NEW.type, NEW."entryKind", NEW.status, NEW.date, NEW."effectiveDate",
        NEW."fromAccountId", NEW."toAccountId", NEW."archivedAt", NEW."isExternalCreditCardSettlement", NEW."companyId") THEN
      RETURN NEW;
    END IF;
  END IF;
  -- A retrospective insertion or a move between months also reopens closed work.
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.status = 'COMPLETED' AND NEW."entryKind" = 'NORMAL' AND NEW."archivedAt" IS NULL AND NOT NEW."isExternalCreditCardSettlement" THEN
      SELECT array_agg(id) INTO affected_months FROM "BankReconciliation"
        WHERE "accountId" IN (NEW."fromAccountId", NEW."toAccountId") AND status = 'COMPLETED'
          AND month = to_char(COALESCE(NEW."effectiveDate", NEW.date), 'YYYY-MM');
      IF affected_months IS NOT NULL THEN
        UPDATE "BankReconciliation" SET status = 'OPEN', "completedAt" = NULL, "completedBy" = NULL, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ANY(affected_months);
        INSERT INTO "BankReconciliationEvent" ("reconciliationId", action, details)
          SELECT unnest(affected_months), 'MONTH_TRANSACTIONS_CHANGED', jsonb_build_object('transactionId', NEW.id, 'operation', TG_OP);
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT "groupId") INTO affected_groups
    FROM "BankReconciliationTransaction" WHERE "transactionId" = OLD.id AND active = true;
  IF affected_groups IS NOT NULL THEN
    UPDATE "BankReconciliationGroup" SET status = 'REVIEW', "updatedAt" = CURRENT_TIMESTAMP WHERE id = ANY(affected_groups);
    UPDATE "BankStatementItem" SET "activeGroupId" = NULL WHERE "activeGroupId" = ANY(affected_groups);
    UPDATE "BankReconciliationTransaction" SET active = false WHERE "groupId" = ANY(affected_groups);
    UPDATE "BankReconciliation" SET status = 'OPEN', "completedAt" = NULL, "completedBy" = NULL, "updatedAt" = CURRENT_TIMESTAMP
      WHERE id IN (SELECT "reconciliationId" FROM "BankReconciliationGroup" WHERE id = ANY(affected_groups));
    INSERT INTO "BankReconciliationEvent" ("reconciliationId", "groupId", action, details)
      SELECT "reconciliationId", id, 'TRANSACTION_CHANGED', jsonb_build_object('transactionId', OLD.id, 'operation', TG_OP)
      FROM "BankReconciliationGroup" WHERE id = ANY(affected_groups);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER bank_reconciliation_financial_change BEFORE INSERT OR UPDATE OR DELETE ON "FinancialTransaction"
  FOR EACH ROW EXECUTE FUNCTION invalidate_bank_reconciliation();
