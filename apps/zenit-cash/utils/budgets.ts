import api from '@/lib/api';

export type BudgetKind = 'SPENDING' | 'SAVINGS';
export type BudgetStatus = 'ACTIVE' | 'ARCHIVED' | 'EXPIRED' | 'DELETED';
export type BudgetEntryType = 'INCOME' | 'EXPENSE';
export type BudgetEntryAllocationMode = 'PRINCIPAL' | 'EXTRA';

export interface BudgetEntry {
  clientKey: string;
  entryType: BudgetEntryType;
  allocationMode: BudgetEntryAllocationMode | null;
  amountCents: number;
  principalImpactAmountCents: number;
  occurredAt: string;
  description: string | null;
  affectsBudgetBalance: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  clientKey: string;
  code: string;
  kind: BudgetKind;
  status: BudgetStatus;
  initialBalanceCents: number;
  currentBalanceCents: number;
  targetEndingBalanceCents: number;
  dailyBudgetInitialCents: number;
  dailyBudgetCurrentCents: number;
  dayExtraBalanceCents: number;
  startDate: string;
  endDate: string;
  lastDailyBudgetDate: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  entries: BudgetEntry[];
}

export interface BudgetListResponse {
  timeZone: string;
  businessDate: string;
  budgets: Budget[];
}

export async function fetchBudgets(): Promise<BudgetListResponse> {
  const response = await api.get<BudgetListResponse>('/cash/budgets');
  return response.data;
}

export function formatCurrencyFromCents(valueInCents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format((valueInCents || 0) / 100);
}

export function formatBusinessDate(date: string, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(new Date(date));
}

export function formatBusinessDateTime(date: string, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(date));
}

export function getBudgetKindLabel(kind: BudgetKind): string {
  if (kind === 'SPENDING') return 'Gasto';
  if (kind === 'SAVINGS') return 'Economia';
  return kind;
}

export function getBudgetStatusLabel(status: BudgetStatus): string {
  const labels: Record<BudgetStatus, string> = {
    ACTIVE: 'Ativo',
    ARCHIVED: 'Arquivado',
    EXPIRED: 'Expirado',
    DELETED: 'Excluído'
  };

  return labels[status] || status;
}

export function getEntryTypeLabel(type: BudgetEntryType): string {
  if (type === 'INCOME') return 'Entrada';
  if (type === 'EXPENSE') return 'Saída';
  return type;
}

export function getAllocationModeLabel(
  allocationMode: BudgetEntryAllocationMode | null | undefined
): string | null {
  if (!allocationMode) return null;
  if (allocationMode === 'PRINCIPAL') return 'Principal';
  if (allocationMode === 'EXTRA') return 'Extra';
  return allocationMode;
}

export function getPrimaryBudget(budgets: Budget[]): Budget | null {
  return budgets.find((budget) => budget.isPrimary && budget.status === 'ACTIVE') || null;
}

export function sortBudgetEntries(entries: BudgetEntry[]): BudgetEntry[] {
  return [...entries].sort((left, right) => {
    const occurredDiff = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
    if (occurredDiff !== 0) return occurredDiff;

    const createdDiff = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    if (createdDiff !== 0) return createdDiff;

    return right.clientKey.localeCompare(left.clientKey);
  });
}

export function getBudgetDaysRemaining(
  budget: Budget,
  businessDate: string,
  timeZone = 'UTC'
): number {
  const end = normalizeBusinessDay(budget.endDate, timeZone);
  const current = normalizeBusinessDay(businessDate, timeZone);
  const diff = end.getTime() - current.getTime();
  return Math.max(0, Math.floor(diff / 86400000) + 1);
}

function normalizeBusinessDay(date: string, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(date));

  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';

  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}
