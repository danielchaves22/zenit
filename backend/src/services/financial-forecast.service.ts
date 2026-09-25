import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import FinancialDashboardService, {
  buildHistoricalCardDateWhere,
  buildHistoricalNonCardDateWhere
} from './financial-dashboard.service';
import WorkspaceFinancialCalendarService from './workspace-financial-calendar.service';
import {
  addFinancialMonths,
  FinancialCalendarContext,
  formatFinancialMonthKey,
  parseFinancialMonthKey
} from '../utils/financial-calendar';
import {
  buildFinancialRecognitionWhere,
  buildOperationalTransactionWhere
} from '../utils/financial-transaction-query';
import { getCreditCardInvoiceSignedAmount } from '../utils/financial-transaction-amount';
import { resolveCreditCardInvoiceReference } from '../utils/credit-card';
import {
  calculateForecastMonth,
  cashEffect,
  ForecastOptions,
  ForecastVariableBasis,
  forecastSource,
  isFixedForecastIncome,
  isForecastRow,
  isForecastRowIncluded
} from '../utils/financial-forecast';
import type { MonthlyProjectionKnownRow } from '../utils/monthly-financial-projection';

const money = (amount: Prisma.Decimal) => amount.toFixed(2);
const start = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const end = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
type Access = {
  companyId: number;
  accessibleAccountIds?: number[];
  accessFilter?: Prisma.FinancialTransactionWhereInput;
};

function serializeRow(row: MonthlyProjectionKnownRow) {
  return {
    transactionId: row.transactionId ?? null,
    description: row.description ?? row.categoryName,
    month: row.competence.month,
    source: forecastSource(row),
    type: row.type,
    amount: money(row.amount),
    categoryName: row.categoryName,
    settled: row.isSettled,
    projected: row.categoryAggregationState === 'PROJECTED',
    installment: row.competence.installment
  };
}

