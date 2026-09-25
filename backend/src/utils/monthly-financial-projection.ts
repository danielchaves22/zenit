import { Prisma } from '@prisma/client';
import type { MonthlyProjectionCompetence } from './monthly-projection-competence';

export type MonthlyProjectionSource =
  | 'AD_HOC_MATERIALIZED'
  | 'FIXED_MATERIALIZED'
  | 'FIXED_PROJECTED'
  | 'CREDIT_CARD';

export type MonthlyProjectionTransactionType = 'INCOME' | 'EXPENSE';
export type MonthlyProjectionAggregationState = 'REALIZED' | 'PENDING' | 'PROJECTED';

export type MonthlyProjectionKnownRow = {
  transactionId?: number;
  recurringTransactionId?: number | null;
  description?: string;
  accountId?: number | null;
  variableEligible?: boolean;
  type: MonthlyProjectionTransactionType;
  source: MonthlyProjectionSource;
  competence: MonthlyProjectionCompetence;
  amount: Prisma.Decimal;
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  isSettled: boolean;
  categoryAggregationState: MonthlyProjectionAggregationState;
};

/** The historical variable population and its monthly offset must match. */
export function isVariableProjectionRow(row: MonthlyProjectionKnownRow): boolean {
  return row.type === 'EXPENSE' &&
    row.variableEligible !== false &&
    row.source !== 'FIXED_MATERIALIZED' && row.source !== 'FIXED_PROJECTED' &&
    row.categoryAggregationState !== 'PROJECTED' && !row.competence.installment;
}

export type MonthlyProjectionTrackedCategory = {
  id: number;
  name: string;
  color: string;
};

export type MonthlyVariableProjectionItem = {
  categoryId: number;
  categoryName: string;
  color: string;
  month: string;
  historicalAverage: Prisma.Decimal;
  committedInMonth: Prisma.Decimal;
  remainingProjected: Prisma.Decimal;
};

export type MonthlyProvisionContributionItem = {
  provisionId: number;
  provisionName: string;
  categoryId: number;
  categoryName: string;
  color: string;
  month: string;
  targetMonth: string;
  amount: Prisma.Decimal;
};

export type MonthlyProjectionCategoryTotal = {
  categoryId: number | null;
  name: string;
  color: string;
  type: MonthlyProjectionTransactionType;
  amount: Prisma.Decimal;
  realizedAmount: Prisma.Decimal;
  pendingAmount: Prisma.Decimal;
  projectedAmount: Prisma.Decimal;
  fixedProjectedAmount: Prisma.Decimal;
  variableProjectedAmount: Prisma.Decimal;
};

export type MonthlyFinancialProjection = {
  month: string;
  isCurrentMonth: boolean;
  carryOverAmount: Prisma.Decimal;
  projectedEndingBalance: Prisma.Decimal;
  knownRows: MonthlyProjectionKnownRow[];
  variableProjectionItems: MonthlyVariableProjectionItem[];
  provisionContributionItems: MonthlyProvisionContributionItem[];
  categoryTotals: MonthlyProjectionCategoryTotal[];
  totals: {
    incomeTotal: Prisma.Decimal;
    expenseTotal: Prisma.Decimal;
    committedExpenseTotal: Prisma.Decimal;
    variableProjectedExpenseTotal: Prisma.Decimal;
    realizedIncomeTotal: Prisma.Decimal;
    remainingIncomeTotal: Prisma.Decimal;
    realizedCommittedExpenseTotal: Prisma.Decimal;
    remainingCommittedExpenseTotal: Prisma.Decimal;
    provisionContributionTotal: Prisma.Decimal;
  };
};

type ProjectionKind = 'FIXED' | 'VARIABLE';

function createCategoryTotal(params: {
  categoryId: number | null;
  name: string;
  color: string;
  type: MonthlyProjectionTransactionType;
}): MonthlyProjectionCategoryTotal {
  return {
    categoryId: params.categoryId,
    name: params.name,
    color: params.color,
    type: params.type,
    amount: new Prisma.Decimal(0),
    realizedAmount: new Prisma.Decimal(0),
    pendingAmount: new Prisma.Decimal(0),
    projectedAmount: new Prisma.Decimal(0),
    fixedProjectedAmount: new Prisma.Decimal(0),
    variableProjectedAmount: new Prisma.Decimal(0)
  };
}

