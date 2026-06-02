import { z } from 'zod';

export const FILTER_PRESET_FEATURE_KEYS = ['financial-transactions'] as const;

const featureKeySchema = z.enum(FILTER_PRESET_FEATURE_KEYS, {
  errorMap: () => ({ message: 'featureKey invalido.' })
});

const presetIdSchema = z.coerce
  .number()
  .int('ID do preset deve ser um numero inteiro')
  .positive('ID do preset deve ser positivo');

const payloadSchema = z
  .object({
    version: z.coerce
      .number()
      .int('payload.version deve ser um numero inteiro')
      .positive('payload.version deve ser positivo')
  })
  .passthrough();

export const listSavedFilterPresetsSchema = z.object({
  featureKey: featureKeySchema
});

export const createSavedFilterPresetSchema = z.object({
  featureKey: featureKeySchema,
  name: z
    .string()
    .trim()
    .min(1, 'name e obrigatorio')
    .max(80, 'name deve ter no maximo 80 caracteres'),
  payload: payloadSchema
});

export const savedFilterPresetIdParamsSchema = z.object({
  id: presetIdSchema
});

export type FilterPresetFeatureKey = (typeof FILTER_PRESET_FEATURE_KEYS)[number];
