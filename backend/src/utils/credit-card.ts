import { CreditCardInvoiceStatus } from '@prisma/client';

export interface CreditCardInvoiceReference {
  referenceYear: number;
  referenceMonth: number;
  closingDate: Date;
  dueDate: Date;
}

function buildDateWithClampedDay(year: number, monthIndex: number, day: number): Date {
  const safeDay = Math.max(1, Math.min(day, 31));
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(safeDay, lastDay), 12, 0, 0, 0);
}

export function addMonthsClamped(date: Date, months: number): Date {
  const nextMonthDate = new Date(date);
  const originalDay = nextMonthDate.getDate();

  nextMonthDate.setDate(1);
  nextMonthDate.setMonth(nextMonthDate.getMonth() + months);

  const lastDay = new Date(
    nextMonthDate.getFullYear(),
    nextMonthDate.getMonth() + 1,
    0
  ).getDate();

  nextMonthDate.setDate(Math.min(originalDay, lastDay));
  return nextMonthDate;
}

export function resolveCreditCardInvoiceReference(
  occurrenceDate: Date,
  closingDay: number,
  dueDay: number
): CreditCardInvoiceReference {
  const isCurrentReferenceMonth = occurrenceDate.getDate() <= closingDay;
  const referenceBase = new Date(
    occurrenceDate.getFullYear(),
    occurrenceDate.getMonth() + (isCurrentReferenceMonth ? 0 : 1),
    1,
    12,
    0,
    0,
    0
  );

  const referenceYear = referenceBase.getFullYear();
  const referenceMonth = referenceBase.getMonth() + 1;
  const closingDate = buildDateWithClampedDay(referenceYear, referenceBase.getMonth(), closingDay);

  const dueMonthOffset = dueDay > closingDay ? 0 : 1;
  const dueBase = new Date(referenceYear, referenceBase.getMonth() + dueMonthOffset, 1, 12, 0, 0, 0);
  const dueDate = buildDateWithClampedDay(dueBase.getFullYear(), dueBase.getMonth(), dueDay);

  return {
    referenceYear,
    referenceMonth,
    closingDate,
    dueDate
  };
}

export function buildCreditCardInvoiceReferenceForMonth(
  referenceYear: number,
  referenceMonth: number,
  closingDay: number,
  dueDay: number
): CreditCardInvoiceReference {
  const occurrenceDate = buildDateWithClampedDay(referenceYear, referenceMonth - 1, closingDay);
  return resolveCreditCardInvoiceReference(occurrenceDate, closingDay, dueDay);
}

export function shiftCreditCardInvoiceReference(
  reference: CreditCardInvoiceReference,
  monthOffset: number
): CreditCardInvoiceReference {
  const referenceBase = new Date(
    reference.referenceYear,
    reference.referenceMonth - 1 + monthOffset,
    1,
    12,
    0,
    0,
    0
  );

  return {
    referenceYear: referenceBase.getFullYear(),
    referenceMonth: referenceBase.getMonth() + 1,
    closingDate: addMonthsClamped(reference.closingDate, monthOffset),
    dueDate: addMonthsClamped(reference.dueDate, monthOffset)
  };
}

export function resolveCreditCardInvoiceStatus(
  closingDate: Date,
  paymentCompleted: boolean,
  now: Date = new Date()
): CreditCardInvoiceStatus {
  if (paymentCompleted) {
    return CreditCardInvoiceStatus.PAID;
  }

  return now >= closingDate
    ? CreditCardInvoiceStatus.CLOSED
    : CreditCardInvoiceStatus.OPEN;
}

export function getDerivedInvoiceStatus(
  status: CreditCardInvoiceStatus,
  dueDate: Date,
  now: Date = new Date()
): CreditCardInvoiceStatus | 'OVERDUE' {
  if (status !== CreditCardInvoiceStatus.PAID && now > dueDate) {
    return 'OVERDUE';
  }

  return status;
}
