import VariableExpenseProjectionService from './variable-expense-projection.service';
import MonthlyCategoryBudgetService from './monthly-category-budget.service';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { financialForecastSchema } from '../validators/financial-dashboard.validator';
import FinancialDashboardService from './financial-dashboard.service';
import WorkspaceFinancialCalendarService from './workspace-financial-calendar.service';
import {
  addFinancialMonths,
  formatFinancialMonthKey,
  parseFinancialMonthKey
} from '../utils/financial-calendar';
import {
  calculateForecastMonth,
  cashEffect,
  defaultForecastOptions,
  ForecastOptions,
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

type ForecastRequest = Access & { month?: string; options: ForecastOptions; at?: Date };
const hubForecastQuery = z.object({
  month: financialForecastSchema.shape.month.nullish(),
  page: z.number().int().min(1).max(10000).nullish(),
  limit: z.number().int().min(1).max(20).nullish()
}).strict();

class ForecastPeriodError extends Error {
  constructor(readonly currentMonth: string, readonly maximumMonth: string) {
    super('Escolha um mês entre o atual e os próximos 24 meses');
  }
}

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
  private static async calculateScenario(params: ForecastRequest) {
    const calendar = await WorkspaceFinancialCalendarService.getContext(
      params.companyId,
      params.at
    );
    const month = params.month ?? calendar.currentMonthKey;
    const requestedDate = parseFinancialMonthKey(month);
    if (month < calendar.currentMonthKey || month > calendar.maximumPlanningMonthKey) {
      throw new ForecastPeriodError(calendar.currentMonthKey, calendar.maximumPlanningMonthKey);
    }
    const [currentBalance, priorPeriodRows, variableContext] = await Promise.all([
      FinancialDashboardService.getCurrentBalance(params),
      FinancialDashboardService.getPriorPeriodPendingRows({ ...params, calendarContext: calendar }),
      VariableExpenseProjectionService.load({ ...params, month, calendar, historyMonths: params.options.historyMonths })
    ]);
    const { history, cards, preference } = variableContext;
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
      const unavailableCardIds = VariableExpenseProjectionService.unavailableCards(variableContext, monthKey);
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
    const summary = {
      month,
      currentMonth: calendar.currentMonthKey,
      maximumMonth: calendar.maximumPlanningMonthKey,
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
      sources: selected.sources.map((source) => ({
        ...source,
        income: money(source.income),
        expense: money(source.expense)
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
      }
    };
    return { summary, selected, selectedRows, incomeRows, overdueRows, history, cards, preference, timeline };
  }

  static async getHubForecast(args: Record<string, unknown>, access: Access) {
    const parsed = hubForecastQuery.safeParse(args);
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path[0] === 'month')) {
        return { ok: false as const, code: 'invalid_period', message: 'Informe o mês no formato YYYY-MM.' };
      }
      return { ok: false as const, code: 'invalid_arguments', message: 'Use mês, página de 1 a 10000 e limite de 1 a 20.' };
    }
    const { month, page, limit } = parsed.data;
    try {
      const { summary, selectedRows } = await this.calculateScenario({
        ...access, month: month ?? undefined, options: defaultForecastOptions
      });
      const fixedIncome = selectedRows.filter(isFixedForecastIncome).sort((a, b) =>
        Number(a.isSettled) - Number(b.isSettled) ||
        a.competence.date.localeCompare(b.competence.date) ||
        (a.recurringTransactionId ?? 0) - (b.recurringTransactionId ?? 0) ||
        (a.transactionId ?? 0) - (b.transactionId ?? 0)
      );
      const totals = { projected: new Prisma.Decimal(0), pending: new Prisma.Decimal(0), settled: new Prisma.Decimal(0) };
      for (const row of fixedIncome) {
        const state = row.isSettled ? 'settled' : row.source === 'FIXED_PROJECTED' ? 'projected' : 'pending';
        totals[state] = totals[state].plus(row.amount);
      }
      const pageNumber = page ?? 1;
      const pageSize = limit ?? 20;
      const offset = (pageNumber - 1) * pageSize;
      return {
        ok: true as const, ...summary,
        fixedIncome: {
          page: pageNumber, limit: pageSize, totalItems: fixedIncome.length,
          hasMore: offset + pageSize < fixedIncome.length,
          totals: { projected: money(totals.projected), pending: money(totals.pending), settled: money(totals.settled) },
          items: fixedIncome.slice(offset, offset + pageSize).map((row) => ({
            description: row.description ?? row.categoryName,
            date: row.competence.date,
            amount: money(row.amount),
            projected: row.source === 'FIXED_PROJECTED',
            settled: row.isSettled
          }))
        }
      };
    } catch (error) {
      if (error instanceof ForecastPeriodError) {
        return { ok: false as const, code: 'invalid_period', message: error.message,
          currentMonth: error.currentMonth, maximumMonth: error.maximumMonth };
      }
      throw error;
    }
  }

  static async getForecast(params: ForecastRequest) {
    const { summary, selected, selectedRows, incomeRows, overdueRows, history, cards, preference, timeline } =
      await this.calculateScenario(params);
    const month = summary.month;
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
      ...summary,
      options: params.options,
      habitual: { configured: preference.configured, categoryIds: preference.categoryIds },
      budgets: await MonthlyCategoryBudgetService.compareProjection({ ...params, month, projection: selected.projection }),
      history: {
        months: history.months,
        requestedMonths: params.options.historyMonths,
        uncategorizedCount: history.uncategorizedCount
      },
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
        ...summary.overdue,
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
