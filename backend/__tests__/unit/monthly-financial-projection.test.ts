import { Prisma } from '@prisma/client';
import {
  calculateMonthlyFinancialProjection,
  type MonthlyProjectionKnownRow
} from '../../src/utils/monthly-financial-projection';

function row(
  input: Partial<MonthlyProjectionKnownRow> &
    Pick<MonthlyProjectionKnownRow, 'type' | 'source' | 'amount'>,
  month = '2026-09'
): MonthlyProjectionKnownRow {
  return {
    competence: {
      month,
      basis: 'TRANSACTION_DUE_DATE',
      installment: null
    },
    categoryId: 10,
    categoryName: 'Combustível',
    categoryColor: '#f97316',
    isSettled: false,
    categoryAggregationState: 'PENDING',
    ...input
  };
}

describe('Monthly financial projection', () => {
  it('produces one canonical category projection for dashboard and planning', () => {
    const projection = calculateMonthlyFinancialProjection({
      month: '2026-09',
      isCurrentMonth: true,
      carryOverAmount: new Prisma.Decimal(950),
      trackedCategories: [{ id: 10, name: 'Combustível', color: '#f97316' }],
      historicalAverageByCategoryId: new Map([[10, new Prisma.Decimal(120)]]),
      knownRows: [
        row({
          type: 'EXPENSE',
          source: 'AD_HOC_MATERIALIZED',
          amount: new Prisma.Decimal(50),
          isSettled: true,
          categoryAggregationState: 'REALIZED'
        }),
        row({
          type: 'EXPENSE',
          source: 'CREDIT_CARD',
          amount: new Prisma.Decimal(20)
        }),
        row({
          type: 'EXPENSE',
          source: 'FIXED_PROJECTED',
          amount: new Prisma.Decimal(30),
          categoryAggregationState: 'PROJECTED'
        }),
        row({
          type: 'INCOME',
          source: 'FIXED_PROJECTED',
          amount: new Prisma.Decimal(80),
          categoryId: 20,
          categoryName: 'Receita',
          categoryColor: '#22c55e',
          categoryAggregationState: 'PROJECTED'
        })
      ]
    });

    expect(projection.variableProjectionItems[0]).toMatchObject({
      committedInMonth: new Prisma.Decimal(70),
      remainingProjected: new Prisma.Decimal(50)
    });
    expect(projection.categoryTotals.find((item) => item.categoryId === 10)).toMatchObject({
      amount: new Prisma.Decimal(150),
      realizedAmount: new Prisma.Decimal(50),
      pendingAmount: new Prisma.Decimal(20),
      projectedAmount: new Prisma.Decimal(80),
      fixedProjectedAmount: new Prisma.Decimal(30),
      variableProjectedAmount: new Prisma.Decimal(50)
    });
    expect(projection.totals).toMatchObject({
      incomeTotal: new Prisma.Decimal(80),
      expenseTotal: new Prisma.Decimal(150),
      committedExpenseTotal: new Prisma.Decimal(100),
      variableProjectedExpenseTotal: new Prisma.Decimal(50)
    });
    expect(projection.projectedEndingBalance.toFixed(2)).toBe('930.00');
  });

  it('keeps provision contributions separate from expenses and account balance', () => {
    const projection = calculateMonthlyFinancialProjection({
      month: '2026-09',
      isCurrentMonth: true,
      carryOverAmount: new Prisma.Decimal(1000),
      trackedCategories: [],
      historicalAverageByCategoryId: new Map(),
      knownRows: [],
      provisionContributionItems: [
        {
          provisionId: 1,
          provisionName: 'IPVA',
          categoryId: 10,
          categoryName: 'Veiculo',
          color: '#8b5cf6',
          month: '2026-09',
          targetMonth: '2027-01',
          amount: new Prisma.Decimal(250)
        }
      ]
    });

    expect(projection.totals.provisionContributionTotal.toFixed(2)).toBe('250.00');
    expect(projection.totals.expenseTotal.toFixed(2)).toBe('0.00');
    expect(projection.categoryTotals).toEqual([]);
    expect(projection.projectedEndingBalance.toFixed(2)).toBe('1000.00');
  });

  it('keeps advance payments in future competence without subtracting cash twice', () => {
    const projection = calculateMonthlyFinancialProjection({
      month: '2026-10',
      isCurrentMonth: false,
      carryOverAmount: new Prisma.Decimal(1000),
      trackedCategories: [],
      historicalAverageByCategoryId: new Map(),
      knownRows: [
        row(
          {
            type: 'INCOME',
            source: 'FIXED_PROJECTED',
            amount: new Prisma.Decimal(500),
            categoryAggregationState: 'PROJECTED'
          },
          '2026-10'
        ),
        row(
          {
            type: 'EXPENSE',
            source: 'AD_HOC_MATERIALIZED',
            amount: new Prisma.Decimal(100),
            isSettled: true,
            categoryAggregationState: 'REALIZED'
          },
          '2026-10'
        ),
        row(
          {
            type: 'EXPENSE',
            source: 'FIXED_PROJECTED',
            amount: new Prisma.Decimal(200),
            categoryAggregationState: 'PROJECTED'
          },
          '2026-10'
        )
      ]
    });

    expect(projection.totals.expenseTotal.toFixed(2)).toBe('300.00');
    expect(projection.projectedEndingBalance.toFixed(2)).toBe('1300.00');
  });

  it('never creates a negative variable projection', () => {
    const projection = calculateMonthlyFinancialProjection({
      month: '2026-09',
      isCurrentMonth: true,
      carryOverAmount: new Prisma.Decimal(0),
      trackedCategories: [{ id: 10, name: 'Combustível', color: '#f97316' }],
      historicalAverageByCategoryId: new Map([[10, new Prisma.Decimal(100)]]),
      knownRows: [
        row({
          type: 'EXPENSE',
          source: 'AD_HOC_MATERIALIZED',
          amount: new Prisma.Decimal(150),
          isSettled: true,
          categoryAggregationState: 'REALIZED'
        })
      ]
    });

    expect(projection.variableProjectionItems[0].remainingProjected.toFixed(2)).toBe('0.00');
    expect(projection.categoryTotals[0].variableProjectedAmount.toFixed(2)).toBe('0.00');
  });

  it('rejects a known fact assigned to a different competence month', () => {
    expect(() =>
      calculateMonthlyFinancialProjection({
        month: '2026-09',
        isCurrentMonth: true,
        carryOverAmount: new Prisma.Decimal(0),
        trackedCategories: [],
        historicalAverageByCategoryId: new Map(),
        knownRows: [
          row(
            {
              type: 'EXPENSE',
              source: 'AD_HOC_MATERIALIZED',
              amount: new Prisma.Decimal(50)
            },
            '2026-10'
          )
        ]
      })
    ).toThrow('competência 2026-10 não pode compor a projeção 2026-09');
  });
});
