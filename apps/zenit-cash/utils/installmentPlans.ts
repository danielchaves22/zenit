import { addMonthsClamped } from '@/utils/creditCards';

export interface InstallmentPreviewItem {
  installmentNumber: number;
  totalInstallments: number;
  amount: number;
  dueDate: string;
}

function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildInstallmentPreview(
  totalAmount: number,
  installmentCount: number,
  firstDueDate: string
): InstallmentPreviewItem[] {
  const normalizedCount = Math.trunc(installmentCount);
  const dueDate = parseCalendarDate(firstDueDate);
  const totalCents = Math.round(totalAmount * 100);

  if (
    !Number.isFinite(totalAmount) ||
    totalCents <= 0 ||
    normalizedCount < 2 ||
    normalizedCount > 120 ||
    totalCents < normalizedCount ||
    !dueDate
  ) {
    return [];
  }

  const baseInstallmentCents = Math.floor(totalCents / normalizedCount);
  const lastInstallmentCents =
    totalCents - baseInstallmentCents * (normalizedCount - 1);

  return Array.from({ length: normalizedCount }, (_, index) => {
    const installmentDueDate = addMonthsClamped(dueDate, index);
    const installmentCents = index === normalizedCount - 1
      ? lastInstallmentCents
      : baseInstallmentCents;

    return {
      installmentNumber: index + 1,
      totalInstallments: normalizedCount,
      amount: installmentCents / 100,
      dueDate: [
        installmentDueDate.getFullYear(),
        String(installmentDueDate.getMonth() + 1).padStart(2, '0'),
        String(installmentDueDate.getDate()).padStart(2, '0')
      ].join('-')
    };
  });
}
