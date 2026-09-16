import { Prisma } from '@prisma/client';
import { buildFinancialCalendarContext } from '../../src/utils/financial-calendar';
import {
  calculateProvisionMonthlyContribution,
  calculateProvisionMonthsAvailable
} from '../../src/utils/financial-provision-calculator';

describe('Financial provision calculator', () => {
  const calendar = buildFinancialCalendarContext(
    'UTC',
    new Date('2026-01-15T12:00:00.000Z')
  );

  it('preserves the current contribution and rounds upward to cents', () => {
    const input = {
      expectedAmount: new Prisma.Decimal('1000.00'),
      reservedAmount: new Prisma.Decimal('0.00'),
      startMonth: new Date('2026-01-01T00:00:00.000Z'),
      targetDate: new Date('2026-04-20T00:00:00.000Z')
    };

    expect(calculateProvisionMonthsAvailable(input, calendar)).toBe(3);
    expect(calculateProvisionMonthlyContribution(input, calendar).toFixed(2)).toBe('333.34');
  });

  it('does not produce a negative contribution when the provision is already funded', () => {
    const contribution = calculateProvisionMonthlyContribution(
      {
        expectedAmount: new Prisma.Decimal('1000.00'),
        reservedAmount: new Prisma.Decimal('1200.00'),
        startMonth: new Date('2026-01-01T00:00:00.000Z'),
        targetDate: new Date('2026-04-20T00:00:00.000Z')
      },
      calendar
    );

    expect(contribution.toFixed(2)).toBe('0.00');
  });

  it('uses the explicit workspace month when calculating provision contributions', () => {
    const instant = new Date('2026-01-01T02:30:00.000Z');
    const saoPaulo = buildFinancialCalendarContext('America/Sao_Paulo', instant);
    const utc = buildFinancialCalendarContext('UTC', instant);
    const input = {
      expectedAmount: new Prisma.Decimal('1000.00'),
      reservedAmount: new Prisma.Decimal('0.00'),
      startMonth: new Date('2025-12-01T12:00:00.000Z'),
      targetDate: new Date('2026-03-20T12:00:00.000Z')
    };

    expect(calculateProvisionMonthlyContribution(input, saoPaulo).toFixed(2)).toBe('333.34');
    expect(calculateProvisionMonthlyContribution(input, utc).toFixed(2)).toBe('500.00');
  });

  it('uses a future start month without charging earlier months', () => {
    const input = {
      expectedAmount: '900.00',
      reservedAmount: '0.00',
      startMonth: new Date('2026-03-01T12:00:00.000Z'),
      targetDate: new Date('2026-06-30T12:00:00.000Z')
    };

    expect(calculateProvisionMonthsAvailable(input, calendar)).toBe(3);
    expect(calculateProvisionMonthlyContribution(input, calendar).toFixed(2)).toBe('300.00');
  });
});
