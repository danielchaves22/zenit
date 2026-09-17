import {
  CreditCardInvoiceStatus,
  FinancialAccountPurpose,
  FinancialTransactionEntryKind,
  Prisma,
  TransactionStatus
} from '@prisma/client';

export type IgnoredTransactionState = 'ACTIVE' | 'IGNORED' | 'ALL';
export type FinancialRecognitionPerspective =
  | 'MATERIALIZED'
  | 'ECONOMIC'
  | 'SETTLEMENT';

export function buildFinancialRecognitionWhere(
  perspective: FinancialRecognitionPerspective
): Prisma.FinancialTransactionWhereInput {
  if (perspective === 'MATERIALIZED') {
    return {
      status: {
        not: TransactionStatus.CANCELED
      }
    };
  }

  if (perspective === 'ECONOMIC') {
    return {
      status: TransactionStatus.COMPLETED
    };
  }

  return {
    status: TransactionStatus.COMPLETED,
    OR: [
      { creditCardInvoiceId: null },
      {
        creditCardInvoice: {
          is: {
            status: CreditCardInvoiceStatus.PAID
          }
        }
      }
    ]
  };
}

export function buildIgnoredTransactionWhere(
  ignoredState: IgnoredTransactionState = 'ACTIVE'
): Prisma.FinancialTransactionWhereInput {
  if (ignoredState === 'IGNORED') {
    return {
      archivedAt: {
        not: null
      }
    };
  }

  if (ignoredState === 'ALL') {
    return {};
  }

  return {
    archivedAt: null
  };
}

export function buildOperationalTransactionWhere(options?: {
  ignoredState?: IgnoredTransactionState;
  includeBudgetTransactions?: boolean;
  includeBalanceAdjustments?: boolean;
}): Prisma.FinancialTransactionWhereInput {
  const filters: Prisma.FinancialTransactionWhereInput[] = [
    {
      entryKind: options?.includeBalanceAdjustments
        ? {
            in: [
              FinancialTransactionEntryKind.NORMAL,
              FinancialTransactionEntryKind.BALANCE_ADJUSTMENT
            ]
          }
        : FinancialTransactionEntryKind.NORMAL
    }
  ];

  const ignoredWhere = buildIgnoredTransactionWhere(options?.ignoredState);
  if (Object.keys(ignoredWhere).length > 0) {
    filters.push(ignoredWhere);
  }

  if (!options?.includeBudgetTransactions) {
    filters.push(
      { NOT: { fromAccount: { is: { purpose: FinancialAccountPurpose.BUDGET } } } },
      { NOT: { toAccount: { is: { purpose: FinancialAccountPurpose.BUDGET } } } }
    );
  }

  return {
    AND: filters
  };
}
