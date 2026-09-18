import api from '@/lib/api';

export type PersonalFinancialProfileState =
  | 'NOT_CONFIGURED'
  | 'INCOMPLETE'
  | 'READY'
  | 'OUTDATED';
export type PersonalPlanningContext = 'INDIVIDUAL' | 'FAMILY';
export type PersonalFinancialDataCoverage = 'FULL' | 'PARTIAL';
export type PersonalPlanningStyle = 'CONSERVATIVE' | 'BALANCED' | 'FLEXIBLE';
export type PersonalAdjustmentPace = 'GRADUAL' | 'IMMEDIATE';
export type PersonalCategoryFlexibility = 'PROTECTED' | 'MODERATE' | 'FLEXIBLE';

export interface PersonalFinancialCategory {
  id: number;
  name: string;
  color: string;
  icon: string;
  parentId: number | null;
}

export interface PersonalFinancialCategoryPreference {
  id?: number;
  categoryId: number;
  flexibility: PersonalCategoryFlexibility;
  minimumMonthlyAmount: string | null;
  category?: PersonalFinancialCategory;
}

export interface PersonalFinancialProfile {
  id: number;
  createdByUserId: number | null;
  updatedByUserId: number | null;
  workspace: { id: number; name: string };
  planningContext: PersonalPlanningContext | null;
  adultsCount: number | null;
  dependentsCount: number | null;
  financialDataCoverage: PersonalFinancialDataCoverage | null;
  emergencyReserveTargetMonths: number | null;
  planningStyle: PersonalPlanningStyle | null;
  adjustmentPace: PersonalAdjustmentPace | null;
  categoryPrioritiesReviewed: boolean;
  categoryPrioritiesReviewedAt: string | null;
  lastReviewedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  categoryPreferences: PersonalFinancialCategoryPreference[];
}

export interface PersonalFinancialProfileResponse {
  state: PersonalFinancialProfileState;
  completionPercentage: number;
  profile: PersonalFinancialProfile | null;
  workspace: { id: number; name: string };
  categories: PersonalFinancialCategory[];
  access: {
    canRead: boolean;
    canManage: boolean;
  };
}

export interface SavePersonalFinancialProfileInput {
  planningContext: PersonalPlanningContext | null;
  adultsCount: number | null;
  dependentsCount: number | null;
  financialDataCoverage: PersonalFinancialDataCoverage | null;
  emergencyReserveTargetMonths: number | null;
  planningStyle: PersonalPlanningStyle | null;
  adjustmentPace: PersonalAdjustmentPace | null;
  categoryPrioritiesReviewed: boolean;
  categoryPreferences: Array<{
    categoryId: number;
    flexibility: PersonalCategoryFlexibility;
    minimumMonthlyAmount: string | null;
  }>;
}

export async function getPersonalFinancialProfile(): Promise<PersonalFinancialProfileResponse> {
  const response = await api.get('/financial/planning-profile');
  return response.data as PersonalFinancialProfileResponse;
}

export async function savePersonalFinancialProfile(
  input: SavePersonalFinancialProfileInput
): Promise<PersonalFinancialProfileResponse> {
  const response = await api.put('/financial/planning-profile', input);
  return response.data as PersonalFinancialProfileResponse;
}