function addCategoryAmount(params: {
  total: MonthlyProjectionCategoryTotal;
  amount: Prisma.Decimal;
  aggregationState: MonthlyProjectionAggregationState;
  projectionKind?: ProjectionKind;
}) {
  params.total.amount = params.total.amount.plus(params.amount);

  if (params.aggregationState === 'REALIZED') {
    params.total.realizedAmount = params.total.realizedAmount.plus(params.amount);
    return;
  }

  if (params.aggregationState === 'PENDING') {
    params.total.pendingAmount = params.total.pendingAmount.plus(params.amount);
    return;
  }

  params.total.projectedAmount = params.total.projectedAmount.plus(params.amount);
  if (params.projectionKind === 'FIXED') {
    params.total.fixedProjectedAmount = params.total.fixedProjectedAmount.plus(params.amount);
  } else if (params.projectionKind === 'VARIABLE') {
    params.total.variableProjectedAmount = params.total.variableProjectedAmount.plus(params.amount);
  }
}

function buildVariableProjectionItems(params: {
  month: string;
  trackedCategories: MonthlyProjectionTrackedCategory[];
  historicalAverageByCategoryId: Map<number, Prisma.Decimal>;
  knownRows: MonthlyProjectionKnownRow[];
}): MonthlyVariableProjectionItem[] {
  const committedByCategoryId = new Map<number, Prisma.Decimal>();

  for (const row of params.knownRows) {
    if (!isVariableProjectionRow(row) || row.categoryId === null) continue;

    const currentValue = committedByCategoryId.get(row.categoryId) ?? new Prisma.Decimal(0);
    committedByCategoryId.set(row.categoryId, currentValue.plus(row.amount));
  }

  return params.trackedCategories.map((category) => {
    const historicalAverage =
      params.historicalAverageByCategoryId.get(category.id) ?? new Prisma.Decimal(0);
    const committedInMonth =
      committedByCategoryId.get(category.id) ?? new Prisma.Decimal(0);
    const projectedDifference = historicalAverage.minus(committedInMonth);

    return {
      categoryId: category.id,
      categoryName: category.name,
      color: category.color,
      month: params.month,
      historicalAverage,
      committedInMonth,
      remainingProjected: projectedDifference.gt(0)
        ? projectedDifference
        : new Prisma.Decimal(0)
    };
  });
}