export default class FinancialForecastService {
  static async loadHistory(
    params: Access & {
      calendar: FinancialCalendarContext;
      historyMonths: number;
      activeCardIds: Set<number>;
    }
  ) {
    const rangeStart = start(
      addFinancialMonths(params.calendar.businessDate, -params.historyMonths)
    );
    const rangeEnd = new Date(start(params.calendar.businessDate).getTime() - 1);
    const history = await prisma.financialTransaction.findMany({
      where: {
        AND: [
          { companyId: params.companyId, type: { in: ['INCOME', 'EXPENSE'] } },
          buildOperationalTransactionWhere(),
          buildFinancialRecognitionWhere('SETTLEMENT'),
          ...(params.accessFilter ? [params.accessFilter] : []),
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
              {
                AND: [
                  { creditCardInvoiceId: null },
                  buildHistoricalNonCardDateWhere({
                    perspective: 'SETTLEMENT',
                    startDate: rangeStart,
                    endDate: rangeEnd
                  })
                ]
              },
              {
                AND: [
                  { creditCardInvoiceId: { not: null } },
                  buildHistoricalCardDateWhere({
                    perspective: 'SETTLEMENT',
                    startDate: rangeStart,
                    endDate: rangeEnd
                  })
                ]
              }
            ]
          }
        ]
      },
      select: {
        amount: true,
        type: true,
        creditCardCreditKind: true,
        date: true,
        effectiveDate: true,
        recurringTransactionId: true,
        installmentPlanId: true,
        totalInstallments: true,
        categoryId: true,
        category: { select: { name: true, color: true } },
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
    const dated = history.map((row) => ({
      row,
      month: formatFinancialMonthKey(
        row.creditCardInvoice
          ? (row.creditCardInvoice.settledAt ?? row.creditCardInvoice.dueDate)
          : (row.effectiveDate ?? row.date)
      )
    }));
    // Before the first observed month there is no evidence of zero spending.
    const firstMonth = dated.map((item) => item.month).sort()[0];
    const months: string[] = [];
    for (let index = 0; index < params.historyMonths; index++) {
      const month = formatFinancialMonthKey(addFinancialMonths(rangeStart, index));
      if (firstMonth && month >= firstMonth) months.push(month);
    }
    const bases = new Map<string, ForecastVariableBasis>();
    let uncategorizedCount = 0;
    for (const { row, month } of dated) {
      if (!months.includes(month)) continue;
      if (row.recurringTransactionId || row.installmentPlanId || (row.totalInstallments ?? 0) > 1)
        continue;
      const original = row.refundOfTransaction;
      if (
        original &&
        (original.recurringTransactionId ||
          original.installmentPlanId ||
          (original.totalInstallments ?? 0) > 1)
      )
        continue;
      const invoice = row.creditCardInvoice;
      if (row.type !== 'EXPENSE' && !(invoice && row.creditCardCreditKind)) continue;
      if (invoice && !params.activeCardIds.has(invoice.accountId)) continue;
      if (row.categoryId === null || !row.category) {
        uncategorizedCount++;
        continue;
      }
      const key = invoice
        ? `CARD:${invoice.accountId}:${row.categoryId}`
        : `ACCOUNT:${row.categoryId}`;
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
      const point = basis.history.find((item) => item.month === month)!;
      point.amount = point.amount.plus(
        invoice ? getCreditCardInvoiceSignedAmount(row) : row.amount
      );
      bases.set(key, basis);
    }
    for (const basis of bases.values()) {
      basis.historicalAverage = Prisma.Decimal.max(
        0,
        basis.history
          .reduce((sum, point) => sum.plus(point.amount), new Prisma.Decimal(0))
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

  static async getForecast(
    params: Access & { month?: string; options: ForecastOptions; at?: Date }
  ) {
    const calendar = await WorkspaceFinancialCalendarService.getContext(
      params.companyId,
      params.at
    );
    const month = params.month ?? calendar.currentMonthKey;
    const requestedDate = parseFinancialMonthKey(month);
    if (month < calendar.currentMonthKey || month > calendar.maximumPlanningMonthKey) {
      throw new Error('Escolha um mês entre o atual e os próximos 24 meses');
    }
    const [currentBalance, priorPeriodRows, cards, invoices] = await Promise.all([
      FinancialDashboardService.getCurrentBalance(params),
      FinancialDashboardService.getPriorPeriodPendingRows({ ...params, calendarContext: calendar }),
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
          dueDate: { gte: start(calendar.businessDate), lte: end(requestedDate) }
        },
        select: { accountId: true, status: true, dueDate: true, closingDate: true }
      })
    ]);
    const history = await this.loadHistory({
      ...params,
      calendar,
      historyMonths: params.options.historyMonths,
      activeCardIds: new Set(cards.map((card) => card.id))
    });
    const overdueRows = priorPeriodRows.filter(isForecastRow);
    const selectedOverdue = overdueRows.filter((row) => isForecastRowIncluded(row, params.options));
    // Include income sources from intermediate months/overdues too: they affect accumulated cash.
    const incomeRows = overdueRows.filter(isFixedForecastIncome);
    const overdueCashEffect = params.options.includeOverdue
      ? cashEffect(selectedOverdue)
      : new Prisma.Decimal(0);
    const timeline: Array<{
      month: string;
      income: string;
      expense: string;
      result: string;
      endingBalance: string;
    }> = [];
    let carryOver = currentBalance;
    let selected: ReturnType<typeof calculateForecastMonth> | undefined;
    let selectedRows: MonthlyProjectionKnownRow[] = [];
    for (
      let cursor = start(calendar.businessDate);
      cursor <= requestedDate;
      cursor = addFinancialMonths(cursor, 1)
    ) {
      const monthKey = formatFinancialMonthKey(cursor);
      const knownRows = (
        await FinancialDashboardService.getKnownMonthlyRows({
          ...params,
          monthStart: start(cursor),
          monthEnd: end(cursor),
          currentDate: calendar.businessDate,
          isCurrentMonth: monthKey === calendar.currentMonthKey
        })
      ).filter(isForecastRow);
      incomeRows.push(...knownRows.filter(isFixedForecastIncome));
      const unavailableCardIds = new Set<number>();
      for (const card of cards) {
        if (!card.statementClosingDay || !card.statementDueDay) {
          unavailableCardIds.add(card.id);
          continue;
        }
        const today = new Date(
          calendar.businessDate.getUTCFullYear(),
          calendar.businessDate.getUTCMonth(),
          calendar.businessDate.getUTCDate(),
          12
        );
        const nextInvoice = resolveCreditCardInvoiceReference(
          today,
          card.statementClosingDay,
          card.statementDueDay
        );
        const nextMonth = `${nextInvoice.dueDate.getFullYear()}-${String(nextInvoice.dueDate.getMonth() + 1).padStart(2, '0')}`;
        if (
          monthKey < nextMonth ||
          invoices.some(
            (invoice) =>
              invoice.accountId === card.id &&
              formatFinancialMonthKey(invoice.dueDate) === monthKey &&
              (invoice.status !== 'OPEN' || invoice.closingDate <= calendar.businessDate)
          )
        )
          unavailableCardIds.add(card.id);
      }
      const computed = calculateForecastMonth({
        month: monthKey,
        isCurrentMonth: monthKey === calendar.currentMonthKey,
        carryOverAmount: carryOver,
        knownRows,
        bases: history.bases,
        options: params.options,
        unavailableCardIds
      });
      // Prior obligations affect cash once, without changing their original competence or category budgets.
      if (monthKey === calendar.currentMonthKey)
        computed.projection.projectedEndingBalance =
          computed.projection.projectedEndingBalance.plus(overdueCashEffect);
      const p = computed.projection;
      timeline.push({
        month: monthKey,
        income: money(p.totals.incomeTotal),
        expense: money(p.totals.expenseTotal),
        result: money(p.totals.incomeTotal.minus(p.totals.expenseTotal)),
        endingBalance: money(p.projectedEndingBalance)
      });
      carryOver = p.projectedEndingBalance;
      if (monthKey === month) {
        selected = computed;
        selectedRows = knownRows;
      }
    }
    if (!selected) throw new Error('Não foi possível calcular a previsão');
    const p = selected.projection;
    const incomes = new Map<
      number,
      { id: number; description: string; amount: Prisma.Decimal; included: boolean }
    >();
    for (const row of incomeRows) {
      if (row.recurringTransactionId == null) continue;
      const income = incomes.get(row.recurringTransactionId) ?? {
        id: row.recurringTransactionId,
        description: row.description ?? row.categoryName,
        amount: new Prisma.Decimal(0),
        included: isForecastRowIncluded(row, params.options)
      };
      if (row.competence.month === month) income.amount = income.amount.plus(row.amount);
      incomes.set(income.id, income);
    }
    return {
      month,
      currentMonth: calendar.currentMonthKey,
      maximumMonth: calendar.maximumPlanningMonthKey,
      options: params.options,
      isCurrentMonth: p.isCurrentMonth,
      currentBalance: money(currentBalance),
      openingBalance: money(p.carryOverAmount),
      endingBalance: money(p.projectedEndingBalance),
      income: money(p.totals.incomeTotal),
      expense: money(p.totals.expenseTotal),
      result: money(p.totals.incomeTotal.minus(p.totals.expenseTotal)),
      remainingIncome: money(p.totals.remainingIncomeTotal),
      remainingExpense: money(
        p.totals.remainingCommittedExpenseTotal.plus(p.totals.variableProjectedExpenseTotal)
      ),
      history: {
        months: history.months,
        requestedMonths: params.options.historyMonths,
        uncategorizedCount: history.uncategorizedCount
      },
      sources: selected.sources.map((source) => ({
        ...source,
        income: money(source.income),
        expense: money(source.expense)
      })),
      incomes: [...incomes.values()]
        .sort((a, b) => a.description.localeCompare(b.description) || a.id - b.id)
        .map((income) => ({ ...income, amount: money(income.amount) })),
      variables: selected.variables.map((item) => ({
        ...item,
        historicalAverage: money(item.historicalAverage),
        expectedAmount: money(item.expectedAmount),
        committedInMonth: money(item.committedInMonth),
        remainingProjected: money(item.remainingProjected),
        history: item.history.map((point) => ({ ...point, amount: money(point.amount) }))
      })),
      transactions: selectedRows.map((row) => ({
        ...serializeRow(row),
        included: isForecastRowIncluded(row, params.options)
      })),
      overdue: {
        included: params.options.includeOverdue,
        cashEffect: money(overdueCashEffect),
        income: money(
          selectedOverdue
            .filter((row) => row.type === 'INCOME')
            .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))
        ),
        expense: money(
          selectedOverdue
            .filter((row) => row.type === 'EXPENSE')
            .reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0))
        ),
        items: overdueRows.map((row) => ({
          ...serializeRow(row),
          included: params.options.includeOverdue && isForecastRowIncluded(row, params.options)
        }))
      },
      cardsWithoutCycle: cards
        .filter((card) => !card.statementClosingDay || !card.statementDueDay)
        .map((card) => card.name),
      timeline
    };
  }
}
