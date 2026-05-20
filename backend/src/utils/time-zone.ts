type CalendarDateParts = {
  year: number;
  month: number;
  day: number;
};

const DEFAULT_TIME_ZONE = 'UTC';

function formatterForTimeZone(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone?.trim()) {
    return false;
  }

  try {
    formatterForTimeZone(timeZone.trim()).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

export function normalizeTimeZone(timeZone: string | null | undefined): string | null {
  if (!isValidTimeZone(timeZone)) {
    return null;
  }

  return timeZone!.trim();
}

export function resolveTimeZone(timeZone: string | null | undefined): string {
  return normalizeTimeZone(timeZone) ?? DEFAULT_TIME_ZONE;
}

export function extractCalendarDateInTimeZone(date: Date, timeZone: string): CalendarDateParts {
  const parts = formatterForTimeZone(resolveTimeZone(timeZone)).formatToParts(date);

  const year = Number(parts.find((part) => part.type == 'year')?.value);
  const month = Number(parts.find((part) => part.type == 'month')?.value);
  const day = Number(parts.find((part) => part.type == 'day')?.value);

  if (!year || !month || !day) {
    throw new Error('Nao foi possivel extrair a data de calendario para o timezone informado');
  }

  return { year, month, day };
}

export function buildCanonicalBusinessDate(parts: CalendarDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
}

export function getBusinessDateInTimeZone(timeZone: string, at: Date = new Date()): Date {
  return buildCanonicalBusinessDate(extractCalendarDateInTimeZone(at, timeZone));
}

export function sameCalendarDayInTimeZone(left: Date, right: Date, timeZone: string): boolean {
  const leftParts = extractCalendarDateInTimeZone(left, timeZone);
  const rightParts = extractCalendarDateInTimeZone(right, timeZone);

  return (
    leftParts.year === rightParts.year &&
    leftParts.month === rightParts.month &&
    leftParts.day === rightParts.day
  );
}

export function diffBusinessDays(left: Date, right: Date): number {
  const leftNoonUtc = Date.UTC(left.getUTCFullYear(), left.getUTCMonth(), left.getUTCDate(), 12, 0, 0, 0);
  const rightNoonUtc = Date.UTC(right.getUTCFullYear(), right.getUTCMonth(), right.getUTCDate(), 12, 0, 0, 0);

  return Math.round((leftNoonUtc - rightNoonUtc) / 86400000);
}
