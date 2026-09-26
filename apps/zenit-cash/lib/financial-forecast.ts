import api from './api';

export type ForecastSource = 'income' | 'fixed' | 'other' | 'cards' | 'variable';
export interface ForecastOptions {
  sources: Record<ForecastSource, boolean>;
  cardMode: 'KNOWN_ONLY' | 'ESTIMATE';
  historyMonths: number;
  includeOverdue: boolean;
  excludedIncomeIds: number[];
  excludedVariableKeys: string[];
  overrides: Record<string, string>;
}
export const defaultForecastOptions: ForecastOptions = {
  sources: { income: true, fixed: true, other: true, cards: true, variable: true },
  cardMode: 'ESTIMATE',
  historyMonths: 6,
  includeOverdue: false,
  excludedIncomeIds: [],
  excludedVariableKeys: [],
  overrides: {}
};
export interface ForecastTransaction {
  transactionId: number | null;
  description: string;
  categoryName: string;
  source: ForecastSource;
  type: 'INCOME' | 'EXPENSE';
  month: string;
  amount: string;
  settled: boolean;
  projected: boolean;
  included: boolean;
  installment: { number: number | null; total: number | null } | null;
}
export interface FinancialForecast {
  habitual: { configured: boolean; categoryIds: number[] };
  budgets: ForecastBudgetComparison;
  month: string;
  currentMonth: string;
  maximumMonth: string;
  isCurrentMonth: boolean;
  options: ForecastOptions;
  currentBalance: string;
  openingBalance: string;
  endingBalance: string;
  income: string;
  expense: string;
  result: string;
  remainingIncome: string;
  remainingExpense: string;
  sources: Array<{ key: ForecastSource; included: boolean; income: string; expense: string }>;
  incomes: Array<{ id: number; description: string; amount: string; included: boolean }>;
  history: { months: string[]; requestedMonths: number; uncategorizedCount: number };
  variables: Array<{
    key: string;
    categoryId: number;
    categoryName: string;
    channel: 'ACCOUNT' | 'CARD';
    accountName: string | null;
    historicalAverage: string;
    expectedAmount: string;
    committedInMonth: string;
    remainingProjected: string;
    included: boolean;
    cycleUnavailable: boolean;
    adjusted: boolean;
    history: Array<{ month: string; amount: string }>;
  }>;
  transactions: ForecastTransaction[];
  overdue: {
    included: boolean;
    cashEffect: string;
    income: string;
    expense: string;
    items: ForecastTransaction[];
  };
  cardsWithoutCycle: string[];
  timeline: Array<{
    month: string;
    income: string;
    expense: string;
    result: string;
    endingBalance: string;
  }>;
}
export interface ForecastBudgetComparison {
  coveredForecastAmount: string;
  limitAmount: string;
  unbudgetedForecastAmount: string;
  items: Array<{
    categoryId: number | null;
    categoryName: string;
    includeChildren: boolean;
    limitAmount: string | null;
    forecastAmount: string;
    marginAmount: string | null;
    realizedAmount: string;
    committedAmount: string;
    estimatedAmount: string;
  }>;
}
export async function getFinancialForecast(
  month: string | undefined,
  options: ForecastOptions
): Promise<FinancialForecast> {
  return (await api.post('/financial/dashboard/forecast', { month, ...options })).data;
}
