import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

interface DescriptionSuggestionRequest {
  companyId: number;
  userId: number;
  sourceDescriptions: string[];
  existingTx?: Prisma.TransactionClient;
}

/** Return the description of the last explicitly reconciled transaction visible to this user. */
export async function loadReconciliationDescriptionSuggestions({
  companyId, userId, sourceDescriptions, existingTx
}: DescriptionSuggestionRequest): Promise<Map<string, string>> {
  const descriptions = [...new Set(sourceDescriptions.filter(text => text.trim()))];
  if (!descriptions.length) return new Map();

  // Check current workspace membership, Cash access, and both sides of each linked transaction
  // in the same snapshot as the evidence. Never send descriptions from hidden accounts to the caller.
  const rows = await (existingTx ?? prisma).$queryRaw<Array<{ source: string; description: string }>>`
    WITH requested AS (
      SELECT source, cash_reconciliation_description_hash(source) AS hash
      FROM unnest(${descriptions}::text[]) AS inputs(source)
    ), visible_accounts AS (
      SELECT a.id
      FROM "UserCompany" m
      JOIN "FinancialAccount" a ON a."companyId" = m."companyId" AND a.purpose = 'GENERAL'
      JOIN "EcosystemApp" app ON app."appKey" = 'ZENIT_CASH' AND app."isActive"
      JOIN "CompanyAppEntitlement" e ON e."companyId" = m."companyId" AND e."appId" = app.id AND e.enabled
      JOIN "UserAppGrant" g ON g."companyId" = m."companyId" AND g."userId" = m."userId" AND g."appId" = app.id AND g.granted
      WHERE m."companyId" = ${companyId} AND m."userId" = ${userId}
        AND (m.role IN ('ADMIN', 'SUPERUSER') OR (m."manageFinancialAccounts" AND EXISTS (
          SELECT FROM "UserFinancialAccountAccess" p WHERE p."financialAccountId" = a.id
            AND p."userId" = m."userId" AND p."companyId" = m."companyId"
        )))
    ), evidence AS (
      SELECT h."sourceHash" AS hash, h."confirmedAt" AS decided, h."transactionId"
      FROM "CreditCardDescriptionHistory" h
      JOIN visible_accounts a ON a.id = h."accountId"
      JOIN "FinancialTransaction" t ON t.id = h."transactionId"
      WHERE h."sourceHash" IN (SELECT hash FROM requested)
        AND (t."fromAccountId" = a.id OR t."toAccountId" = a.id)
        AND h."invoiceId" = t."creditCardInvoiceId" AND h.amount = t.amount AND h.date = t.date
        AND h."installmentNumber" IS NOT DISTINCT FROM t."installmentNumber"
        AND h."totalInstallments" IS NOT DISTINCT FROM t."totalInstallments"

      UNION ALL

      SELECT cash_reconciliation_description_hash(i.description), g."createdAt", link."transactionId"
      FROM "BankStatementItem" i
      JOIN visible_accounts a ON a.id = i."accountId"
      JOIN "BankReconciliationGroup" g ON g.id = i."activeGroupId" AND g.status = 'CONFIRMED'
      JOIN "BankReconciliation" r ON r.id = g."reconciliationId" AND r."accountId" = a.id
      JOIN "BankReconciliationTransaction" link ON link."groupId" = g.id AND link."accountId" = a.id AND link.active
      JOIN "FinancialTransaction" t ON t.id = link."transactionId" AND (t."fromAccountId" = a.id OR t."toAccountId" = a.id)
      WHERE i."activeGroupId" IS NOT NULL AND i."ignoredAt" IS NULL
        AND cash_reconciliation_description_hash(i.description) IN (SELECT hash FROM requested)
        AND NOT EXISTS (SELECT FROM "BankReconciliationGroupItem" other WHERE other."groupId" = g.id AND other."itemId" <> i.id)
        AND NOT EXISTS (SELECT FROM "BankReconciliationTransaction" other WHERE other."groupId" = g.id AND other.id <> link.id)
    ), latest AS (
      SELECT DISTINCT ON (ev.hash) ev.hash, btrim(t.description) AS description
      FROM evidence ev
      JOIN "FinancialTransaction" t ON t.id = ev."transactionId" AND t."companyId" = ${companyId}
      WHERE t."entryKind" = 'NORMAL' AND t."archivedAt" IS NULL AND t.status <> 'CANCELED'
        AND NOT t."isExternalCreditCardSettlement" AND btrim(t.description) <> ''
        AND (t."fromAccountId" IS NULL OR t."fromAccountId" IN (SELECT id FROM visible_accounts))
        AND (t."toAccountId" IS NULL OR t."toAccountId" IN (SELECT id FROM visible_accounts))
      -- An undated legacy decision can fill a gap but cannot supersede a known confirmation.
      ORDER BY ev.hash, ev.decided DESC NULLS LAST, t.id DESC
    )
    SELECT requested.source, latest.description FROM requested JOIN latest USING (hash)
  `;
  return new Map(rows.map(row => [row.source, row.description]));
}
