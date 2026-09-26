import VariableExpenseProjectionService from './variable-expense-projection.service';
import MonthlyCategoryBudgetService from './monthly-category-budget.service';
import { Prisma } from '@prisma/client';
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
      habitual: { configured: preference.configured, categoryIds: preference.categoryIds },
      budgets: await MonthlyCategoryBudgetService.compareProjection({ ...params, month, projection: p }),
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
