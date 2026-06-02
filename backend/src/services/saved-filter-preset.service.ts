import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ListSavedFilterPresetsResult {
  presets: Array<{
    id: number;
    name: string;
    featureKey: string;
    payload: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }>;
  lastUsedPresetId: number | null;
}

interface BaseSavedFilterPresetParams {
  userId: number;
  companyId: number;
}

interface ListSavedFilterPresetsParams extends BaseSavedFilterPresetParams {
  featureKey: string;
}

interface CreateSavedFilterPresetParams extends BaseSavedFilterPresetParams {
  featureKey: string;
  name: string;
  payload: Prisma.InputJsonValue;
}

interface MarkLastUsedFilterPresetParams extends BaseSavedFilterPresetParams {
  presetId: number;
}

interface DeleteSavedFilterPresetParams extends BaseSavedFilterPresetParams {
  presetId: number;
}

async function findOwnedPreset(
  tx: Prisma.TransactionClient | PrismaClient,
  params: BaseSavedFilterPresetParams & { presetId: number }
) {
  return tx.savedFilterPreset.findFirst({
    where: {
      id: params.presetId,
      userId: params.userId,
      companyId: params.companyId
    }
  });
}

const SavedFilterPresetService = {
  async list(params: ListSavedFilterPresetsParams): Promise<ListSavedFilterPresetsResult> {
    const [presets, lastUsed] = await Promise.all([
      prisma.savedFilterPreset.findMany({
        where: {
          userId: params.userId,
          companyId: params.companyId,
          featureKey: params.featureKey
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          name: true,
          featureKey: true,
          payload: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.lastUsedFilterPreset.findUnique({
        where: {
          unique_last_used_filter_preset: {
            userId: params.userId,
            companyId: params.companyId,
            featureKey: params.featureKey
          }
        },
        select: {
          presetId: true
        }
      })
    ]);

    return {
      presets,
      lastUsedPresetId: lastUsed?.presetId ?? null
    };
  },

  async create(params: CreateSavedFilterPresetParams) {
    return prisma.$transaction(async (tx) => {
      const preset = await tx.savedFilterPreset.create({
        data: {
          userId: params.userId,
          companyId: params.companyId,
          featureKey: params.featureKey,
          name: params.name,
          payload: params.payload
        },
        select: {
          id: true,
          name: true,
          featureKey: true,
          payload: true,
          createdAt: true,
          updatedAt: true
        }
      });

      await tx.lastUsedFilterPreset.upsert({
        where: {
          unique_last_used_filter_preset: {
            userId: params.userId,
            companyId: params.companyId,
            featureKey: params.featureKey
          }
        },
        update: {
          presetId: preset.id
        },
        create: {
          userId: params.userId,
          companyId: params.companyId,
          featureKey: params.featureKey,
          presetId: preset.id
        }
      });

      return {
        preset,
        lastUsedPresetId: preset.id
      };
    });
  },

  async markLastUsed(params: MarkLastUsedFilterPresetParams) {
    return prisma.$transaction(async (tx) => {
      const preset = await findOwnedPreset(tx, params);

      if (!preset) {
        throw new Error('Preset de filtro nao encontrado');
      }

      await tx.lastUsedFilterPreset.upsert({
        where: {
          unique_last_used_filter_preset: {
            userId: params.userId,
            companyId: params.companyId,
            featureKey: preset.featureKey
          }
        },
        update: {
          presetId: preset.id
        },
        create: {
          userId: params.userId,
          companyId: params.companyId,
          featureKey: preset.featureKey,
          presetId: preset.id
        }
      });

      return {
        featureKey: preset.featureKey,
        lastUsedPresetId: preset.id
      };
    });
  },

  async delete(params: DeleteSavedFilterPresetParams) {
    return prisma.$transaction(async (tx) => {
      const preset = await findOwnedPreset(tx, params);

      if (!preset) {
        throw new Error('Preset de filtro nao encontrado');
      }

      const currentLastUsed = await tx.lastUsedFilterPreset.findUnique({
        where: {
          unique_last_used_filter_preset: {
            userId: params.userId,
            companyId: params.companyId,
            featureKey: preset.featureKey
          }
        },
        select: {
          presetId: true
        }
      });

      await tx.lastUsedFilterPreset.deleteMany({
        where: {
          userId: params.userId,
          companyId: params.companyId,
          featureKey: preset.featureKey,
          presetId: preset.id
        }
      });

      await tx.savedFilterPreset.delete({
        where: {
          id: preset.id
        }
      });

      return {
        featureKey: preset.featureKey,
        lastUsedPresetId:
          currentLastUsed?.presetId === preset.id
            ? null
            : currentLastUsed?.presetId ?? null
      };
    });
  }
};

export default SavedFilterPresetService;
