import api from '@/lib/api';

export type MonthlyCategoryBudgetStatus = 'ON_TRACK' | 'AT_RISK' | 'EXCEEDED';
export type MonthlyCategoryBudgetOrigin = 'ONE_TIME' | 'FIXED_MONTHLY' | 'FIXED_OVERRIDE';
export type MonthlyCategoryBudgetKind = 'ONE_TIME' | 'FIXED_MONTHLY';
export type RecurringBudgetChangeScope = 'MONTH_ONLY' | 'FROM_MONTH';

export interface MonthlyCategoryBudgetItem {
  id: number;
  category: {
    id: number;
    name: string;
    color: string;
    icon: string;
    parentId: number | null;
  };
  monthlyBudgetId: number | null;
  recurringBudgetId: number | null;
  limitAmount: string;
  includeChildren: boolean;
  origin: MonthlyCategoryBudgetOrigin;
  baseLimitAmount: string | null;
  recurrenceStartMonth: string | null;
  realizedAmount: string;
  committedAmount: string;
  historicalAverageAmount: string;
  forecastAmount: string;
  remainingAmount: string;
  forecastVarianceAmount: string;
  status: MonthlyCategoryBudgetStatus;
}

export interface MonthlyCategoryBudgetResponse {
  access: {
    canRead: boolean;
    canManage: boolean;
  };
  month: string;
  statsAvailable: boolean;
  historicalMonthsUsed: number;
  habitualConfigured?: boolean;
  summary: {
    plannedAmount: string;
    realizedAmount: string;
    committedAmount: string;
    forecastAmount: string;
    remainingAmount: string;
    forecastVarianceAmount: string;
    atRiskCount: number;
    exceededCount: number;
  };
  items: MonthlyCategoryBudgetItem[];
}

export interface MonthlyCategoryBudgetAllocationInput {
  categoryId: number;
  limitAmount: string;
  includeChildren: boolean;
  recurringChangeScope?: RecurringBudgetChangeScope;
}

export async function getMonthlyCategoryBudget(
  month: string,
  options?: { planOnly?: boolean }
): Promise<MonthlyCategoryBudgetResponse> {
  const response = await api.get('/financial/budgets/monthly', {
    params: {
      month,
      ...(options?.planOnly ? { planOnly: 'true' } : {})
    }
  });

  return response.data as MonthlyCategoryBudgetResponse;
}

export async function replaceMonthlyCategoryBudget(params: {
  month: string;
  allocations: MonthlyCategoryBudgetAllocationInput[];
}): Promise<MonthlyCategoryBudgetResponse> {
  const response = await api.put('/financial/budgets/monthly', params);
  return response.data as MonthlyCategoryBudgetResponse;
}

export async function createMonthlyCategoryBudget(params: {
  month: string;
  categoryId: number;
  limitAmount: string;
  includeChildren: boolean;
  kind: MonthlyCategoryBudgetKind;
}): Promise<MonthlyCategoryBudgetResponse> {
  const response = await api.post('/financial/budgets/monthly/items', params);
  return response.data as MonthlyCategoryBudgetResponse;
}

export async function endRecurringMonthlyCategoryBudget(params: {
  recurringBudgetId: number;
  month: string;
}): Promise<MonthlyCategoryBudgetResponse> {
  const response = await api.post(
    `/financial/budgets/monthly/recurring/${params.recurringBudgetId}/end`,
    { month: params.month }
  );
  return response.data as MonthlyCategoryBudgetResponse;
}
