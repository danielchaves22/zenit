BEGIN;

-- Byte-for-byte equivalent to normalizeCreditCardHistoryDescription and its UTF-8 hash.
-- Preserve merchant numbers and significant symbols for both bank and card descriptions.
CREATE FUNCTION cash_reconciliation_description_hash(value text) RETURNS char(64)
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
    SELECT encode(sha256(convert_to(nullif(btrim(regexp_replace(
        translate(regexp_replace(normalize(value, NFD), U&'[\0300-\036F]', '', 'g'),
            'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        U&'[\0009-\000D \00A0,./:_-]+', ' ', 'g')), ''), 'UTF8')), 'hex')::char(64);
$$;

CREATE INDEX "idx_credit_card_description_history_hash" ON "CreditCardDescriptionHistory"("sourceHash");
CREATE INDEX "idx_bank_confirmed_description_hash" ON "BankStatementItem" (cash_reconciliation_description_hash(description))
    WHERE "activeGroupId" IS NOT NULL AND "ignoredAt" IS NULL;

-- Older card history covered expenses only. Keep the one transaction explicitly confirmed or
-- imported per item, including the real anchor of an installment series, for either direction.
INSERT INTO "CreditCardDescriptionHistory" (
    "transactionId", "itemId", "accountId", "sourceType", "sourceDescription", "sourceHash",
    kind, "invoiceId", amount, date, "installmentNumber", "totalInstallments", "confirmedAt"
)
SELECT t.id, i.id, s."accountId", s."sourceType", i.snapshot->>'sourceDescription',
       cash_reconciliation_description_hash(i.snapshot->>'sourceDescription'), i.snapshot->>'kind',
       (l."transactionSnapshot"->>'creditCardInvoiceId')::int, (l."transactionSnapshot"->>'amount')::numeric,
       (l."transactionSnapshot"->>'date')::timestamptz AT TIME ZONE 'UTC',
       (l."transactionSnapshot"->>'installmentNumber')::int, (l."transactionSnapshot"->>'totalInstallments')::int,
       i."resolvedAt"
FROM "CreditCardReconciliationItem" i
JOIN "CreditCardReconciliationSession" s ON s.id = i."sessionId"
JOIN "CreditCardReconciliationItemTransaction" l ON l."itemId" = i.id
JOIN "FinancialTransaction" t ON t.id = l."transactionId"
WHERE cash_reconciliation_description_hash(i.snapshot->>'sourceDescription') IS NOT NULL
  AND i.snapshot->>'kind' IS NOT NULL AND l."transactionSnapshot"->>'creditCardInvoiceId' IS NOT NULL
  AND l."transactionSnapshot"->>'amount' IS NOT NULL AND l."transactionSnapshot"->>'date' IS NOT NULL
  AND (t."fromAccountId" = s."accountId" OR t."toAccountId" = s."accountId")
  AND ((i.resolution = 'IMPORTED' AND i."resolutionData"->>'action' IN ('IMPORT','IMPORT_CREDIT'))
    OR (i.resolution = 'CONFIRMED_EXISTING' AND i."resolutionData"->>'mode' IS NULL
        AND i."resolutionData"->'transactionIds' = jsonb_build_array(t.id)
        AND EXISTS (SELECT FROM "CreditCardReconciliationEvent" e WHERE e."itemId" = i.id AND e.action = 'CONFIRM_EXISTING')))
  AND NOT EXISTS (SELECT FROM "CreditCardReconciliationItemTransaction" other WHERE other."itemId" = i.id AND other.id <> l.id)
ON CONFLICT DO NOTHING;

-- A reset can leave only the provenance written by an explicit card import. Recover single
-- purchases/credits across all formats without guessing the old parser kind or an installment anchor.
-- LEGACY_IMPORT participates only in the global description lookup, never in category matching.
INSERT INTO "CreditCardDescriptionHistory" (
    "transactionId", "accountId", "sourceType", "sourceDescription", "sourceHash", kind,
    "invoiceId", amount, date, "installmentNumber", "totalInstallments", "confirmedAt"
)
SELECT t.id, invoice."accountId", t."importSourceType", t."importSourceDescription",
       cash_reconciliation_description_hash(t."importSourceDescription"), 'LEGACY_IMPORT',
       invoice.id, t.amount, t.date, t."installmentNumber", t."totalInstallments", t."createdAt"
FROM "FinancialTransaction" t
JOIN "CreditCardInvoice" invoice ON invoice.id = t."creditCardInvoiceId"
JOIN "FinancialAccount" a ON a.id = invoice."accountId" AND a."companyId" = t."companyId"
WHERE ((t.type = 'EXPENSE' AND t."fromAccountId" = a.id) OR (t.type = 'INCOME' AND t."toAccountId" = a.id))
  AND t."entryKind" = 'NORMAL' AND t."importSourceType" IS NOT NULL
  AND cash_reconciliation_description_hash(t."importSourceDescription") IS NOT NULL
  AND t.notes LIKE ('Importado por conciliacao de cartao (' || t."importSourceType"::text || ') - item %')
  AND coalesce(t."installmentNumber", 1) = 1 AND coalesce(t."totalInstallments", 1) = 1
  AND NOT EXISTS (SELECT FROM "CreditCardDescriptionHistory" h WHERE h."transactionId" = t.id)
  AND NOT EXISTS (
    SELECT FROM "CreditCardReconciliationEvent" e
    JOIN "CreditCardReconciliationSession" s ON s.id = e."sessionId" AND s."accountId" = a.id
    LEFT JOIN "CreditCardReconciliationItem" i ON i.id = e."itemId"
    WHERE (e.action = 'UNCONFIRM_EXISTING' AND e.details->'transactionIds' @> jsonb_build_array(t.id))
       OR (e.action = 'INVALIDATE' AND e.details->>'previousResolution' = 'IMPORTED'
           AND s."sourceType" = t."importSourceType" AND s."referenceYear" = invoice."referenceYear"
           AND s."referenceMonth" = invoice."referenceMonth" AND position((' - item ' || i."sourceItemId" || ' - ') IN t.notes) > 0)
  )
ON CONFLICT DO NOTHING;

COMMIT;
