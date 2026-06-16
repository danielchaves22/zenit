import { PrismaClient, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

const MAX_TRACKED_EXPENSE_CATEGORIES = 10;
const DEFAULT_SMALL_SLICE_THRESHOLD_PERCENT = 3;
const MAX_SMALL_SLICE_THRESHOLD_PERCENT = 25;

function normalizeTrackedExpenseCategoryIds(categoryIds: number[]): number[] {
  return Array.from(
    new Set(
      categoryIds
        .filter((value) => Number.isInteger(value) && value > 0)
        .map((value) => Number(value))
    )
  );
}

function normalizeSmallSliceThresholdPercent(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error('O percentual deve ser um numero inteiro');
  }

  if (value < 0 || value > MAX_SMALL_SLICE_THRESHOLD_PERCENT) {
    throw new Error(`O percentual deve estar entre 0 e ${MAX_SMALL_SLICE_THRESHOLD_PERCENT}`);
  }

  return value;
}

export default class UserVariableProjectionPreferenceService {
  static readonly MAX_TRACKED_EXPENSE_CATEGORIES = MAX_TRACKED_EXPENSE_CATEGORIES;
  static readonly DEFAULT_SMALL_SLICE_THRESHOLD_PERCENT = DEFAULT_SMALL_SLICE_THRESHOLD_PERCENT;
  static readonly MAX_SMALL_SLICE_THRESHOLD_PERCENT = MAX_SMALL_SLICE_THRESHOLD_PERCENT;

  static async getPreference(userId: number, companyId: number) {
    const preference = (await prisma.userVariableProjectionPreference.findUnique({
      where: {
        unique_user_variable_projection_preference: {
          userId,
          companyId
        }
      }
    })) as
      | {
          trackedExpenseCategoryIds: number[];
          smallSliceThresholdPercent: number;
        }
      | null;

    return {
      trackedExpenseCategoryIds: preference?.trackedExpenseCategoryIds ?? [],
      smallSliceThresholdPercent:
        preference?.smallSliceThresholdPercent ?? DEFAULT_SMALL_SLICE_THRESHOLD_PERCENT
    };
  }

  static async setPreference(params: {
    userId: number;
    companyId: number;
    trackedExpenseCategoryIds: number[];
    smallSliceThresholdPercent: number;
  }) {
    const trackedExpenseCategoryIds = normalizeTrackedExpenseCategoryIds(
      params.trackedExpenseCategoryIds
    );
    const smallSliceThresholdPercent = normalizeSmallSliceThresholdPercent(
      params.smallSliceThresholdPercent
    );

    if (trackedExpenseCategoryIds.length > MAX_TRACKED_EXPENSE_CATEGORIES) {
      throw new Error(`Selecione no maximo ${MAX_TRACKED_EXPENSE_CATEGORIES} categorias`);
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
      throw new Error('Uma ou mais categorias informadas nao sao despesas validas desta empresa');
    }

    const preference = await (prisma.userVariableProjectionPreference as any).upsert({
      where: {
        unique_user_variable_projection_preference: {
          userId: params.userId,
          companyId: params.companyId
        }
      },
      update: {
        trackedExpenseCategoryIds,
        smallSliceThresholdPercent
      },
      create: {
        userId: params.userId,
        companyId: params.companyId,
        trackedExpenseCategoryIds,
        smallSliceThresholdPercent
      }
    });

    return {
      trackedExpenseCategoryIds: preference.trackedExpenseCategoryIds,
      smallSliceThresholdPercent: preference.smallSliceThresholdPercent
    };
  }
}
