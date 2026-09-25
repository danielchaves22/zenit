import { Prisma } from '@prisma/client';
import {
  calculateForecastMonth,
  defaultForecastOptions,
  ForecastOptions,
  ForecastVariableBasis
} from '../../src/utils/financial-forecast';
import { MonthlyProjectionKnownRow } from '../../src/utils/monthly-financial-projection';

const decimal = (amount: number) => new Prisma.Decimal(amount);
const basis = (
  channel: 'ACCOUNT' | 'CARD',
  average: number,
  accountId: number | null = null
): ForecastVariableBasis => ({
  key: channel === 'CARD' ? `CARD:${accountId}:1` : 'ACCOUNT:1',
  categoryId: 1,
  categoryName: 'Alimentação',
  color: '#fff',
  channel,
  accountId,
  accountName: accountId ? 'Cartão' : null,
  historicalAverage: decimal(average),
  history: []
});
const fact = (
  source: MonthlyProjectionKnownRow['source'],
  amount: number,
  extra: Partial<MonthlyProjectionKnownRow> = {}
): MonthlyProjectionKnownRow => ({
  source,
  amount: decimal(amount),
  type: 'EXPENSE',
  categoryId: 1,
  categoryName: 'Alimentação',
  categoryColor: '#fff',
  competence: { month: '2026-09', basis: 'TRANSACTION_DUE_DATE', installment: null },
  isSettled: false,
  categoryAggregationState: 'PENDING',
  ...extra
});
const knownRows = [
  fact('FIXED_PROJECTED', 200, {
    type: 'INCOME',
    recurringTransactionId: 10,
    categoryAggregationState: 'PROJECTED'
  }),
  fact('FIXED_MATERIALIZED', 50),
  fact('AD_HOC_MATERIALIZED', 20, { isSettled: true, categoryAggregationState: 'REALIZED' }),
  fact('AD_HOC_MATERIALIZED', 30, {
    competence: {
      month: '2026-09',
      basis: 'TRANSACTION_DUE_DATE',
      installment: { kind: 'NON_CARD_INSTALLMENT', number: 1, total: 3, seriesId: 'plan' }
    }
  }),
  fact('CREDIT_CARD', 40, { accountId: 2 }),
  fact('CREDIT_CARD', 10, { accountId: 2, variableEligible: false }),
  fact('CREDIT_CARD', -5, { accountId: 2 })
];
function calculate(
  options: ForecastOptions = defaultForecastOptions,
  unavailableCardIds = new Set<number>()
) {
  return calculateForecastMonth({
    month: '2026-09',
    isCurrentMonth: true,
    carryOverAmount: decimal(1000),
    knownRows,
    bases: [basis('ACCOUNT', 100), basis('CARD', 100, 2)],
    options,
    unavailableCardIds
  });
}

describe('Monthly forecast scenarios', () => {
  it('offsets only matching variables, keeping fixed and installment commitments additive', () => {
    const result = calculate();
    expect(result.variables.map((item) => item.committedInMonth.toNumber())).toEqual([20, 35]);
    expect(result.variables.map((item) => item.remainingProjected.toNumber())).toEqual([80, 65]);
    expect(result.projection.totals.expenseTotal.toNumber()).toBe(290);
    expect(result.projection.projectedEndingBalance.toNumber()).toBe(930);
  });

  it.each(Array.from({ length: 32 }, (_, i) => i))(
    'respects source combination %s without resurrecting excluded facts through averages',
    (mask) => {
      const sources = {
        fixed: !!(mask & 1),
        other: !!(mask & 2),
        cards: !!(mask & 4),
        variable: !!(mask & 8),
        income: !!(mask & 16)
      };
      const result = calculate({ ...defaultForecastOptions, sources });
      const estimates = sources.variable ? 80 + (sources.cards ? 65 : 0) : 0;
      expect(result.projection.totals.incomeTotal.toNumber()).toBe(sources.income ? 200 : 0);
      expect(result.projection.totals.expenseTotal.toNumber()).toBe(
        (sources.fixed ? 50 : 0) + (sources.other ? 50 : 0) + (sources.cards ? 45 : 0) + estimates
      );
      expect(result.projection.projectedEndingBalance.toNumber()).toBe(
        1000 +
          (sources.income ? 200 : 0) -
          (sources.fixed ? 50 : 0) -
          (sources.other ? 30 : 0) -
          (sources.cards ? 45 : 0) -
          estimates
      );
      expect(result.variables[0].remainingProjected.toNumber()).toBe(80);
    }
  );

  it('known invoice mode and unavailable cycles keep the invoice but suppress new purchases', () => {
    for (const result of [
      calculate({ ...defaultForecastOptions, cardMode: 'KNOWN_ONLY' }),
      calculate(defaultForecastOptions, new Set([2]))
    ]) {
      expect(result.projection.totals.expenseTotal.toNumber()).toBe(225);
      expect(result.variables[1].included).toBe(false);
      expect(result.sources.find((item) => item.key === 'cards')?.expense.toNumber()).toBe(45);
    }
  });

  it('selects recurring income without changing expenses or removing settled cash', () => {
    const result = calculateForecastMonth({
      month: '2026-09',
      isCurrentMonth: true,
      carryOverAmount: decimal(1000),
      knownRows: [
        ...knownRows,
        fact('FIXED_MATERIALIZED', 300, {
          type: 'INCOME',
          recurringTransactionId: 10,
          isSettled: true,
          categoryAggregationState: 'REALIZED'
        }),
        fact('FIXED_MATERIALIZED', 100, { type: 'INCOME', recurringTransactionId: 20 }),
        fact('AD_HOC_MATERIALIZED', 5000, { type: 'INCOME' }),
        fact('AD_HOC_MATERIALIZED', 7000, {
          type: 'INCOME',
          isSettled: true,
          categoryAggregationState: 'REALIZED'
        })
      ],
      bases: [],
      options: { ...defaultForecastOptions, excludedIncomeIds: [10] },
      unavailableCardIds: new Set()
    });
    expect(result.projection.totals.incomeTotal.toNumber()).toBe(100);
    expect(result.projection.totals.expenseTotal.toNumber()).toBe(145);
    expect(result.projection.projectedEndingBalance.toNumber()).toBe(975);
    expect(result.sources.find((source) => source.key === 'income')?.income.toNumber()).toBe(100);
    expect(result.sources.find((source) => source.key === 'other')?.income.toNumber()).toBe(0);
    const restored = calculate();
    expect(restored.projection.totals.incomeTotal.toNumber()).toBe(200);
  });

  it('manual estimates never erase known spending and category exclusions affect only estimates', () => {
    const result = calculate({
      ...defaultForecastOptions,
      overrides: { 'ACCOUNT:1': '10.00' },
      excludedVariableKeys: ['CARD:2:1']
    });
    expect(result.projection.totals.expenseTotal.toNumber()).toBe(145);
    expect(result.variables[0].remainingProjected.toNumber()).toBe(0);
    expect(result.variables[0].adjusted).toBe(true);
  });

  it('does not use purchases on another card as an offset', () => {
    const result = calculateForecastMonth({
      month: '2026-09',
      isCurrentMonth: true,
      carryOverAmount: decimal(0),
      knownRows,
      bases: [basis('CARD', 100, 3)],
      options: defaultForecastOptions,
      unavailableCardIds: new Set()
    });
    expect(result.variables[0].committedInMonth.toNumber()).toBe(0);
    expect(result.variables[0].remainingProjected.toNumber()).toBe(100);
  });
});
