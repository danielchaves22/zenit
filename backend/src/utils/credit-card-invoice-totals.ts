import {
  Prisma,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import {
  getCreditCardInvoiceSignedAmount,
  isCreditCardInvoiceCredit
} from './financial-transaction-amount';

export {
  getCreditCardInvoiceSignedAmount,
  isCreditCardInvoiceCredit
} from './financial-transaction-amount';

type InvoiceTotalsClient = {
  financialTransaction: Prisma.TransactionClient['financialTransaction'];
};

export type CreditCardInvoiceTotals = {
  chargeAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  transactionCount: number;
  externalSettlementCount: number;
};

function zeroTotals(): CreditCardInvoiceTotals {
  const zero = new Prisma.Decimal(0);

  return {
    chargeAmount: zero,
    creditAmount: zero,
    totalAmount: zero,
    transactionCount: 0,
    externalSettlementCount: 0
  };
}

export async function calculateCreditCardInvoiceTotals(
  db: InvoiceTotalsClient,
  invoiceId: number
): Promise<CreditCardInvoiceTotals> {
  const [charges, credits, transactionCount, externalSettlementCount] = await Promise.all([
    db.financialTransaction.aggregate({
      where: {
        creditCardInvoiceId: invoiceId,
        type: TransactionType.EXPENSE,
        status: TransactionStatus.COMPLETED
      },
      _sum: { amount: true }
    }),
    db.financialTransaction.aggregate({
      where: {
        creditCardInvoiceId: invoiceId,
        type: TransactionType.INCOME,
        creditCardCreditKind: { not: null },
        status: TransactionStatus.COMPLETED
      },
      _sum: { amount: true }
    }),
    db.financialTransaction.count({
      where: { creditCardInvoiceId: invoiceId }
    }),
    db.financialTransaction.count({
      where: {
        creditCardInvoiceId: invoiceId,
        type: TransactionType.EXPENSE,
        status: TransactionStatus.COMPLETED,
        isExternalCreditCardSettlement: true
      }
    })
  ]);
  const chargeAmount = charges._sum.amount ?? new Prisma.Decimal(0);
  const creditAmount = credits._sum.amount ?? new Prisma.Decimal(0);

  return {
    chargeAmount,
    creditAmount,
    totalAmount: chargeAmount.minus(creditAmount),
    transactionCount,
    externalSettlementCount
  };
}

export async function calculateCreditCardInvoiceTotalsByIds(
  db: InvoiceTotalsClient,
  invoiceIds: number[]
): Promise<Map<number, CreditCardInvoiceTotals>> {
  const uniqueInvoiceIds = Array.from(new Set(invoiceIds));
  if (uniqueInvoiceIds.length === 0) {
    return new Map();
  }

  const [charges, credits, transactionCounts, externalSettlementCounts] = await Promise.all([
    db.financialTransaction.groupBy({
      by: ['creditCardInvoiceId'],
      where: {
        creditCardInvoiceId: { in: uniqueInvoiceIds },
        type: TransactionType.EXPENSE,
        status: TransactionStatus.COMPLETED
      },
      _sum: { amount: true }
    }),
    db.financialTransaction.groupBy({
      by: ['creditCardInvoiceId'],
      where: {
        creditCardInvoiceId: { in: uniqueInvoiceIds },
        type: TransactionType.INCOME,
        creditCardCreditKind: { not: null },
        status: TransactionStatus.COMPLETED
      },
      _sum: { amount: true }
    }),
    db.financialTransaction.groupBy({
      by: ['creditCardInvoiceId'],
      where: { creditCardInvoiceId: { in: uniqueInvoiceIds } },
      _count: { _all: true }
    }),
    db.financialTransaction.groupBy({
      by: ['creditCardInvoiceId'],
      where: {
        creditCardInvoiceId: { in: uniqueInvoiceIds },
        type: TransactionType.EXPENSE,
        status: TransactionStatus.COMPLETED,
        isExternalCreditCardSettlement: true
      },
      _count: { _all: true }
    })
  ]);
  const result = new Map<number, CreditCardInvoiceTotals>(
    uniqueInvoiceIds.map((invoiceId) => [invoiceId, zeroTotals()])
  );

  for (const item of charges) {
    if (item.creditCardInvoiceId === null) continue;
    result.get(item.creditCardInvoiceId)!.chargeAmount =
      item._sum.amount ?? new Prisma.Decimal(0);
  }
  for (const item of credits) {
    if (item.creditCardInvoiceId === null) continue;
    result.get(item.creditCardInvoiceId)!.creditAmount =
      item._sum.amount ?? new Prisma.Decimal(0);
  }
  for (const item of transactionCounts) {
    if (item.creditCardInvoiceId === null) continue;
    result.get(item.creditCardInvoiceId)!.transactionCount = item._count._all;
  }
  for (const item of externalSettlementCounts) {
    if (item.creditCardInvoiceId === null) continue;
    result.get(item.creditCardInvoiceId)!.externalSettlementCount = item._count._all;
  }
  for (const totals of result.values()) {
    totals.totalAmount = totals.chargeAmount.minus(totals.creditAmount);
  }

  return result;
}
