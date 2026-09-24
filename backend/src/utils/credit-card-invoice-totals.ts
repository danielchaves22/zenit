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
  creditCardInvoicePayment: Prisma.TransactionClient['creditCardInvoicePayment'];
};

export type CreditCardInvoiceTotals = {
  chargeAmount: Prisma.Decimal;
  creditAmount: Prisma.Decimal;
  paymentAmount: Prisma.Decimal;
  externalSettledAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  transactionCount: number;
  externalSettlementCount: number;
};

function zeroTotals(): CreditCardInvoiceTotals {
  const zero = new Prisma.Decimal(0);

  return {
    chargeAmount: zero,
    creditAmount: zero,
    paymentAmount: zero,
    externalSettledAmount: zero,
    totalAmount: zero,
    outstandingAmount: zero,
    transactionCount: 0,
    externalSettlementCount: 0
  };
}

export async function calculateCreditCardInvoiceTotals(
  db: InvoiceTotalsClient,
  invoiceId: number
): Promise<CreditCardInvoiceTotals> {
  const [charges, credits, payments, transactionCount, externalSettlements] = await Promise.all([
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
    db.creditCardInvoicePayment.aggregate({
      where: {
        invoiceId,
        transaction: {
          status: TransactionStatus.COMPLETED
        }
      },
      _sum: { amount: true }
    }),
    db.financialTransaction.count({
      where: { creditCardInvoiceId: invoiceId }
    }),
    db.financialTransaction.aggregate({
      where: {
        creditCardInvoiceId: invoiceId,
        type: TransactionType.EXPENSE,
        status: TransactionStatus.COMPLETED,
        isExternalCreditCardSettlement: true
      },
      _sum: { amount: true },
      _count: { _all: true }
    })
  ]);
  const chargeAmount = charges._sum.amount ?? new Prisma.Decimal(0);
  const creditAmount = credits._sum.amount ?? new Prisma.Decimal(0);
  const paymentAmount = payments._sum.amount ?? new Prisma.Decimal(0);
  const externalSettledAmount = externalSettlements._sum.amount ?? new Prisma.Decimal(0);
  const totalAmount = chargeAmount.minus(creditAmount);

  return {
    chargeAmount,
    creditAmount,
    paymentAmount,
    externalSettledAmount,
    totalAmount,
    outstandingAmount: totalAmount.minus(paymentAmount).minus(externalSettledAmount),
    transactionCount,
    externalSettlementCount: externalSettlements._count._all
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

  const [charges, credits, payments, transactionCounts, externalSettlements] = await Promise.all([
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
    db.creditCardInvoicePayment.groupBy({
      by: ['invoiceId'],
      where: {
        invoiceId: { in: uniqueInvoiceIds },
        transaction: {
          status: TransactionStatus.COMPLETED
        }
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
      _sum: { amount: true },
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
  for (const item of payments) {
    result.get(item.invoiceId)!.paymentAmount = item._sum.amount ?? new Prisma.Decimal(0);
  }
  for (const item of transactionCounts) {
    if (item.creditCardInvoiceId === null) continue;
    result.get(item.creditCardInvoiceId)!.transactionCount = item._count._all;
  }
  for (const item of externalSettlements) {
    if (item.creditCardInvoiceId === null) continue;
    result.get(item.creditCardInvoiceId)!.externalSettledAmount =
      item._sum.amount ?? new Prisma.Decimal(0);
    result.get(item.creditCardInvoiceId)!.externalSettlementCount = item._count._all;
  }
  for (const totals of result.values()) {
    totals.totalAmount = totals.chargeAmount.minus(totals.creditAmount);
    totals.outstandingAmount = totals.totalAmount
      .minus(totals.paymentAmount)
      .minus(totals.externalSettledAmount);
  }

  return result;
}
