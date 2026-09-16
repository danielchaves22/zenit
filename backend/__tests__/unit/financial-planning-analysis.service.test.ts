import { Prisma, RecurringFrequency } from '@prisma/client';
import {
  FinancialPlanningSource,
  __private__
} from '../../src/services/financial-planning-analysis.service';

function source(
  key: string,
  kind: FinancialPlanningSource['kind'],
  monthlyAmount: string
): FinancialPlanningSource {
  return {
    key,
    kind,
    origin: kind === 'PROVISION' ? 'PROVISION' : 'RECURRING_TRANSACTION',
    label: key,
    detail: key,
    monthlyAmount,
    selectedByDefault: true,
    metadata: {}
  };
}

describe('FinancialPlanningAnalysisService current calculation contract', () => {
  it('sums only selected sources and keeps committed, variable and provision values separate', () => {
    const sources: FinancialPlanningSource[] = [
      source('income', 'FIXED_INCOME', '5000.00'),
      source('fixed', 'FIXED_EXPENSE', '1250.10'),
      source('installment', 'INSTALLMENT', '250.20'),
      source('variable', 'VARIABLE_EXPENSE', '900.30'),
      source('provision', 'PROVISION', '100.40'),
      source('ignored', 'FIXED_EXPENSE', '999.99')
    ];

    expect(
      __private__.calculateTotals(
        sources,
        ['income', 'fixed', 'installment', 'variable', 'provision'],
        '1000.00'
      )
    ).toEqual({
      monthlyIncome: '5000.00',
      monthlyCommittedExpenses: '1500.30',
      monthlyVariableExpenses: '900.30',
      monthlyProvisionContribution: '100.40',
      monthlyAvailableBeforeGoal: '2499.00',
      monthlyBalanceAfterGoal: '1499.00'
    });
  });

  it.each([
    [RecurringFrequency.DAILY, '1.00', '30.42'],
    [RecurringFrequency.WEEKLY, '1.00', '4.33'],
    [RecurringFrequency.MONTHLY, '100.00', '100.00'],
    [RecurringFrequency.QUARTERLY, '300.00', '100.00'],
    [RecurringFrequency.YEARLY, '1200.00', '100.00']
  ])(
    'preserves the current annualized monthly equivalent for %s recurrence',
    (frequency, amount, expected) => {
      expect(
        __private__.monthlyRecurringAmount(new Prisma.Decimal(amount), frequency).toFixed(2)
      ).toBe(expected);
    }
  );

  it('hashes equivalent objects deterministically regardless of key order', () => {
    expect(__private__.hashCanonicalPayload({ b: 2, a: { d: 4, c: 3 } })).toBe(
      __private__.hashCanonicalPayload({ a: { c: 3, d: 4 }, b: 2 })
    );
  });

  it('treats source selection order as irrelevant for confirmation idempotency', () => {
    const base = {
      ownerUserId: 1,
      personalWorkspaceId: 2,
      basisHash: 'a'.repeat(64),
      objectiveKind: 'MONTHLY_SAVINGS' as const,
      targetMonthlySavings: '1000.00'
    };

    expect(
      __private__.buildConfirmationHash({
        ...base,
        selectedSourceKeys: ['source-b', 'source-a']
      })
    ).toBe(
      __private__.buildConfirmationHash({
        ...base,
        selectedSourceKeys: ['source-a', 'source-b']
      })
    );
  });
});
