import { Prisma } from '@prisma/client';
import {
  calculateMonthlyFinancialProjection,
  isVariableProjectionRow,
  MonthlyProjectionKnownRow,
  MonthlyVariableProjectionItem
} from './monthly-financial-projection';

export type ForecastSource = 'income' | 'fixed' | 'other' | 'cards' | 'variable';
export type ForecastOptions = {
  sources: Record<ForecastSource, boolean>;
  cardMode: 'KNOWN_ONLY' | 'ESTIMATE';
  historyMonths: number;
  includeOverdue: boolean;
  excludedIncomeIds: number[];
  excludedVariableKeys: string[];
  overrides: Record<string, string>;
};
export const defaultForecastOptions: ForecastOptions = {
  sources: { income: true, fixed: true, other: true, cards: true, variable: true },
  cardMode: 'ESTIMATE',
  historyMonths: 6,
  includeOverdue: false,
  excludedIncomeIds: [],
  excludedVariableKeys: [],
  overrides: {}
};
export type ForecastVariableBasis = {
  key: string;
  categoryId: number;
  categoryName: string;
  color: string;
  channel: 'ACCOUNT' | 'CARD';
  accountId: number | null;
  accountName: string | null;
  historicalAverage: Prisma.Decimal;
  history: Array<{ month: string; amount: Prisma.Decimal }>;
};

export function forecastSource(
  row: MonthlyProjectionKnownRow
): Exclude<ForecastSource, 'variable'> {
  if (row.source === 'CREDIT_CARD') return 'cards';
  if (isFixedForecastIncome(row)) return 'income';
  return row.source === 'AD_HOC_MATERIALIZED' ? 'other' : 'fixed';
}

export function isFixedForecastIncome(row: MonthlyProjectionKnownRow): boolean {
  return (
    row.type === 'INCOME' &&
    (row.source === 'FIXED_MATERIALIZED' || row.source === 'FIXED_PROJECTED')
  );
}

/** Conservative income policy belongs to this scenario, not the shared ledger. */
export function isForecastRow(row: MonthlyProjectionKnownRow): boolean {
  return row.type !== 'INCOME' || isFixedForecastIncome(row);
}

export function isForecastRowIncluded(
  row: MonthlyProjectionKnownRow,
  options: ForecastOptions
): boolean {
  return (
    isForecastRow(row) &&
    options.sources[forecastSource(row)] &&
    !(
      isFixedForecastIncome(row) &&
      row.recurringTransactionId != null &&
      options.excludedIncomeIds.includes(row.recurringTransactionId)
    )
  );
}

export function cashEffect(rows: MonthlyProjectionKnownRow[]): Prisma.Decimal {
  return rows.reduce(
    (sum, row) => (row.type === 'INCOME' ? sum.plus(row.amount) : sum.minus(row.amount)),
    new Prisma.Decimal(0)
  );
}

export function calculateForecastMonth(params: {
  month: string;
  isCurrentMonth: boolean;
  carryOverAmount: Prisma.Decimal;
  knownRows: MonthlyProjectionKnownRow[];
  bases: ForecastVariableBasis[];
  options: ForecastOptions;
  unavailableCardIds: Set<number>;
}) {
  const { options } = params;
  const variables = params.bases.map((basis) => {
    const comparable = params.knownRows.filter(
      (row) =>
        isVariableProjectionRow(row) &&
        row.categoryId === basis.categoryId &&
        (basis.channel === 'CARD'
          ? row.source === 'CREDIT_CARD' && row.accountId === basis.accountId
          : row.source !== 'CREDIT_CARD')
    );
    const committedInMonth = comparable.reduce(
      (sum, row) => sum.plus(row.amount),
      new Prisma.Decimal(0)
    );
    const override = options.overrides[basis.key];
    const expectedAmount =
      override === undefined ? basis.historicalAverage : new Prisma.Decimal(override);
    const cycleUnavailable =
      basis.channel === 'CARD' && params.unavailableCardIds.has(basis.accountId!);
    const included =
      options.sources.variable &&
      !options.excludedVariableKeys.includes(basis.key) &&
      (basis.channel !== 'CARD' || (options.sources.cards && options.cardMode === 'ESTIMATE')) &&
      !cycleUnavailable;
    const remainingProjected = Prisma.Decimal.max(0, expectedAmount.minus(committedInMonth));
    return {
      ...basis,
      month: params.month,
      expectedAmount,
      committedInMonth,
      remainingProjected,
      included,
      cycleUnavailable,
      adjusted: override !== undefined
    };
  });
  const estimates: MonthlyVariableProjectionItem[] = variables
    .filter((item) => item.included)
    .map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      color: item.color,
      month: item.month,
      historicalAverage: item.historicalAverage,
      committedInMonth: item.committedInMonth,
      remainingProjected: item.remainingProjected
    }));
  const projection = calculateMonthlyFinancialProjection({
    ...params,
    knownRows: params.knownRows.filter((row) => isForecastRowIncluded(row, options)),
    trackedCategories: [],
    historicalAverageByCategoryId: new Map(),
    variableProjectionItems: estimates
  });
  const sources = (['income', 'fixed', 'other', 'cards', 'variable'] as const).map((key) => {
    const rows = params.knownRows.filter(
      (row) =>
        isForecastRow(row) &&
        forecastSource(row) === key &&
        !(
          key === 'income' &&
          row.recurringTransactionId != null &&
          options.excludedIncomeIds.includes(row.recurringTransactionId)
        )
    );
    const income = rows
      .filter((row) => row.type === 'INCOME')
      .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    const expense =
      key === 'variable'
        ? variables
            .filter(
              (item) =>
                !item.cycleUnavailable &&
                !options.excludedVariableKeys.includes(item.key) &&
                (item.channel !== 'CARD' ||
                  (options.sources.cards && options.cardMode === 'ESTIMATE'))
            )
            .reduce((sum, item) => sum.plus(item.remainingProjected), new Prisma.Decimal(0))
        : rows
            .filter((row) => row.type === 'EXPENSE')
            .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    return { key, included: options.sources[key], income, expense };
  });
  return { projection, variables, sources };
}
