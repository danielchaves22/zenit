import { PrismaClient, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

const MAX_TRACKED_EXPENSE_CATEGORIES = 10;

function normalizeTrackedExpenseCategoryIds(categoryIds: number[]): number[] {
  return Array.from(
    new Set(
      categoryIds
        .filter((value) => Number.isInteger(value) && value > 0)
        .map((value) => Number(value))
    )
  );
}

export default class UserVariableProjectionPreferenceService {
  static readonly MAX_TRACKED_EXPENSE_CATEGORIES = MAX_TRACKED_EXPENSE_CATEGORIES;

  static async getPreference(userId: number, companyId: number) {
    const preference = await prisma.userVariableProjectionPreference.findUnique({
      where: {
        unique_user_variable_projection_preference: {
          userId,
          companyId
        }
      }
    });

    return {
      trackedExpenseCategoryIds: preference?.trackedExpenseCategoryIds ?? []
    };
  }

  static async setPreference(params: {
    userId: number;
    companyId: number;
    trackedExpenseCategoryIds: number[];
  }) {
    const trackedExpenseCategoryIds = normalizeTrackedExpenseCategoryIds(
      params.trackedExpenseCategoryIds
    );

    if (trackedExpenseCategoryIds.length > MAX_TRACKED_EXPENSE_CATEGORIES) {
      throw new Error(`Selecione no máximo ${MAX_TRACKED_EXPENSE_CATEGORIES} categorias`);
    }

    const validCategories =
      trackedExpenseCategoryIds.length === 0
        ? []
        : await prisma.financialCategory.findMany({
            where: {
              id: { in: trackedExpenseCategoryIds },
              companyId: params.companyId,
              type: TransactionType.EXPENSE
            },
            select: { id: true }
          });

    if (validCategories.length !== trackedExpenseCategoryIds.length) {
      throw new Error('Uma ou mais categorias informadas não são despesas válidas desta empresa');
    }

    const preference = await prisma.userVariableProjectionPreference.upsert({
      where: {
        unique_user_variable_projection_preference: {
          userId: params.userId,
          companyId: params.companyId
        }
      },
      update: {
        trackedExpenseCategoryIds
      },
      create: {
        userId: params.userId,
        companyId: params.companyId,
        trackedExpenseCategoryIds
      }
    });

    return {
      trackedExpenseCategoryIds: preference.trackedExpenseCategoryIds
    };
  }
}
