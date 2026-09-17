import api from '@/lib/api';

export type FinancialPlanningSourceKind =
  | 'FIXED_INCOME'
  | 'FIXED_EXPENSE'
  | 'INSTALLMENT'
  | 'PROVISION'
  | 'VARIABLE_EXPENSE';

export type FinancialPlanningSourceOrigin =
  | 'RECURRING_TRANSACTION'
  | 'NON_CARD_INSTALLMENT'
  | 'CREDIT_CARD_INSTALLMENT'
  | 'PROVISION'
  | 'HISTORICAL_CATEGORY';

export interface FinancialPlanningSource {
  key: string;
  kind: FinancialPlanningSourceKind;
  origin: FinancialPlanningSourceOrigin;
  label: string;
  detail: string;
  monthlyAmount: string;
  selectedByDefault: boolean;
  metadata: Record<string, string | number | boolean | null>;
}

export interface FinancialPlanningTotals {
  monthlyIncome: string;
  monthlyCommittedExpenses: string;
  monthlyVariableExpenses: string;
  monthlyProvisionContribution: string;
  monthlyAvailableBeforeGoal: string;
  monthlyBalanceAfterGoal: string;
}

export interface FinancialPlanningDataQuality {
  score: number;
  rating: 'HIGH' | 'MEDIUM' | 'LOW';
  requestedMonths: number;
  monthsWithData: number;
  historyTransactionCount: number;
  expenseTransactionCount: number;
  categorizedExpenseCount: number;
  breakdown: Array<{
    key: string;
    label: string;
    points: number;
    maximum: number;
  }>;
  issues: Array<{
    code: string;
    severity: 'INFO' | 'WARNING';
    message: string;
  }>;
}

export interface FinancialPlanningSnapshot {
  id: number;
  objectiveKind: 'MONTHLY_SAVINGS';
  targetMonthlySavings: string;
  historyMonths: number;
  historyStartDate: string;
  historyEndDate: string;
  profileVersion: number;
  methodologyVersion: number;
  basisHash: string | null;
  dataQualityScore: number;
  dataQuality: FinancialPlanningDataQuality;
  sources: Array<FinancialPlanningSource & { selected: boolean }>;
  selectedSourceKeys: string[];
  totals: FinancialPlanningTotals;
  status: 'CONFIRMED';
  confirmedAt: string;
  createdAt: string;
}

export interface FinancialPlanningSnapshotSummary {
  id: number;
  objectiveKind: 'MONTHLY_SAVINGS';
  targetMonthlySavings: string;
  historyMonths: number;
  historyStartDate: string;
  historyEndDate: string;
  profileVersion: number;
  methodologyVersion: number;
  basisHash: string | null;
  dataQualityScore: number;
  selectedSourceCount: number;
  totals: FinancialPlanningTotals;
  status: 'CONFIRMED';
  confirmedAt: string;
  createdAt: string;
}

export interface FinancialPlanningSnapshotPage {
  items: FinancialPlanningSnapshotSummary[];
  nextCursor: number | null;
}

export interface FinancialPlanningScenarioAdjustment {
  sourceKey: string;
  categoryId: number | null;
  categoryName: string;
  flexibility: 'MODERATE' | 'FLEXIBLE';
  currentAmount: string;
  minimumMonthlyAmount: string;
  adjustableAmount: string;
  proposedReduction: string;
  suggestedMonthlyLimit: string;
  explanation: string;
}

export interface FinancialPlanningScenario {
  id: 'PRESERVE_PRIORITIES' | 'BALANCED';
  label: string;
  description: string;
  feasibility: 'FEASIBLE' | 'PARTIAL' | 'NO_ADJUSTABLE_EXPENSES';
  requiredReduction: string;
  proposedReduction: string;
  remainingGap: string;
  projectedMonthlyAvailableBeforeGoal: string;
  projectedMonthlyBalanceAfterGoal: string;
  adjustments: FinancialPlanningScenarioAdjustment[];
  assumptions: string[];
  warnings: string[];
}

export interface FinancialGuidanceEvidenceMetric {
  key: string;
  label: string;
  value: string;
  format: 'MONEY' | 'PERCENT' | 'NUMBER';
}

