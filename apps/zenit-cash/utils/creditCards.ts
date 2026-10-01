import {
  formatCalendarDate,
  getInvoiceDisplayStatus as getDerivedInvoiceDisplayStatus
} from '@/utils/financialStatus';

export interface CreditCardAccountLike {
  id: number;
  name: string;
  balance?: string | number | null;
  creditLimit?: string | number | null;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
}

export interface CreditCardInvoicePreview {
  installmentNumber: number;
  referenceYear: number;
  referenceMonth: number;
  closingDate: string;
  dueDate: string;
}

export type CreditCardInvoiceSettlementType = 'TRANSFER' | 'EXTERNAL';

function clampDay(year: number, monthIndex: number, day: number) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

function buildDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, clampDay(year, monthIndex, day));
}

export function addMonthsClamped(date: Date, months: number) {
  const nextDate = new Date(date);
  const originalDay = nextDate.getDate();

  nextDate.setDate(1);
  nextDate.setMonth(nextDate.getMonth() + months);

  const lastDay = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  nextDate.setDate(Math.min(originalDay, lastDay));

  return nextDate;
}

export function getInvoiceReferenceLabel(referenceYear: number, referenceMonth: number) {
  return `${String(referenceMonth).padStart(2, '0')}/${referenceYear}`;
}

export function formatInvoiceDate(date: Date) {
  return formatCalendarDate(date);
}

export function getUsedCreditLimit(account: CreditCardAccountLike) {
  const balance = Number(account.balance || 0);
  return Math.abs(Math.min(balance, 0));
}

export function getAvailableCreditLimit(account: CreditCardAccountLike) {
  if (account.creditLimit === null || account.creditLimit === undefined || account.creditLimit === '') {
    return null;
  }

  const creditLimit = Number(account.creditLimit);
  if (Number.isNaN(creditLimit)) {
    return null;
  }

  return creditLimit - getUsedCreditLimit(account);
}

export function buildCreditCardInvoicePreview(
  account: CreditCardAccountLike | null | undefined,
  purchaseDateValue: string,
  installmentCount: number
): CreditCardInvoicePreview[] {
  if (
    !account ||
    !account.statementClosingDay ||
    !account.statementDueDay ||
    !purchaseDateValue ||
    installmentCount < 1
  ) {
    return [];
  }

  const purchaseDate = new Date(`${purchaseDateValue}T12:00:00`);
  if (Number.isNaN(purchaseDate.getTime())) {
    return [];
  }

  const items: CreditCardInvoicePreview[] = [];

  for (let index = 0; index < installmentCount; index += 1) {
    const scheduledDate = addMonthsClamped(purchaseDate, index);
    const currentReferenceMonth = scheduledDate.getDate() <= account.statementClosingDay;
    const referenceBase = new Date(
      scheduledDate.getFullYear(),
      scheduledDate.getMonth() + (currentReferenceMonth ? 0 : 1),
      1
    );

    const dueMonthOffset = account.statementDueDay > account.statementClosingDay ? 0 : 1;
    const closingDate = buildDate(
      referenceBase.getFullYear(),
      referenceBase.getMonth(),
      account.statementClosingDay
    );
    const dueDateBase = new Date(referenceBase.getFullYear(), referenceBase.getMonth() + dueMonthOffset, 1);
    const dueDate = buildDate(
      dueDateBase.getFullYear(),
      dueDateBase.getMonth(),
      account.statementDueDay
    );

    items.push({
      installmentNumber: index + 1,
      referenceYear: referenceBase.getFullYear(),
      referenceMonth: referenceBase.getMonth() + 1,
      closingDate: closingDate.toISOString(),
      dueDate: dueDate.toISOString()
    });
  }

  return items;
}

export function getInvoiceDisplayStatus(status: string, dueDate?: string | null) {
  return getDerivedInvoiceDisplayStatus(status, dueDate);
}

export function getInvoiceDisplayStatusLabel(status: string) {
  switch (status) {
    case 'OPEN':
      return 'Aberta';
    case 'CLOSED':
      return 'Fechada';
    case 'PAID':
      return 'Paga';
    case 'OVERDUE':
      return 'Vencida';
    default:
      return status;
  }
}

export function getInvoiceDisplayStatusClasses(status: string) {
  switch (status) {
    case 'PAID':
      return 'bg-tone-green-soft text-tone-green border border-tone-green/25';
    case 'OVERDUE':
      return 'bg-tone-red-soft text-tone-red border border-tone-red/25';
    case 'CLOSED':
      return 'bg-tone-yellow-soft text-tone-yellow border border-tone-yellow/25';
    case 'OPEN':
    default:
      return 'bg-tone-blue-soft text-tone-blue border border-tone-blue/25';
  }
}

export function getInvoiceSettlementLabel(settlementType?: string | null) {
  switch (settlementType) {
    case 'TRANSFER':
      return 'Paga por transferencia';
    case 'EXTERNAL':
      return 'Liquidada fora do sistema';
    default:
      return null;
  }
}
