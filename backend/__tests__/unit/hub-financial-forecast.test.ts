import { Prisma } from '@prisma/client';
import FinancialDashboardService from '../../src/services/financial-dashboard.service';
import FinancialForecastService from '../../src/services/financial-forecast.service';
import FinancialTransactionService from '../../src/services/financial-transaction.service';
import MonthlyCategoryBudgetService from '../../src/services/monthly-category-budget.service';
import ToolExecutorService from '../../src/services/tool-executor.service';
import VariableExpenseProjectionService from '../../src/services/variable-expense-projection.service';
import WorkspaceFinancialCalendarService from '../../src/services/workspace-financial-calendar.service';
import { buildFinancialCalendarContext } from '../../src/utils/financial-calendar';
import { defaultForecastOptions } from '../../src/utils/financial-forecast';
import type { MonthlyProjectionKnownRow } from '../../src/utils/monthly-financial-projection';

const access = { companyId: 12, accessibleAccountIds: [8], accessFilter: { toAccountId: 8 } };
const calendar = buildFinancialCalendarContext('America/Sao_Paulo', new Date('2026-11-25T14:00:00Z'));
const decimal = (value: string) => new Prisma.Decimal(value);
function income(description: string, amount: string, changes: Partial<MonthlyProjectionKnownRow> = {}): MonthlyProjectionKnownRow {
  return {
    description, amount: decimal(amount), type: 'INCOME', source: 'FIXED_MATERIALIZED',
    recurringTransactionId: 1, transactionId: 10, isSettled: false, categoryAggregationState: 'PENDING',
    competence: { month: '2026-11', date: '2026-11-25', basis: 'TRANSACTION_DUE_DATE', installment: null },
    categoryId: 5, categoryName: 'Salário', categoryColor: '#123456', ...changes
  };
}

describe('Cash projections for the Hub', () => {
  afterEach(() => jest.restoreAllMocks());

  it('paginates only fixed income and preserves full scenario totals and statuses across pages', async () => {
    jest.spyOn(WorkspaceFinancialCalendarService, 'getContext').mockResolvedValue(calendar);
    jest.spyOn(FinancialDashboardService, 'getCurrentBalance').mockResolvedValue(decimal('100.00'));
    jest.spyOn(FinancialDashboardService, 'getPriorPeriodPendingRows').mockResolvedValue([
      income('Anterior', '42.00', { competence: { month: '2026-10', date: '2026-10-15', basis: 'TRANSACTION_DUE_DATE', installment: null } })
    ]);
    const rows = jest.spyOn(FinancialDashboardService, 'getKnownMonthlyRows').mockResolvedValue([
      income('Já recebida', '30.00', { isSettled: true, categoryAggregationState: 'REALIZED' }),
      income('Projetada', '22.33', { source: 'FIXED_PROJECTED', transactionId: undefined, recurringTransactionId: 3,
        competence: { month: '2026-11', date: '2026-11-28', basis: 'FIXED_OCCURRENCE_DATE', installment: null },
        categoryAggregationState: 'PROJECTED' }),
      income('Materializada', '99.99', { transactionId: 20, recurringTransactionId: 2 }),
      income('Avulsa', '87.01', { source: 'AD_HOC_MATERIALIZED', recurringTransactionId: null }),
      income('Conta', '20.00', { type: 'EXPENSE' })
    ]);
    jest.spyOn(VariableExpenseProjectionService, 'load').mockResolvedValue({
      preference: { configured: false, categoryIds: [] }, history: { bases: [], months: [], uncategorizedCount: 0 },
      cards: [], invoices: [], calendar
    } as any);
    const budgets = jest.spyOn(MonthlyCategoryBudgetService, 'compareProjection').mockResolvedValue({
      items: [], coveredForecastAmount: '0.00', limitAmount: '0.00', unbudgetedForecastAmount: '0.00'
    });
    const first = await FinancialForecastService.getHubForecast({ limit: 2 }, access);
    if (!first.ok) throw new Error(first.message);
    expect(rows).toHaveBeenCalledTimes(1);
    expect(rows).toHaveBeenCalledWith(expect.objectContaining(access));
    expect(first).toMatchObject({
      ok: true, month: '2026-11', income: '152.32', remainingIncome: '122.32',
      expense: '20.00', result: '132.32', remainingExpense: '20.00', endingBalance: '202.32',
      overdue: { included: false, income: '42.00', cashEffect: '0.00' },
      fixedIncome: { page: 1, limit: 2, totalItems: 3, hasMore: true,
        totals: { pending: '99.99', projected: '22.33', settled: '30.00' },
        items: [
          { description: 'Materializada', date: '2026-11-25', amount: '99.99', projected: false, settled: false },
          { description: 'Projetada', date: '2026-11-28', amount: '22.33', projected: true, settled: false }
        ] }
    });
    const second = await FinancialForecastService.getHubForecast({ page: 2, limit: 2, month: null }, access);
    expect(second).toMatchObject({
      income: first.income, fixedIncome: { totalItems: 3, hasMore: false, totals: first.fixedIncome?.totals,
        items: [{ description: 'Já recebida', projected: false, settled: true }] }
    });
    expect(budgets).not.toHaveBeenCalled();
    const dashboard = await FinancialForecastService.getForecast({ ...access, options: defaultForecastOptions });
    expect(first).toMatchObject({
      openingBalance: dashboard.openingBalance, endingBalance: dashboard.endingBalance,
      remainingIncome: dashboard.remainingIncome, remainingExpense: dashboard.remainingExpense,
      sources: dashboard.sources
    });
  });

  it('returns public errors for invalid arguments and months outside the workspace planning window', async () => {
    const getCalendar = jest.spyOn(WorkspaceFinancialCalendarService, 'getContext').mockResolvedValue(calendar);
    for (const [args, code] of [
      [{ month: '2026-13' }, 'invalid_period'], [{ page: 0 }, 'invalid_arguments'],
      [{ limit: 21 }, 'invalid_arguments'], [{ companyId: 1 }, 'invalid_arguments']
    ] as const) {
      expect(await FinancialForecastService.getHubForecast(args, access)).toMatchObject({ ok: false, code });
    }
    expect(getCalendar).not.toHaveBeenCalled();
    for (const month of ['2026-10', '2028-12']) {
      expect(await FinancialForecastService.getHubForecast({ month }, access)).toMatchObject({
        ok: false, code: 'invalid_period', currentMonth: '2026-11', maximumMonth: '2028-11'
      });
    }
  });

  it('marks virtual fixed expenses and projected card summaries and preserves materialized expenses', async () => {
    jest.spyOn(FinancialTransactionService, 'listTransactions').mockResolvedValue({
      total: 3, summary: { expenseTotal: 6 },
      data: [
        { description: 'Virtual', amount: 1, isVirtual: true },
        { description: 'Fatura', amount: 2, isProjected: true, isCreditCardInvoiceSummary: true },
        { description: 'Real', amount: 3, isVirtual: false }
      ]
    } as any);
    const result = await ToolExecutorService.executeTool('get_due_obligations', { window: 'TODAY' }, {
      userId: 1, role: 'ADMIN', companyId: 12, sessionId: 1, turnId: 1, mode: 'OPERATOR'
    });
    expect(result.data.items).toMatchObject([
      { description: 'Virtual', isProjected: true }, { description: 'Fatura', isProjected: true },
      { description: 'Real', isProjected: false }
    ]);
  });
});