export interface FinancialGuidanceFinding {
  id:
    | 'BASE_BALANCE'
    | 'GOAL_FIT'
    | 'COMMITTED_INCOME_SHARE'
    | 'VARIABLE_EXPENSE_CONCENTRATION'
    | 'ADJUSTMENT_CAPACITY'
    | 'DATA_QUALITY';
  severity: 'POSITIVE' | 'INFORMATIONAL' | 'ATTENTION' | 'CRITICAL';
  title: string;
  summary: string;
  evidence: FinancialGuidanceEvidenceMetric[];
  referenceIds: string[];
}

export interface FinancialGuidanceReference {
  id: string;
  organization: string;
  title: string;
  url: string;
  purpose: string;
}

export interface FinancialGuidanceEvidence {
  methodologyVersion: number;
  findings: FinancialGuidanceFinding[];
  references: FinancialGuidanceReference[];
  limitations: string[];
}

export interface FinancialPlanningScenarioResult {
  snapshot: {
    id: number;
    basisHash: string | null;
    confirmedAt: string;
  };
  recommendationMethodologyVersion: number;
  status: 'TARGET_ALREADY_MET' | 'ADJUSTMENT_REQUIRED';
  targetMonthlySavings: string;
  currentMonthlyAvailableBeforeGoal: string;
  currentMonthlyBalanceAfterGoal: string;
  requiredReduction: string;
  scenarios: FinancialPlanningScenario[];
  guidanceEvidence?: FinancialGuidanceEvidence;
}

export interface FinancialPlanningPreview {
  workspace: { id: number; name: string };
  methodologyVersion: number;
  basisHash: string;
  profile: {
    version: number;
    financialDataCoverage: 'FULL' | 'PARTIAL';
    lastReviewedAt: string;
  };
  period: { historyMonths: number; startDate: string; endDate: string };
  dataQuality: FinancialPlanningDataQuality;
  sources: FinancialPlanningSource[];
  defaultSelectedSourceKeys: string[];
  defaultTotals: FinancialPlanningTotals;
  latestSnapshot: FinancialPlanningSnapshot | null;
}

export interface FinancialPlanningApiError {
  error: string;
  code?:
    | 'PERSONAL_WORKSPACE_REQUIRED'
    | 'FINANCIAL_PROFILE_REQUIRED'
    | 'FINANCIAL_PROFILE_OUTDATED'
    | 'FINANCIAL_PLANNING_PREVIEW_STALE'
    | 'FINANCIAL_PLANNING_INTEGRITY_CONFLICT'
    | 'FINANCIAL_PLANNING_SNAPSHOT_NOT_FOUND'
    | 'FINANCIAL_PLANNING_SNAPSHOT_UNSUPPORTED_FOR_SCENARIOS'
    | 'FINANCIAL_PLANNING_SNAPSHOT_STALE_FOR_SCENARIOS'
    | 'FINANCIAL_PLANNING_SNAPSHOT_INVALID_FOR_SCENARIOS'
    | 'INVALID_SOURCE_SELECTION'
    | 'INCOME_SOURCE_REQUIRED';
}

export async function getFinancialPlanningPreview(
  historyMonths: number
): Promise<FinancialPlanningPreview> {
  const response = await api.get('/financial/budgets/planning-analysis/preview', {
    params: { historyMonths }
  });
  return response.data as FinancialPlanningPreview;
}

export async function confirmFinancialPlanningSnapshot(input: {
  objectiveKind: 'MONTHLY_SAVINGS';
  targetMonthlySavings: string;
  historyMonths: number;
  selectedSourceKeys: string[];
  basisHash: string;
}): Promise<FinancialPlanningSnapshot> {
  const response = await api.post('/financial/budgets/planning-analysis/snapshots', input);
  return response.data as FinancialPlanningSnapshot;
}

export async function getFinancialPlanningSnapshots(params?: {
  cursor?: number;
  limit?: number;
}): Promise<FinancialPlanningSnapshotPage> {
  const response = await api.get('/financial/budgets/planning-analysis/snapshots', { params });
  return response.data as FinancialPlanningSnapshotPage;
}

export async function getFinancialPlanningSnapshot(
  snapshotId: number
): Promise<FinancialPlanningSnapshot> {
  const response = await api.get(`/financial/budgets/planning-analysis/snapshots/${snapshotId}`);
  return response.data as FinancialPlanningSnapshot;
}

export async function getFinancialPlanningSnapshotScenarios(
  snapshotId: number
): Promise<FinancialPlanningScenarioResult> {
  const response = await api.get(
    `/financial/budgets/planning-analysis/snapshots/${snapshotId}/scenarios`
  );
  return response.data as FinancialPlanningScenarioResult;
}
