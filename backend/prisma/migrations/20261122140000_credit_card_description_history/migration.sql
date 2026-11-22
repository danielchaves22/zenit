BEGIN;

CREATE TABLE "CreditCardDescriptionHistory" (
    "transactionId" INTEGER NOT NULL PRIMARY KEY REFERENCES "FinancialTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "itemId" INTEGER UNIQUE REFERENCES "CreditCardReconciliationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "accountId" INTEGER NOT NULL,
    "sourceType" "FinancialTransactionImportSourceType" NOT NULL,
    "sourceDescription" TEXT NOT NULL,
    "sourceHash" CHAR(64) NOT NULL,
    "kind" TEXT NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "installmentNumber" INTEGER,
    "totalInstallments" INTEGER
);
CREATE INDEX "idx_credit_card_description_history_source"
    ON "CreditCardDescriptionHistory"("accountId", "sourceType", "sourceHash");

-- Migration-only equivalent of normalizeCreditCardHistoryDescription. No server
-- extensions or locale-dependent case conversion are required.
CREATE FUNCTION pg_temp.cash_description_key(value TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT btrim(regexp_replace(
        translate(regexp_replace(normalize(value, NFD), U&'[\0300-\036F]', '', 'g'),
            'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        U&'[\0009-\000D \00A0,./:_-]+', ' ', 'g'));
$$;

-- Preserve only still-resolved human decisions with one actual link. Even when
-- an import created an installment group, its stored link is to the invoice anchor.
INSERT INTO "CreditCardDescriptionHistory" (
    "transactionId", "itemId", "accountId", "sourceType", "sourceDescription", "sourceHash",
    "kind", "invoiceId", "amount", "date", "installmentNumber", "totalInstallments"
)
SELECT t.id, i.id, s."accountId", s."sourceType", i.snapshot->>'sourceDescription',
       encode(sha256(convert_to(pg_temp.cash_description_key(i.snapshot->>'sourceDescription'), 'UTF8')), 'hex'),
       i.snapshot->>'kind', (link."transactionSnapshot"->>'creditCardInvoiceId')::integer,
       (link."transactionSnapshot"->>'amount')::numeric,
       (link."transactionSnapshot"->>'date')::timestamptz AT TIME ZONE 'UTC',
       (link."transactionSnapshot"->>'installmentNumber')::integer,
       (link."transactionSnapshot"->>'totalInstallments')::integer
FROM "CreditCardReconciliationItem" i
JOIN "CreditCardReconciliationSession" s ON s.id = i."sessionId"
JOIN "CreditCardReconciliationItemTransaction" link ON link."itemId" = i.id
JOIN "FinancialTransaction" t ON t.id = link."transactionId"
WHERE i.snapshot->>'direction' = 'DEBIT'
  AND i.snapshot->>'kind' IN ('PURCHASE','INSTALLMENT','ANNUITY','INTEREST','FEE','TAX','OTHER')
  AND pg_temp.cash_description_key(i.snapshot->>'sourceDescription') <> ''
  AND link."transactionSnapshot"->>'creditCardInvoiceId' IS NOT NULL
  AND link."transactionSnapshot"->>'amount' IS NOT NULL AND link."transactionSnapshot"->>'date' IS NOT NULL
  AND t.type = 'EXPENSE' AND t."fromAccountId" = s."accountId"
  AND (
    (i.resolution = 'IMPORTED' AND i."resolutionData"->>'action' = 'IMPORT')
    OR (i.resolution = 'CONFIRMED_EXISTING' AND i."resolutionData"->>'mode' IS NULL
        AND jsonb_array_length(i."resolutionData"->'transactionIds') = 1
        AND EXISTS (SELECT 1 FROM "CreditCardReconciliationEvent" e
                    WHERE e."itemId" = i.id AND e.action = 'CONFIRM_EXISTING'))
  )
  AND NOT EXISTS (SELECT 1 FROM "CreditCardReconciliationItemTransaction" other
                  WHERE other."itemId" = i.id AND other.id <> link.id);

-- Earlier resets discarded the statement and its item snapshots. A single
-- explicitly imported CSV purchase has enough provenance on the financial row.
-- Other CSV kinds, unknown PDF sections/OFX transaction types and generated
-- installments with no provable anchor are deliberately left out.
INSERT INTO "CreditCardDescriptionHistory" (
    "transactionId", "accountId", "sourceType", "sourceDescription", "sourceHash",
    "kind", "invoiceId", "amount", "date", "installmentNumber", "totalInstallments"
)
SELECT t.id, t."fromAccountId", t."importSourceType", t."importSourceDescription",
       encode(sha256(convert_to(k.description, 'UTF8')), 'hex'), 'PURCHASE',
       invoice.id, t.amount, t.date, t."installmentNumber", t."totalInstallments"
FROM "FinancialTransaction" t
JOIN "CreditCardInvoice" invoice ON invoice.id = t."creditCardInvoiceId" AND invoice."accountId" = t."fromAccountId"
CROSS JOIN LATERAL (SELECT pg_temp.cash_description_key(t."importSourceDescription") AS description) k
WHERE t.type = 'EXPENSE' AND t."entryKind" = 'NORMAL'
  AND t."importSourceType" IN ('NUBANK_CSV','BRADESCO_CSV')
  AND t.notes LIKE 'Importado por conciliacao de cartao (%) - item %'
  AND COALESCE(t."totalInstallments", 1) = 1
  AND COALESCE(t."installmentNumber", 1) = 1
  AND k.description <> ''
  AND k.description !~ 'ANUIDADE|IOF|JUROS|ENCARGO|MULTA|MORA|^(TOTAL DA FATURA ANTERIOR|SALDO ANTERIOR)'
  AND NOT EXISTS (
    SELECT 1 FROM "CreditCardReconciliationEvent" e
    JOIN "CreditCardReconciliationItem" i ON i.id = e."itemId"
    JOIN "CreditCardReconciliationSession" s ON s.id = i."sessionId"
    WHERE e.action = 'INVALIDATE' AND e.details->>'previousResolution' = 'IMPORTED'
      AND s."accountId" = invoice."accountId" AND s."sourceType" = t."importSourceType"
      AND s."referenceYear" = invoice."referenceYear" AND s."referenceMonth" = invoice."referenceMonth"
      AND position((' - item ' || i."sourceItemId" || ' - ') IN t.notes) > 0
  )
ON CONFLICT ("transactionId") DO NOTHING;

COMMIT;
