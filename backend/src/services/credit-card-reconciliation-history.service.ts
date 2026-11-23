import { createHash } from 'crypto';
import type { FinancialTransaction, FinancialTransactionImportSourceType, Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

export interface CreditCardDescriptionHistoryOption {
  description: string;
  categoryId: number | null;
  categoryName: string | null;
  count: number;
  lastConfirmedAt: string | null;
}

interface StatementItem {
  id: string;
  kind: string;
  direction: string;
  sourceDescription: string;
}

const expenseKinds = new Set(['PURCHASE', 'INSTALLMENT', 'ANNUITY', 'INTEREST', 'FEE', 'TAX', 'OTHER']);

// Keep digits, word boundaries and merchant-specific symbols. The one-time SQL
// backfill uses the same accent folding, ASCII casing and common separators.
export function normalizeCreditCardHistoryDescription(text: string): string {
  return text.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[a-z]/g, letter => letter.toUpperCase())
    .replace(/[\t-\r \u00a0,./:_-]+/g, ' ')
    .replace(/^ | $/g, '');
}

function hashDescription(normalized: string) {
  return createHash('sha256').update(normalized).digest('hex');
}

export async function recordCreditCardDescriptionHistory(
  tx: Prisma.TransactionClient,
  sourceType: FinancialTransactionImportSourceType,
  itemId: number,
  item: Pick<StatementItem, 'kind' | 'direction' | 'sourceDescription'>,
  transaction: Pick<FinancialTransaction,
    'id' | 'fromAccountId' | 'toAccountId' | 'creditCardInvoiceId' | 'amount' | 'date' | 'installmentNumber' | 'totalInstallments'>,
  confirmedAt: Date
) {
  const normalized = normalizeCreditCardHistoryDescription(item.sourceDescription);
  const accountId = item.direction === 'CREDIT' ? transaction.toAccountId : transaction.fromAccountId;
  if (!normalized || !accountId || !transaction.creditCardInvoiceId) {
    return;
  }

  const evidence = {
    itemId,
    accountId,
    sourceType,
    sourceDescription: item.sourceDescription,
    sourceHash: hashDescription(normalized),
    kind: item.kind,
    invoiceId: transaction.creditCardInvoiceId,
    amount: transaction.amount,
    date: transaction.date,
    installmentNumber: transaction.installmentNumber,
    totalInstallments: transaction.totalInstallments,
    confirmedAt
  };
  await tx.creditCardDescriptionHistory.upsert({
    where: { transactionId: transaction.id },
    create: { transactionId: transaction.id, ...evidence },
    update: evidence
  });
}

export async function loadCreditCardDescriptionHistory(params: {
  companyId: number;
  accountId: number;
  sourceType: FinancialTransactionImportSourceType;
  targetReferenceYear: number;
  targetReferenceMonth: number;
  items: readonly StatementItem[];
  existingTx?: Prisma.TransactionClient;
}): Promise<Map<string, CreditCardDescriptionHistoryOption[]>> {
  const requested = new Map<string, string>();
  const sourceHashes = new Set<string>();
  for (const item of params.items) {
    if (item.direction !== 'DEBIT' || !expenseKinds.has(item.kind)) continue;
    const normalized = normalizeCreditCardHistoryDescription(item.sourceDescription);
    if (!normalized) continue;
    const hash = hashDescription(normalized);
    sourceHashes.add(hash);
    requested.set(item.id, item.kind + ':' + hash);
  }
  const result = new Map<string, CreditCardDescriptionHistoryOption[]>();
  if (requested.size === 0) return result;

  const nubank = params.sourceType === 'NUBANK_CSV' || params.sourceType === 'NUBANK_OFX';
  const records = await (params.existingTx ?? prisma).creditCardDescriptionHistory.findMany({
    where: {
      accountId: params.accountId,
      sourceType: nubank ? { in: ['NUBANK_CSV', 'NUBANK_OFX'] } : params.sourceType,
      sourceHash: { in: [...sourceHashes] },
      transaction: {
        companyId: params.companyId, fromAccountId: params.accountId, type: 'EXPENSE',
        entryKind: 'NORMAL', archivedAt: null, status: { not: 'CANCELED' },
        isExternalCreditCardSettlement: false, creditCardCreditKind: null,
        creditCardInvoice: {
          accountId: params.accountId,
          OR: [
            { referenceYear: { lt: params.targetReferenceYear } },
            { referenceYear: params.targetReferenceYear, referenceMonth: { lt: params.targetReferenceMonth } }
          ]
        }
      }
    },
    include: {
      transaction: {
        select: {
          creditCardInvoiceId: true, amount: true, date: true,
          installmentNumber: true, totalInstallments: true, description: true,
          category: { select: { id: true, name: true, companyId: true, type: true } }
        }
      }
    },
    // The first eligible record for each pair supplies its latest verified
    // choice. Transaction ID breaks simultaneous decisions and undated ties.
    orderBy: [{ confirmedAt: { sort: 'desc', nulls: 'last' } }, { transactionId: 'desc' }]
  });

  const groups = new Map<string, Map<string, CreditCardDescriptionHistoryOption>>();
  for (const record of records) {
    const current = record.transaction;
    if (
      record.invoiceId !== current.creditCardInvoiceId ||
      !record.amount.equals(current.amount) ||
      record.date.getTime() !== current.date.getTime() ||
      record.installmentNumber !== current.installmentNumber ||
      record.totalInstallments !== current.totalInstallments
    ) continue;
    const description = current.description.trim();
    if (!description) continue;
    const category = current.category?.companyId === params.companyId && current.category.type === 'EXPENSE'
      ? current.category : null;
    const key = record.kind + ':' + record.sourceHash;
    const options = groups.get(key) ?? new Map<string, CreditCardDescriptionHistoryOption>();
    const optionKey = JSON.stringify([normalizeCreditCardHistoryDescription(description), category?.id ?? null]);
    const previous = options.get(optionKey);
    if (previous) {
      previous.count++;
    } else {
      options.set(optionKey, {
        description, categoryId: category?.id ?? null, categoryName: category?.name ?? null,
        count: 1, lastConfirmedAt: record.confirmedAt?.toISOString() ?? null
      });
    }
    groups.set(key, options);
  }
  for (const [itemId, key] of requested) {
    const options = groups.get(key);
    if (options) {
      // Keep the database's transaction ID order when time and count tie.
      result.set(itemId, [...options.values()].sort((a, b) =>
        (b.lastConfirmedAt ?? '').localeCompare(a.lastConfirmedAt ?? '') || b.count - a.count
      ));
    }
  }
  return result;
}
