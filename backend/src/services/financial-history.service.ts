import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import {
  buildHistoricalCardDateWhere,
  buildHistoricalNonCardDateWhere
} from '../utils/financial-history-query';
import {
  buildFinancialRecognitionWhere,
  buildOperationalTransactionWhere,
  FinancialRecognitionPerspective
} from '../utils/financial-transaction-query';
import {
  addFinancialMonths,
  FinancialCalendarContext,
  formatFinancialMonthKey
} from '../utils/financial-calendar';
import { getCreditCardInvoiceSignedAmount } from '../utils/financial-transaction-amount';
import type { ForecastVariableBasis } from '../utils/financial-forecast';

export type FinancialHistoryAccess = {
  companyId: number;
  accessFilter?: Prisma.FinancialTransactionWhereInput;
  accessibleAccountIds?: number[];
};
type Classification = {
  recurringTransactionId: number | null;
  installmentPlanId: string | null;
  totalInstallments: number | null;
};
const isRecurring = (row: Classification) => row.recurringTransactionId !== null;
const isInstallment = (row: Classification) =>
  !!row.installmentPlanId || (row.totalInstallments ?? 0) > 1;

export default class FinancialHistoryService {
  static async list(
    params: FinancialHistoryAccess & {
      startDate: Date;
      endDate: Date;
      perspective: FinancialRecognitionPerspective;
      categoryIds?: number[];
      excludeRecurring?: boolean;
      excludeInstallments?: boolean;
    }
  ) {
    const rows = await prisma.financialTransaction.findMany({
      where: {
        AND: [
          { companyId: params.companyId, type: { in: ['INCOME', 'EXPENSE'] } },
          buildOperationalTransactionWhere(),
          buildFinancialRecognitionWhere(params.perspective),
          ...(params.accessFilter ? [params.accessFilter] : []),
          ...(params.categoryIds ? [{ categoryId: { in: params.categoryIds } }] : []),
          ...(params.accessibleAccountIds
            ? [
                {
                  OR: [
                    { fromAccountId: { in: params.accessibleAccountIds } },
                    { toAccountId: { in: params.accessibleAccountIds } }
                  ]
                }
              ]
            : []),
          {
            OR: [
              { AND: [{ creditCardInvoiceId: null }, buildHistoricalNonCardDateWhere(params)] },
              {
                AND: [
                  {
                    creditCardInvoiceId: { not: null },
                    OR: [{ type: 'EXPENSE' }, { creditCardCreditKind: { not: null } }]
                  },
                  buildHistoricalCardDateWhere(params)
                ]
              }
            ]
          }
        ]
      },
      select: {
        id: true,
        amount: true,
        type: true,
        creditCardCreditKind: true,
        date: true,
        dueDate: true,
        effectiveDate: true,
        categoryId: true,
        recurringTransactionId: true,
        installmentPlanId: true,
        totalInstallments: true,
        category: { select: { id: true, name: true, color: true, type: true } },
        creditCardInvoice: {
          select: {
            accountId: true,
            dueDate: true,
            settledAt: true,
            account: { select: { name: true } }
          }
        },
        refundOfTransaction: {
          select: { recurringTransactionId: true, installmentPlanId: true, totalInstallments: true }
        }
      }
    });
    return rows.filter((row) => {
      const original = row.refundOfTransaction;
      return (
        !(params.excludeRecurring && (isRecurring(row) || (original && isRecurring(original)))) &&
        !(
          params.excludeInstallments &&
          (isInstallment(row) || (original && isInstallment(original)))
        )
      );
    });
  }

  static async variableHistory(
    params: FinancialHistoryAccess & {
      calendar: FinancialCalendarContext;
      historyMonths: number;
      categoryIds: number[];
      activeCardIds: Set<number>;
    }
  ) {
    const currentStart = new Date(
      Date.UTC(
        params.calendar.businessDate.getUTCFullYear(),
        params.calendar.businessDate.getUTCMonth(),
        1
      )
    );
    const startDate = addFinancialMonths(currentStart, -params.historyMonths);
    startDate.setUTCHours(0, 0, 0, 0);
    const rows = await this.list({
      ...params,
      categoryIds: undefined,
      startDate,
      endDate: new Date(currentStart.getTime() - 1),
      perspective: 'SETTLEMENT'
    });
    const dated = rows.map((row) => ({
      row,
      month: formatFinancialMonthKey(
        row.creditCardInvoice
          ? (row.creditCardInvoice.settledAt ?? row.creditCardInvoice.dueDate)
          : (row.effectiveDate ?? row.date)
      )
    }));
    // The observation window is independent of the category selection. Gaps after first evidence are zeros.
    const firstMonth = dated.map((item) => item.month).sort()[0];
    const months: string[] = [];
    for (let i = 0; i < params.historyMonths; i++) {
      const month = formatFinancialMonthKey(addFinancialMonths(startDate, i));
      if (firstMonth && month >= firstMonth) months.push(month);
    }
    const categoryIds = new Set(params.categoryIds);
    const bases = new Map<string, ForecastVariableBasis>();
    let uncategorizedCount = 0;
    for (const { row, month } of dated) {
      const original = row.refundOfTransaction;
      if (
        isRecurring(row) ||
        isInstallment(row) ||
        (original && (isRecurring(original) || isInstallment(original)))
      )
        continue;
      const invoice = row.creditCardInvoice;
      if (row.type !== 'EXPENSE' && !(invoice && row.creditCardCreditKind)) continue;
      if (invoice && !params.activeCardIds.has(invoice.accountId)) continue;
      if (row.categoryId === null || !row.category) {
        uncategorizedCount++;
        continue;
      }
      if (!categoryIds.has(row.categoryId)) continue;
      const key = invoice
        ? 'CARD:' + invoice.accountId + ':' + row.categoryId
        : 'ACCOUNT:' + row.categoryId;
      const basis = bases.get(key) ?? {
        key,
        categoryId: row.categoryId,
        categoryName: row.category.name,
        color: row.category.color,
        channel: invoice ? ('CARD' as const) : ('ACCOUNT' as const),
        accountId: invoice?.accountId ?? null,
        accountName: invoice?.account.name ?? null,
        historicalAverage: new Prisma.Decimal(0),
        history: months.map((m) => ({ month: m, amount: new Prisma.Decimal(0) }))
      };
      const point = basis.history.find((item) => item.month === month);
      if (!point) continue;
      point.amount = point.amount.plus(
        invoice ? getCreditCardInvoiceSignedAmount(row) : row.amount
      );
      bases.set(key, basis);
    }
    for (const basis of bases.values()) {
      basis.historicalAverage = Prisma.Decimal.max(
        0,
        basis.history
          .reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0))
          .div(months.length || 1)
      ).toDecimalPlaces(2);
    }
    return {
      months,
      bases: [...bases.values()].sort(
        (a, b) => a.categoryName.localeCompare(b.categoryName) || a.key.localeCompare(b.key)
      ),
      uncategorizedCount
    };
  }
}
