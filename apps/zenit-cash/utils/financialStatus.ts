export type TransactionDisplayStatus =
  | 'OPEN'
  | 'OVERDUE'
  | 'SETTLED'
  | 'PAID'
  | 'CANCELED'
  | 'ARCHIVED'
  | 'PROJECTED';

export type DisplayStatusSource = 'transaction' | 'invoice' | 'projection';

type InvoiceStatus = 'OPEN' | 'CLOSED' | 'PAID' | 'OVERDUE';

interface TransactionDisplayStatusInput {
  status?: string | null;
  dueDate?: string | null;
  effectiveDate?: string | null;
  archivedAt?: string | Date | null;
  isProjected?: boolean;
  isVirtual?: boolean;
  creditCardInvoice?: {
    status?: string | null;
    dueDate?: string | null;
  } | null;
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number): string {
  return `${value}`.padStart(2, '0');
}

function formatUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function formatLocalDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function getTodayDateValue(): string {
  return formatLocalDateInput(new Date());
}

export function getCalendarDateValue(value?: string | Date | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }

    return formatLocalDateInput(value);
  }

  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatUtcDate(parsed);
}

export function normalizeDateInputValue(value?: string | Date | null): string {
  return getCalendarDateValue(value) || '';
}

export function toIsoDateString(value?: string | Date | null): string | null {
  const calendarDate = getCalendarDateValue(value);
  if (!calendarDate) {
    return null;
  }

  const [year, month, day] = calendarDate.split('-').map(Number);
  return new Date(year, month - 1, day).toISOString();
}

export function compareCalendarDateValues(
  left?: string | Date | null,
  right?: string | Date | null
): number {
  const leftValue = getCalendarDateValue(left);
  const rightValue = getCalendarDateValue(right);

  if (!leftValue && !rightValue) {
    return 0;
  }

  if (!leftValue) {
    return -1;
  }

  if (!rightValue) {
    return 1;
  }

  return leftValue.localeCompare(rightValue);
}

export function isCalendarDateBefore(
  value?: string | Date | null,
  reference: string | Date = getTodayDateValue()
): boolean {
  return compareCalendarDateValues(value, reference) < 0;
}

export function isCalendarDateAfter(
  value?: string | Date | null,
  reference: string | Date = getTodayDateValue()
): boolean {
  return compareCalendarDateValues(value, reference) > 0;
}

export function formatCalendarDate(
  value?: string | Date | null,
  options?: Intl.DateTimeFormatOptions
): string {
  const calendarDate = getCalendarDateValue(value);
  if (!calendarDate) {
    return '-';
  }

  const [year, month, day] = calendarDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', options);
}

export function getInvoiceDisplayStatus(
  status?: string | null,
  dueDate?: string | null
): InvoiceStatus {
  if (status === 'PAID') {
    return 'PAID';
  }

  if (dueDate && isCalendarDateBefore(dueDate)) {
    return 'OVERDUE';
  }

  if (status === 'CLOSED') {
    return 'CLOSED';
  }

  return 'OPEN';
}

export function getTransactionDisplayStatus(
  input: TransactionDisplayStatusInput
): { status: TransactionDisplayStatus; source: DisplayStatusSource } {
  if (input.archivedAt) {
    return { status: 'ARCHIVED', source: 'transaction' };
  }

  if (input.isProjected || input.isVirtual) {
    return { status: 'PROJECTED', source: 'projection' };
  }

  if (input.status === 'CANCELED') {
    return { status: 'CANCELED', source: 'transaction' };
  }

  if (input.creditCardInvoice) {
    const invoiceStatus = getInvoiceDisplayStatus(
      input.creditCardInvoice.status,
      input.creditCardInvoice.dueDate
    );

    if (invoiceStatus === 'PAID') {
      return { status: 'PAID', source: 'invoice' };
    }

    if (invoiceStatus === 'OVERDUE') {
      return { status: 'OVERDUE', source: 'invoice' };
    }

    return { status: 'OPEN', source: 'invoice' };
  }

  if (input.effectiveDate) {
    return { status: 'SETTLED', source: 'transaction' };
  }

  if (input.status === 'COMPLETED') {
    return { status: 'SETTLED', source: 'transaction' };
  }

  if (input.dueDate && isCalendarDateBefore(input.dueDate)) {
    return { status: 'OVERDUE', source: 'transaction' };
  }

  return { status: 'OPEN', source: 'transaction' };
}

export function getTransactionDisplayStatusLabel(status: TransactionDisplayStatus): string {
  switch (status) {
    case 'OPEN':
      return 'Aberta';
    case 'OVERDUE':
      return 'Vencida';
    case 'SETTLED':
      return 'Liquidada';
    case 'PAID':
      return 'Paga';
    case 'CANCELED':
      return 'Cancelada';
    case 'ARCHIVED':
      return 'Ignorada';
    case 'PROJECTED':
      return 'Projetada';
    default:
      return status;
  }
}

export function getTransactionDisplayStatusClasses(status: TransactionDisplayStatus): string {
  switch (status) {
    case 'OPEN':
      return 'bg-blue-900 text-blue-300';
    case 'OVERDUE':
      return 'bg-red-900 text-red-300';
    case 'SETTLED':
      return 'bg-green-900 text-green-300';
    case 'PAID':
      return 'bg-emerald-900 text-emerald-300';
    case 'CANCELED':
      return 'bg-gray-700 text-gray-300';
    case 'ARCHIVED':
      return 'bg-amber-900 text-amber-200';
    case 'PROJECTED':
      return 'bg-sky-900 text-sky-200';
    default:
      return 'bg-gray-700 text-gray-300';
  }
}
