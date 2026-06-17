import api from '@/lib/api';

export type FinancialDashboardView = 'monthly' | 'history';

export interface VariableProjectionPreference {
  trackedExpenseCategoryIds: number[];
  smallSliceThresholdPercent: number;
}

export interface FinancialDashboardMonthlyResponse {
  month: string;
  isCurrentMonth: boolean;
  period: {
    month: string;
    startDate: string;
    endDate: string;
  };
  structuralSummary: {
    referenceDate: string;
    fixed: {
      incomeTotal: string;
      expenseTotal: string;
      netTotal: string;
    };
    creditCards: {
      totalLimit: string;
      usedLimit: string;
      availableLimit: string;
    };
  };
  carryOver: {
    amount: string;
    source: 'CURRENT_BALANCE' | 'PREVIOUS_PROJECTED';
  };
  monthlyTotals: {
    incomeTotal: string;
    expenseTotal: string;
    committedExpenseTotal: string;
    variableProjectedExpenseTotal: string;
  };
  currentMonthBreakdown: {
    income: {
      realized: string;
      remaining: string;
    };
    expense: {
      realizedCommitted: string;
      remainingCommitted: string;
      remainingVariableProjected: string;
    };
  };
  committedBreakdown: {
    income: {
      adHocMaterializedTotal: string;
      fixedMaterializedTotal: string;
      fixedProjectedTotal: string;
    };
    expense: {
      adHocMaterializedTotal: string;
      fixedMaterializedTotal: string;
      fixedProjectedTotal: string;
      creditCardTotal: string;
    };
  };
  variableProjection: {
    total: string;
    categories: Array<{
      categoryId: number;
      categoryName: string;
      color: string;
      month: string;
      historicalAverage: string;
      committedInMonth: string;
      remainingProjected: string;
    }>;
  };
  projectedEndingBalance: string;
  categoryTotals: Array<{
    categoryId: number | null;
    name: string;
    color: string;
    type: 'INCOME' | 'EXPENSE';
    amount: string;
    realizedAmount: string;
    pendingAmount: string;
    projectedAmount: string;
  }>;
}

export interface FinancialDashboardHistoryResponse {
  months: number;
  monthlyTotals: Array<{
    month: string;
    incomeTotal: string;
    expenseTotal: string;
    isPartialCurrentMonth: boolean;
  }>;
  categorySeries: Array<{
    categoryId: number;
    name: string;
    color: string;
    type: 'INCOME' | 'EXPENSE';
    points: Array<{
      month: string;
      amount: string;
    }>;
  }>;
}

export async function getVariableProjectionPreference(): Promise<VariableProjectionPreference> {
  const response = await api.get('/financial/preferences/variable-projection');
  return response.data as VariableProjectionPreference;
}

export async function updateVariableProjectionPreference(
  params: {
    trackedExpenseCategoryIds: number[];
    smallSliceThresholdPercent: number;
  }
): Promise<VariableProjectionPreference> {
  const response = await api.put('/financial/preferences/variable-projection', {
    trackedExpenseCategoryIds: params.trackedExpenseCategoryIds,
    smallSliceThresholdPercent: params.smallSliceThresholdPercent
  });
  return response.data as VariableProjectionPreference;
}

export async function getFinancialDashboardMonthly(
  month: string
): Promise<FinancialDashboardMonthlyResponse> {
  const response = await api.get('/financial/dashboard/monthly', {
    params: { month }
  });
  return response.data as FinancialDashboardMonthlyResponse;
}

export async function getFinancialDashboardHistory(params?: {
  months?: number;
  categoryIds?: number[];
}): Promise<FinancialDashboardHistoryResponse> {
  const searchParams = new URLSearchParams();

  if (params?.months) {
    searchParams.set('months', String(params.months));
  }

  params?.categoryIds?.forEach((categoryId) => {
    searchParams.append('categoryIds', String(categoryId));
  });

  const query = searchParams.toString();
  const response = await api.get(
    query ? `/financial/dashboard/history?${query}` : '/financial/dashboard/history'
  );
  return response.data as FinancialDashboardHistoryResponse;
}
