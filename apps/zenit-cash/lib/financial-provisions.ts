import api from '@/lib/api';

export type FinancialProvisionKind = 'ONE_TIME' | 'ANNUAL';
export type FinancialProvisionStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELED';
export type FinancialProvisionState =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'FUNDED'
  | 'OVERDUE'
  | 'COMPLETED'
  | 'CANCELED';
export type FinancialProvisionEntryType =
  | 'INITIAL_BALANCE'
  | 'CONTRIBUTION'
  | 'WITHDRAWAL'
  | 'USE';

export interface FinancialProvisionEntry {
  id: number;
  type: FinancialProvisionEntryType;
  amount: string;
  reservedAmountChange: string;
  occurredAt: string;
  notes: string | null;
  createdAt: string;
}

export interface FinancialProvision {
  id: number;
  name: string;
  notes: string | null;
  kind: FinancialProvisionKind;
  status: FinancialProvisionStatus;
  state: FinancialProvisionState;
  category: {
    id: number;
    name: string;
    color: string;
    icon: string;
    parentId: number | null;
  };
  expectedAmount: string;
  reservedAmount: string;
  remainingAmount: string;
  monthlyContributionAmount: string;
  progressPercent: number;
  monthsRemaining: number;
  startMonth: string;
  targetDate: string;
  completedAt: string | null;
  canceledAt: string | null;
  lastUsedAt: string | null;
  lastUsedAmount: string | null;
  createdAt: string;
  updatedAt: string;
  entries: FinancialProvisionEntry[];
}

export interface FinancialProvisionSummary {
  activeCount: number;
  fundedCount: number;
  overdueCount: number;
  expectedAmount: string;
  reservedAmount: string;
  remainingAmount: string;
  monthlyContributionAmount: string;
}

export interface FinancialProvisionListResponse {
  access: {
    canRead: boolean;
    canManage: boolean;
  };
  summary: FinancialProvisionSummary;
  items: FinancialProvision[];
}

export interface FinancialProvisionInput {
  name: string;
  categoryId: number;
  kind: FinancialProvisionKind;
  expectedAmount: string;
  startMonth: string;
  targetDate: string;
  notes?: string | null;
}

export async function getFinancialProvisions(): Promise<FinancialProvisionListResponse> {
  const response = await api.get('/financial/budgets/provisions');
  return response.data as FinancialProvisionListResponse;
}

export async function createFinancialProvision(
  input: FinancialProvisionInput & { initialReservedAmount?: string }
): Promise<FinancialProvision> {
  const response = await api.post('/financial/budgets/provisions', input);
  return response.data as FinancialProvision;
}

export async function updateFinancialProvision(
  id: number,
  input: FinancialProvisionInput
): Promise<FinancialProvision> {
  const response = await api.put(`/financial/budgets/provisions/${id}`, input);
  return response.data as FinancialProvision;
}

export async function addFinancialProvisionEntry(
  id: number,
  input: {
    type: 'CONTRIBUTION' | 'WITHDRAWAL';
    amount: string;
    occurredAt?: string;
    notes?: string | null;
  }
): Promise<FinancialProvision> {
  const response = await api.post(`/financial/budgets/provisions/${id}/entries`, input);
  return response.data as FinancialProvision;
}

export async function useFinancialProvision(
  id: number,
  input: { actualAmount: string; occurredAt?: string; notes?: string | null }
): Promise<FinancialProvision> {
  const response = await api.post(`/financial/budgets/provisions/${id}/use`, input);
  return response.data as FinancialProvision;
}

export async function cancelFinancialProvision(id: number): Promise<FinancialProvision> {
  const response = await api.post(`/financial/budgets/provisions/${id}/cancel`);
  return response.data as FinancialProvision;
}
