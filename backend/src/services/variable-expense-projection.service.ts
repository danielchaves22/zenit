import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import HabitualExpensePreferenceService from './habitual-expense-preference.service';
import FinancialHistoryService, { FinancialHistoryAccess } from './financial-history.service';
import {
  FinancialCalendarContext,
  formatFinancialMonthKey,
  parseFinancialMonthKey
} from '../utils/financial-calendar';
import { resolveCreditCardInvoiceReference } from '../utils/credit-card';
import { calculateForecastVariables, defaultForecastOptions } from '../utils/financial-forecast';
import type { MonthlyProjectionKnownRow } from '../utils/monthly-financial-projection';

export default class VariableExpenseProjectionService {
  static async load(
    params: FinancialHistoryAccess & {
      calendar: FinancialCalendarContext;
      historyMonths: number;
      month?: string;
    }
  ) {
    const date = params.calendar.businessDate;
    const target = parseFinancialMonthKey(params.month ?? params.calendar.currentMonthKey);
    const [preference, cards, invoices] = await Promise.all([
      HabitualExpensePreferenceService.get(params.companyId),
      prisma.financialAccount.findMany({
        where: {
          companyId: params.companyId,
          type: 'CREDIT_CARD',
          isActive: true,
          ...(params.accessibleAccountIds ? { id: { in: params.accessibleAccountIds } } : {})
        },
        select: { id: true, name: true, statementClosingDay: true, statementDueDay: true }
      }),
      prisma.creditCardInvoice.findMany({
        where: {
          account: {
            companyId: params.companyId,
            ...(params.accessibleAccountIds ? { id: { in: params.accessibleAccountIds } } : {})
          },
          dueDate: {
            gte: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
            lte: new Date(
              Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 23, 59, 59, 999)
            )
          }
        },
        select: { accountId: true, status: true, dueDate: true, closingDate: true }
      })
    ]);
    const history = await FinancialHistoryService.variableHistory({
      ...params,
      categoryIds: preference.categoryIds,
      activeCardIds: new Set(cards.map((card) => card.id))
    });
    return { preference, history, cards, invoices, calendar: params.calendar };
  }

  static unavailableCards(context: VariableExpenseContext, month: string) {
    const unavailable = new Set<number>();
    const date = context.calendar.businessDate;
    for (const card of context.cards) {
      if (!card.statementClosingDay || !card.statementDueDay) {
        unavailable.add(card.id);
        continue;
      }
      const today = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12);
      const nextInvoice = resolveCreditCardInvoiceReference(
        today,
        card.statementClosingDay,
        card.statementDueDay
      );
      const nextMonth =
        nextInvoice.dueDate.getFullYear() +
        '-' +
        String(nextInvoice.dueDate.getMonth() + 1).padStart(2, '0');
      if (
        month < nextMonth ||
        context.invoices.some(
          (invoice) =>
            invoice.accountId === card.id &&
            formatFinancialMonthKey(invoice.dueDate) === month &&
            (invoice.status !== 'OPEN' || invoice.closingDate <= date)
        )
      )
        unavailable.add(card.id);
    }
    return unavailable;
  }

  static estimate(params: {
    context: VariableExpenseContext;
    month: string;
    knownRows: MonthlyProjectionKnownRow[];
  }) {
    return calculateForecastVariables({
      ...params,
      bases: params.context.history.bases,
      options: defaultForecastOptions,
      unavailableCardIds: this.unavailableCards(params.context, params.month)
    }).map((item) => ({
      ...item,
      remainingProjected: item.included ? item.remainingProjected : new Prisma.Decimal(0)
    }));
  }
}

export type VariableExpenseContext = Awaited<
  ReturnType<typeof VariableExpenseProjectionService.load>
>;
