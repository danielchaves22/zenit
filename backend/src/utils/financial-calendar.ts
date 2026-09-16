import {
  extractCalendarDateInTimeZone,
  getBusinessDateInTimeZone,
  resolveTimeZone
} from './time-zone';

const FINANCIAL_MONTH_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FINANCIAL_DATE_KEY_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export type FinancialCalendarContext = Readonly<{
  timeZone: string;
  businessDate: Date;
  currentMonthKey: string;
  maximumPlanningMonthKey: string;
}>;

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
 * Converts a YYYY-MM-DD domain key to the canonical database representation
 * used by date-only financial records: the requested day at noon UTC.
 */
export function parseFinancialDateKey(dateKey: string): Date {
  const match = FINANCIAL_DATE_KEY_PATTERN.exec(dateKey);
  if (!match) {
    throw new Error('Data inválida. Use o formato YYYY-MM-DD');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error('Data financeira inválida');
  }

  return date;
}

/**
 * Formats a canonical month Date as its YYYY-MM domain key. Month-only Dates
 * are read in UTC so the host machine timezone cannot change their identity.
 */
export function formatFinancialMonthKey(date: Date): string {
  assertValidDate(date);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatFinancialDateKey(date: Date): string {
  assertValidDate(date);
  return `${formatFinancialMonthKey(date)}-${String(date.getUTCDate()).padStart(2, '0')}`;
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

export function buildFinancialCalendarContext(
  timeZone: string | null | undefined,
  at: Date = new Date()
): FinancialCalendarContext {
  assertValidDate(at);
  const resolvedTimeZone = resolveTimeZone(timeZone);
  const businessDate = getBusinessDateInTimeZone(resolvedTimeZone, at);
  const currentMonthKey = formatFinancialMonthKey(businessDate);

  return {
    timeZone: resolvedTimeZone,
    businessDate,
    currentMonthKey,
    maximumPlanningMonthKey: formatFinancialMonthKey(addFinancialMonths(businessDate, 24))
  };
}

export function assertFinancialPlanningMonth(
  monthKey: string,
  calendar: FinancialCalendarContext,
  options: { mutable: boolean }
): Date {
  const referenceMonth = parseFinancialMonthKey(monthKey);
  if (referenceMonth.getUTCFullYear() < 2000) {
    throw new Error('Mês inválido');
  }

  if (monthKey > calendar.maximumPlanningMonthKey) {
    throw new Error('O planejamento pode ser criado com até 24 meses de antecedência');
  }

  if (options.mutable && monthKey < calendar.currentMonthKey) {
    throw new Error('O planejamento não pode alterar meses anteriores');
  }

  return referenceMonth;
}
