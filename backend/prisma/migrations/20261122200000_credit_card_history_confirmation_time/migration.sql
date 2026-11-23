BEGIN;

ALTER TABLE "CreditCardDescriptionHistory" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Use the explicit decision for the surviving statement item.
UPDATE "CreditCardDescriptionHistory" h
SET "confirmedAt" = i."resolvedAt"
FROM "CreditCardReconciliationItem" i
WHERE h."itemId" = i.id AND i."resolvedAt" IS NOT NULL AND (
    (i.resolution = 'IMPORTED' AND i."resolutionData"->>'action' = 'IMPORT'
     AND i."resolutionData"->'transactionIds' @> jsonb_build_array(h."transactionId"))
    OR (i.resolution = 'CONFIRMED_EXISTING' AND i."resolutionData"->>'mode' IS NULL
        AND i."resolutionData"->'transactionIds' = jsonb_build_array(h."transactionId"))
);

-- A replacement detaches item IDs but retains the invoice's decision events.
-- Match the specific transaction. A later unconfirmation cancels that evidence.
WITH latest_event AS (
    SELECT DISTINCT ON (h."transactionId")
           h."transactionId", e.action, e."createdAt"
    FROM "CreditCardDescriptionHistory" h
    JOIN "CreditCardInvoice" invoice ON invoice.id = h."invoiceId" AND invoice."accountId" = h."accountId"
    JOIN "CreditCardReconciliationSession" s ON s."accountId" = invoice."accountId"
        AND s."referenceYear" = invoice."referenceYear" AND s."referenceMonth" = invoice."referenceMonth"
    JOIN "CreditCardReconciliationEvent" e ON e."sessionId" = s.id
        AND e."itemId" IS NOT DISTINCT FROM h."itemId"
    WHERE h."confirmedAt" IS NULL AND (
        (e.action = 'IMPORTED' AND e.details->>'resultStatus' = 'CREATED'
         AND e.details->'createdTransactionIds' @> jsonb_build_array(h."transactionId"))
        OR (e.action = 'CONFIRM_EXISTING' AND e.details->'transactionIds' = jsonb_build_array(h."transactionId"))
        OR (e.action = 'UNCONFIRM_EXISTING' AND e.details->'transactionIds' @> jsonb_build_array(h."transactionId"))
    )
    ORDER BY h."transactionId", e."createdAt" DESC, e.id DESC
)
UPDATE "CreditCardDescriptionHistory" h
SET "confirmedAt" = e."createdAt"
FROM latest_event e
WHERE h."transactionId" = e."transactionId" AND e.action IN ('IMPORTED','CONFIRM_EXISTING');

-- After a reset the createdAt of an individually imported purchase still
-- proves an explicit import for this same source description. Generated
-- installments and ordinary ledger purchases cannot establish that date.
UPDATE "CreditCardDescriptionHistory" h
SET "confirmedAt" = t."createdAt"
FROM "FinancialTransaction" t
WHERE h."confirmedAt" IS NULL AND h."transactionId" = t.id
    AND t."fromAccountId" = h."accountId" AND t."creditCardInvoiceId" = h."invoiceId" AND t.type = 'EXPENSE'
    AND t."importSourceType" = h."sourceType" AND t."importSourceDescription" = h."sourceDescription"
    AND t.notes LIKE ('Importado por conciliacao de cartao (' || h."sourceType"::text || ') - item %')
    AND COALESCE(t."installmentNumber", 1) = 1 AND COALESCE(t."totalInstallments", 1) = 1;

-- Other decisions lost with pre-migration session resets keep NULL. Neither
-- the purchase date nor the migration time is a reconciliation decision.
COMMIT;
