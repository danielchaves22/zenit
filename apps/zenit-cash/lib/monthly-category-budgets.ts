import api from '@/lib/api';

export type MonthlyCategoryBudgetStatus = 'ON_TRACK' | 'AT_RISK' | 'EXCEEDED';

export interface MonthlyCategoryBudgetItem {
  id: number;
  category: {
    id: number;
    name: string;
    color: string;
    icon: string;
    parentId: number | null;
  };
  limitAmount: string;
  includeChildren: boolean;
  realizedAmount: string;
  committedAmount: string;
  historicalAverageAmount: string;
  forecastAmount: string;
  remainingAmount: string;
  forecastVarianceAmount: string;
  status: MonthlyCategoryBudgetStatus;
}

export interface MonthlyCategoryBudgetResponse {
  month: string;
  statsAvailable: boolean;
  historicalMonthsUsed: number;
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
