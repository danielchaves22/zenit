import { Prisma } from '@prisma/client';
import {
  FinancialCalendarContext,
  formatFinancialMonthKey,
  parseFinancialMonthKey
} from './financial-calendar';

export type FinancialProvisionCalculationInput = Readonly<{
  expectedAmount: Prisma.Decimal | string | number;
  reservedAmount: Prisma.Decimal | string | number;
  startMonth: Date;
  targetDate: Date;
}>;

export function calculateProvisionMonthsAvailable(
  input: Pick<FinancialProvisionCalculationInput, 'startMonth' | 'targetDate'>,
  calendar: FinancialCalendarContext
): number {
  const targetMonth = parseFinancialMonthKey(formatFinancialMonthKey(input.targetDate));
  const currentMonth = parseFinancialMonthKey(calendar.currentMonthKey);
  const effectiveStart = input.startMonth > currentMonth ? input.startMonth : currentMonth;
  const difference =
    (targetMonth.getUTCFullYear() - effectiveStart.getUTCFullYear()) * 12 +
    targetMonth.getUTCMonth() -
    effectiveStart.getUTCMonth();

  return Math.max(1, difference);
}

export function calculateProvisionMonthlyContribution(
  input: FinancialProvisionCalculationInput,
  calendar: FinancialCalendarContext
): Prisma.Decimal {
  const expectedAmount = new Prisma.Decimal(input.expectedAmount);
  const reservedAmount = new Prisma.Decimal(input.reservedAmount);
  const remaining = Prisma.Decimal.max(expectedAmount.minus(reservedAmount), 0);

  if (remaining.isZero()) return new Prisma.Decimal(0);

  return remaining
    .div(calculateProvisionMonthsAvailable(input, calendar))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_UP);
}

export function calculateProvisionContributionForMonth(
  input: FinancialProvisionCalculationInput,
  calendar: FinancialCalendarContext,
  monthKey: string
): Prisma.Decimal {
  parseFinancialMonthKey(monthKey);

  const startMonthKey = formatFinancialMonthKey(input.startMonth);
  const targetMonthKey = formatFinancialMonthKey(input.targetDate);
  const effectiveStartMonthKey =
    startMonthKey > calendar.currentMonthKey ? startMonthKey : calendar.currentMonthKey;
  const contribution = calculateProvisionMonthlyContribution(input, calendar);

  if (contribution.isZero()) return contribution;

  // An overdue provision, or one started in its target month, is funded once
  // in the effective start month. Otherwise, contributions stop before the
  // target month because that is when the reserved amount is expected to be used.
  if (targetMonthKey <= effectiveStartMonthKey) {
    return monthKey === effectiveStartMonthKey ? contribution : new Prisma.Decimal(0);
  }

  return monthKey >= effectiveStartMonthKey && monthKey < targetMonthKey
    ? contribution
    : new Prisma.Decimal(0);
}
