import { extractCalendarDateInTimeZone } from './time-zone';

const FINANCIAL_MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function assertValidDate(date: Date): void {
  if (Number.isNaN(date.getTime())) {
    throw new Error('Data financeira inválida');
  }
}

/**
 * Converts a YYYY-MM domain key to the canonical database representation used
 * by month-only financial records: first day of the month at noon UTC.
 */
export function parseFinancialMonthKey(monthKey: string): Date {
  const match = FINANCIAL_MONTH_KEY_PATTERN.exec(monthKey);
  if (!match) {
    throw new Error('Mês inválido. Use o formato YYYY-MM');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  return new Date(Date.UTC(year, month - 1, 1, 12, 0, 0, 0));
}

/**
 * Formats a canonical month Date as its YYYY-MM domain key. Month-only Dates
 * are read in UTC so the host machine timezone cannot change their identity.
 */
export function formatFinancialMonthKey(date: Date): string {
  assertValidDate(date);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addFinancialMonths(date: Date, amount: number): Date {
  assertValidDate(date);
  if (!Number.isInteger(amount)) {
    throw new Error('O deslocamento de meses deve ser um número inteiro');
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12, 0, 0, 0)
  );
}

export function getFinancialMonthKeyInTimeZone(
  timeZone: string,
  at: Date = new Date()
): string {
  assertValidDate(at);
  const { year, month } = extractCalendarDateInTimeZone(at, timeZone);
  return `${year}-${String(month).padStart(2, '0')}`;
}
