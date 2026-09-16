import prisma from '../lib/prisma';
import {
  PersonalAdjustmentPace,
  PersonalCategoryFlexibility,
  PersonalFinancialDataCoverage,
  PersonalPlanningContext,
  PersonalPlanningStyle,
  Prisma,
  TransactionType
} from '@prisma/client';
import PersonalWorkspaceService from './personal-workspace.service';


export type PersonalFinancialProfileState =
  | 'NOT_CONFIGURED'
  | 'INCOMPLETE'
  | 'READY'
  | 'OUTDATED';

type ProfileInput = {
  planningContext?: PersonalPlanningContext | null;
  adultsCount?: number | null;
  dependentsCount?: number | null;
  financialDataCoverage?: PersonalFinancialDataCoverage | null;
  emergencyReserveTargetMonths?: number | null;
  planningStyle?: PersonalPlanningStyle | null;
  adjustmentPace?: PersonalAdjustmentPace | null;
  categoryPrioritiesReviewed?: boolean;
  categoryPreferences?: Array<{
    categoryId: number;
    flexibility: PersonalCategoryFlexibility;
    minimumMonthlyAmount?: string | null;
  }>;
};

const profileInclude = {
  personalWorkspace: { select: { id: true, name: true } },
  categoryPreferences: {
    include: {
      category: {
        select: { id: true, name: true, color: true, icon: true, parentId: true }
      }
    },
    orderBy: { category: { name: 'asc' as const } }
  }
};

function coreFields(profile: {
  planningContext: PersonalPlanningContext | null;
  adultsCount: number | null;
  dependentsCount: number | null;
  financialDataCoverage: PersonalFinancialDataCoverage | null;
  emergencyReserveTargetMonths: number | null;
  planningStyle: PersonalPlanningStyle | null;
  adjustmentPace: PersonalAdjustmentPace | null;
}) {
  return [
    profile.planningContext,
    profile.adultsCount,
    profile.dependentsCount,
    profile.financialDataCoverage,
    profile.emergencyReserveTargetMonths,
    profile.planningStyle,
    profile.adjustmentPace
  ];
}

function isCoreComplete(profile: Parameters<typeof coreFields>[0]): boolean {
  return coreFields(profile).every((value) => value !== null && value !== undefined);
}

function sixMonthsAgo(): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return date;
}

function profileState(params: {
  profile: any;
  expenseCategoryIds: number[];
}): PersonalFinancialProfileState {
  if (!params.profile) return 'NOT_CONFIGURED';
  if (!isCoreComplete(params.profile) || !params.profile.categoryPrioritiesReviewedAt) {
    return 'INCOMPLETE';
  }

  const preferenceIds = new Set<number>(
    params.profile.categoryPreferences.map((item: any) => item.categoryId)
  );
  const hasUnreviewedCategory = params.expenseCategoryIds.some((id) => !preferenceIds.has(id));
  if (
    !params.profile.lastReviewedAt ||
    params.profile.lastReviewedAt < sixMonthsAgo() ||
    hasUnreviewedCategory
  ) {
    return 'OUTDATED';
  }
  return 'READY';
}

function completionPercentage(params: { profile: any; expenseCategoryIds: number[] }): number {
  if (!params.profile) return 0;
  const completedCoreFields = coreFields(params.profile).filter(
    (value) => value !== null && value !== undefined
  ).length;
  const preferenceIds = new Set<number>(
    params.profile.categoryPreferences.map((item: any) => item.categoryId)
  );
  const categoriesReviewed =
    !!params.profile.categoryPrioritiesReviewedAt &&
    params.expenseCategoryIds.every((id) => preferenceIds.has(id));
  return Math.round(((completedCoreFields + (categoriesReviewed ? 1 : 0)) / 8) * 100);
}

function serializeProfile(profile: any) {
  if (!profile) return null;
  return {
    id: profile.id,
    ownerUserId: profile.ownerUserId,
    personalWorkspace: profile.personalWorkspace,
    planningContext: profile.planningContext,
    adultsCount: profile.adultsCount,
    dependentsCount: profile.dependentsCount,
    financialDataCoverage: profile.financialDataCoverage,
    emergencyReserveTargetMonths: profile.emergencyReserveTargetMonths,
    planningStyle: profile.planningStyle,
    adjustmentPace: profile.adjustmentPace,
    categoryPrioritiesReviewed: !!profile.categoryPrioritiesReviewedAt,
    categoryPrioritiesReviewedAt: profile.categoryPrioritiesReviewedAt?.toISOString() ?? null,
    lastReviewedAt: profile.lastReviewedAt?.toISOString() ?? null,
    version: profile.version,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
    categoryPreferences: profile.categoryPreferences.map((item: any) => ({
      id: item.id,
      categoryId: item.categoryId,
      flexibility: item.flexibility,
      minimumMonthlyAmount: item.minimumMonthlyAmount?.toFixed(2) ?? null,
      category: item.category
    }))
  };
}

