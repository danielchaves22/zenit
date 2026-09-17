import { buildFinancialBudgetScenarios } from '../../src/utils/financial-budget-scenario';
import { buildFinancialGuidanceEvidence } from '../../src/utils/financial-guidance-evidence';

const sources = [
  {
    key: 'INCOME:1',
    kind: 'FIXED_INCOME',
    label: 'Salário',
    monthlyAmount: '10000.00',
    selected: true,
    metadata: {}
  },
  {
    key: 'VARIABLE:10',
    kind: 'VARIABLE_EXPENSE',
    label: 'Lazer',
    monthlyAmount: '1200.00',
    selected: true,
    metadata: {
      categoryId: 10,
      categoryName: 'Lazer',
      flexibility: 'FLEXIBLE',
      minimumMonthlyAmount: '800.00'
    }
  },
  {
    key: 'VARIABLE:11',
    kind: 'VARIABLE_EXPENSE',
    label: 'Combustível',
    monthlyAmount: '800.00',
    selected: true,
    metadata: {
      categoryId: 11,
      categoryName: 'Combustível',
      flexibility: 'MODERATE',
      minimumMonthlyAmount: '700.00'
    }
  }
];

describe('financial guidance evidence', () => {
  it('turns confirmed facts and scenario capacity into traceable findings', () => {
    const scenarios = buildFinancialBudgetScenarios({
      targetMonthlySavings: '3200.00',
      monthlyAvailableBeforeGoal: '2500.00',
      monthlyBalanceAfterGoal: '-700.00',
      sources
    });

    const result = buildFinancialGuidanceEvidence({
      targetMonthlySavings: '3200.00',
      totals: {
        monthlyIncome: '10000.00',
        monthlyCommittedExpenses: '5000.00',
        monthlyVariableExpenses: '2000.00',
        monthlyProvisionContribution: '500.00',
        monthlyAvailableBeforeGoal: '2500.00',
        monthlyBalanceAfterGoal: '-700.00'
      },
      dataQuality: { score: 72, rating: 'MEDIUM' },
      sources,
      scenarios
    });

    expect(result.methodologyVersion).toBe(1);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'GOAL_FIT', severity: 'ATTENTION' }),
        expect.objectContaining({
          id: 'COMMITTED_INCOME_SHARE',
          summary: expect.stringContaining('55.0%')
        }),
        expect.objectContaining({
          id: 'VARIABLE_EXPENSE_CONCENTRATION',
          summary: expect.stringContaining('60.0%')
        }),
        expect.objectContaining({ id: 'ADJUSTMENT_CAPACITY', severity: 'ATTENTION' }),
        expect.objectContaining({ id: 'DATA_QUALITY', severity: 'ATTENTION' })
      ])
    );
    expect(result.references.map((reference) => reference.id)).toEqual([
      'BCB_CIDADANIA_FINANCEIRA',
      'CAIXA_ORCAMENTO_PRATICO',
      'CFPB_FINANCIAL_WELL_BEING',
      'OECD_INFE_2023'
    ]);
    expect(result.limitations).toContain(
      'Os percentuais exibidos descrevem a base confirmada; não são limites universais de gasto.'
    );
  });

  it('reports a positive fit without inventing an adjustment finding', () => {
    const scenarios = buildFinancialBudgetScenarios({
      targetMonthlySavings: '2000.00',
      monthlyAvailableBeforeGoal: '3000.00',
      monthlyBalanceAfterGoal: '1000.00',
      sources
    });

    const result = buildFinancialGuidanceEvidence({
      targetMonthlySavings: '2000.00',
      totals: {
        monthlyIncome: '10000.00',
        monthlyCommittedExpenses: '4500.00',
        monthlyVariableExpenses: '2000.00',
        monthlyProvisionContribution: '500.00',
        monthlyAvailableBeforeGoal: '3000.00',
        monthlyBalanceAfterGoal: '1000.00'
      },
      dataQuality: { score: 92, rating: 'HIGH' },
      sources,
      scenarios
    });

    expect(result.findings[0]).toMatchObject({ id: 'GOAL_FIT', severity: 'POSITIVE' });
    expect(result.findings.some((finding) => finding.id === 'ADJUSTMENT_CAPACITY')).toBe(false);
    expect(result.findings.at(-1)).toMatchObject({ id: 'DATA_QUALITY', severity: 'POSITIVE' });
  });
});
