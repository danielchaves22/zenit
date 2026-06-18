import {
  FinancialAccountPurpose,
  FinancialTransactionEntryKind,
  Prisma
} from '@prisma/client';

export type IgnoredTransactionState = 'ACTIVE' | 'IGNORED' | 'ALL';

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
}): Prisma.FinancialTransactionWhereInput {
  const filters: Prisma.FinancialTransactionWhereInput[] = [
    {
      entryKind: FinancialTransactionEntryKind.NORMAL
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