export function calculateMonthlyFinancialProjection(params: {
  month: string;
  isCurrentMonth: boolean;
  carryOverAmount: Prisma.Decimal;
  knownRows: MonthlyProjectionKnownRow[];
  trackedCategories: MonthlyProjectionTrackedCategory[];
  historicalAverageByCategoryId: Map<number, Prisma.Decimal>;
  provisionContributionItems?: MonthlyProvisionContributionItem[];
  // Scenario estimates are computed against all known facts before source filtering.
  variableProjectionItems?: MonthlyVariableProjectionItem[];
}): MonthlyFinancialProjection {
  const mismatchedRow = params.knownRows.find((row) => row.competence.month !== params.month);
  if (mismatchedRow) {
    throw new Error(
      `Fato financeiro da competência ${mismatchedRow.competence.month} não pode compor a projeção ${params.month}`
    );
  }
  const provisionContributionItems = params.provisionContributionItems ?? [];
  const mismatchedProvision = provisionContributionItems.find(
    (item) => item.month !== params.month
  );
  if (mismatchedProvision) {
    throw new Error(
      `Contribuição de provisão do mês ${mismatchedProvision.month} não pode compor a projeção ${params.month}`
    );
  }

  const variableProjectionItems = params.variableProjectionItems ?? buildVariableProjectionItems({
    month: params.month,
    trackedCategories: params.trackedCategories,
    historicalAverageByCategoryId: params.historicalAverageByCategoryId,
    knownRows: params.knownRows
  });
  if (variableProjectionItems.some((item) => item.month !== params.month || item.remainingProjected.lt(0))) {
    throw new Error('Estimativa variável incompatível com o mês da projeção');
  }
  const categoryTotalsMap = new Map<string, MonthlyProjectionCategoryTotal>();
  let incomeTotal = new Prisma.Decimal(0);
  let realizedIncomeTotal = new Prisma.Decimal(0);
  let remainingIncomeTotal = new Prisma.Decimal(0);
  let realizedCommittedExpenseTotal = new Prisma.Decimal(0);
  let remainingCommittedExpenseTotal = new Prisma.Decimal(0);

  for (const row of params.knownRows) {
    const categoryKey = `${row.type}:${row.categoryId ?? 'uncategorized'}`;
    const categoryTotal =
      categoryTotalsMap.get(categoryKey) ??
      createCategoryTotal({
        categoryId: row.categoryId,
        name: row.categoryName,
        color: row.categoryColor,
        type: row.type
      });
    addCategoryAmount({
      total: categoryTotal,
      amount: row.amount,
      aggregationState: row.categoryAggregationState,
      projectionKind: row.categoryAggregationState === 'PROJECTED' ? 'FIXED' : undefined
    });
    categoryTotalsMap.set(categoryKey, categoryTotal);

    if (row.type === 'INCOME') {
      incomeTotal = incomeTotal.plus(row.amount);
      if (row.isSettled) {
        realizedIncomeTotal = realizedIncomeTotal.plus(row.amount);
      } else {
        remainingIncomeTotal = remainingIncomeTotal.plus(row.amount);
      }
      continue;
    }

    if (row.isSettled) {
      realizedCommittedExpenseTotal = realizedCommittedExpenseTotal.plus(row.amount);
    } else {
      remainingCommittedExpenseTotal = remainingCommittedExpenseTotal.plus(row.amount);
    }
  }

  for (const item of variableProjectionItems) {
    if (item.remainingProjected.lte(0)) continue;

    const categoryKey = `EXPENSE:${item.categoryId}`;
    const categoryTotal =
      categoryTotalsMap.get(categoryKey) ??
      createCategoryTotal({
        categoryId: item.categoryId,
        name: item.categoryName,
        color: item.color,
        type: 'EXPENSE'
      });
    addCategoryAmount({
      total: categoryTotal,
      amount: item.remainingProjected,
      aggregationState: 'PROJECTED',
      projectionKind: 'VARIABLE'
    });
    categoryTotalsMap.set(categoryKey, categoryTotal);
  }

  const variableProjectedExpenseTotal = variableProjectionItems.reduce(
    (sum, item) => sum.plus(item.remainingProjected),
    new Prisma.Decimal(0)
  );
  const committedExpenseTotal = realizedCommittedExpenseTotal.plus(
    remainingCommittedExpenseTotal
  );
  const expenseTotal = committedExpenseTotal.plus(variableProjectedExpenseTotal);
  const provisionContributionTotal = provisionContributionItems.reduce(
    (sum, item) => sum.plus(item.amount),
    new Prisma.Decimal(0)
  );
  // The starting cash balance already includes settled movements, even when
  // their due date is in a future month (advance payments/receipts).
  const projectedEndingBalance = params.carryOverAmount
    .plus(remainingIncomeTotal)
    .minus(remainingCommittedExpenseTotal)
    .minus(variableProjectedExpenseTotal);

  return {
    month: params.month,
    isCurrentMonth: params.isCurrentMonth,
    carryOverAmount: params.carryOverAmount,
    projectedEndingBalance,
    knownRows: params.knownRows,
    variableProjectionItems,
    provisionContributionItems,
    categoryTotals: [...categoryTotalsMap.values()],
    totals: {
      incomeTotal,
      expenseTotal,
      committedExpenseTotal,
      variableProjectedExpenseTotal,
      realizedIncomeTotal,
      remainingIncomeTotal,
      realizedCommittedExpenseTotal,
      remainingCommittedExpenseTotal,
      provisionContributionTotal
    }
  };
}