function normalizedInput(input: ProfileInput) {
  return {
    planningContext: input.planningContext ?? null,
    adultsCount: input.adultsCount ?? null,
    dependentsCount: input.dependentsCount ?? null,
    financialDataCoverage: input.financialDataCoverage ?? null,
    emergencyReserveTargetMonths: input.emergencyReserveTargetMonths ?? null,
    planningStyle: input.planningStyle ?? null,
    adjustmentPace: input.adjustmentPace ?? null
  };
}

export default class PersonalFinancialProfileService {
  private static async resolveWorkspace(userId: number) {
    const workspace = await PersonalWorkspaceService.getOrCreateForUser(userId);
    const company = await prisma.company.findFirst({
      where: {
        id: workspace.companyId,
        isPersonalWorkspace: true,
        personalWorkspaceOwnerId: userId
      },
      select: { id: true, name: true }
    });
    if (!company) {
      throw new Error('Workspace pessoal do usuário não encontrado');
    }
    return company;
  }

  private static async expenseCategories(personalWorkspaceId: number) {
    return prisma.financialCategory.findMany({
      where: { companyId: personalWorkspaceId, type: TransactionType.EXPENSE },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        parentId: true,
        createdAt: true
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }]
    });
  }

  static async get(userId: number) {
    const workspace = await this.resolveWorkspace(userId);
    const [profile, categories] = await Promise.all([
      prisma.personalFinancialProfile.findUnique({
        where: { ownerUserId: userId },
        include: profileInclude
      }),
      this.expenseCategories(workspace.id)
    ]);

    if (profile && profile.personalWorkspaceId !== workspace.id) {
      throw new Error('Perfil financeiro vinculado a um workspace pessoal diferente');
    }

    const expenseCategoryIds = categories.map((category) => category.id);
    return {
      state: profileState({ profile, expenseCategoryIds }),
      completionPercentage: completionPercentage({ profile, expenseCategoryIds }),
      profile: serializeProfile(profile),
      personalWorkspace: workspace,
      categories: categories.map(({ createdAt: _createdAt, ...category }) => category)
    };
  }

  static async save(userId: number, input: ProfileInput) {
    const workspace = await this.resolveWorkspace(userId);
    const categories = await this.expenseCategories(workspace.id);
    const validCategoryIds = new Set(categories.map((category) => category.id));
    const preferences = input.categoryPreferences ?? [];

    if (preferences.some((preference) => !validCategoryIds.has(preference.categoryId))) {
      throw new Error('Uma ou mais categorias não pertencem ao workspace pessoal');
    }
    if (
      input.categoryPrioritiesReviewed &&
      categories.some(
        (category) => !preferences.some((preference) => preference.categoryId === category.id)
      )
    ) {
      throw new Error('Revise a prioridade de todas as categorias de despesa');
    }

    const normalized = normalizedInput(input);
    const reviewed = !!input.categoryPrioritiesReviewed;
    const complete = isCoreComplete(normalized) && reviewed;
    const categoryPrioritiesReviewedAt = reviewed ? new Date() : null;
    const lastReviewedAt = complete ? categoryPrioritiesReviewedAt : null;

    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.personalFinancialProfile.findUnique({
        where: { ownerUserId: userId }
      });
      if (existing && existing.personalWorkspaceId !== workspace.id) {
        throw new Error('Perfil financeiro vinculado a um workspace pessoal diferente');
      }

      const profile = existing
        ? await transaction.personalFinancialProfile.update({
            where: { id: existing.id },
            data: {
              ...normalized,
              categoryPrioritiesReviewedAt,
              lastReviewedAt,
              version: { increment: 1 }
            }
          })
        : await transaction.personalFinancialProfile.create({
            data: {
              ownerUserId: userId,
              personalWorkspaceId: workspace.id,
              ...normalized,
              categoryPrioritiesReviewedAt,
              lastReviewedAt
            }
          });

      await transaction.personalFinancialCategoryPreference.deleteMany({
        where: { profileId: profile.id }
      });
      if (preferences.length > 0) {
        await transaction.personalFinancialCategoryPreference.createMany({
          data: preferences.map((preference) => ({
            profileId: profile.id,
            categoryId: preference.categoryId,
            flexibility: preference.flexibility,
            minimumMonthlyAmount:
              preference.minimumMonthlyAmount === null ||
              preference.minimumMonthlyAmount === undefined
                ? null
                : new Prisma.Decimal(preference.minimumMonthlyAmount)
          }))
        });
      }

      await transaction.personalFinancialProfileRevision.create({
        data: {
          profileId: profile.id,
          version: profile.version,
          snapshot: {
            ...normalized,
            categoryPrioritiesReviewed: reviewed,
            categoryPreferences: preferences.map((preference) => ({
              categoryId: preference.categoryId,
              flexibility: preference.flexibility,
              minimumMonthlyAmount: preference.minimumMonthlyAmount ?? null
            }))
          }
        }
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return this.get(userId);
  }
}

export const __private__ = {
  completionPercentage,
  isCoreComplete,
  profileState
};
