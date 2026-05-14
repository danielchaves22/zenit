import { z } from 'zod';

const fgtsRegimeEnum = z.enum(['FGTS_8', 'FGTS_11_2']);
const calculationVerbaStrategyEnum = z.enum([
  'MONTHLY_WITH_STANDARD_REFLEXES',
  'STANDARD_RESCISORY_BLOCK',
  'RESCISORY_NOTICE',
  'QUANTITY_X_HOURLY_RATE',
  'QUANTITY_X_DAILY_RATE',
  'MONTHS_X_REMUNERATION',
  'MONTHS_X_BASE_AMOUNT',
  'FIXED_AMOUNT',
  'CONDITIONAL_PENALTY_467',
  'CONDITIONAL_PENALTY_477'
]);
const calculationVerbaFgtsModeEnum = z.enum(['REGIME', 'FIXED_8', 'NONE']);

const positiveId = z.coerce.number().int('ID deve ser inteiro').positive('ID deve ser positivo');
const jsonObjectSchema = z.record(z.any());

export const initialCalculationProcessSchema = z.object({
  id: positiveId
});

export const initialCalculationVersionSchema = z.object({
  id: positiveId,
  fgtsRegime: fgtsRegimeEnum,
  inputs: jsonObjectSchema.default({}),
  publish: z.boolean().optional().default(false),
  disabledVerbaCodes: z.array(z.string().trim().min(1, 'Codigo da verba e obrigatorio')).optional().default([])
});

export const createInitialCalculationVersionWithCalculationSchema = z.object({
  id: positiveId,
  calculationId: positiveId,
  fgtsRegime: fgtsRegimeEnum,
  inputs: jsonObjectSchema.default({}),
  publish: z.boolean().optional().default(false),
  disabledVerbaCodes: z.array(z.string().trim().min(1, 'Codigo da verba e obrigatorio')).optional().default([])
});

export const publishInitialCalculationVersionSchema = z.object({
  id: positiveId,
  calculationId: positiveId,
  versionId: positiveId
});

export const listInitialCalculationVersionsSchema = z.object({
  id: positiveId,
  calculationId: positiveId
});

export const createProcessCustomVerbaSchema = z.object({
  id: positiveId,
  code: z.string().trim().max(80, 'Codigo deve ter no maximo 80 caracteres').optional().nullable(),
  label: z.string().trim().min(1, 'Nome da verba e obrigatorio').max(255, 'Nome da verba deve ter no maximo 255 caracteres'),
  groupCode: z.string().trim().min(1, 'Grupo da verba e obrigatorio').max(80, 'Grupo deve ter no maximo 80 caracteres'),
  groupLabel: z.string().trim().min(1, 'Descricao do grupo e obrigatoria').max(255, 'Descricao do grupo deve ter no maximo 255 caracteres'),
  strategy: calculationVerbaStrategyEnum,
  fgtsMode: calculationVerbaFgtsModeEnum,
  configJson: jsonObjectSchema.optional().nullable(),
  inputSchemaJson: jsonObjectSchema.optional().nullable(),
  sortOrder: z.coerce.number().int('sortOrder deve ser inteiro').optional().default(0),
  isActive: z.boolean().optional().default(true)
});

export const updateProcessCustomVerbaSchema = z
  .object({
    id: positiveId,
    verbaId: positiveId,
    code: z.string().trim().max(80, 'Codigo deve ter no maximo 80 caracteres').optional().nullable(),
    label: z.string().trim().min(1, 'Nome da verba e obrigatorio').max(255, 'Nome da verba deve ter no maximo 255 caracteres').optional(),
    groupCode: z.string().trim().min(1, 'Grupo da verba e obrigatorio').max(80, 'Grupo deve ter no maximo 80 caracteres').optional(),
    groupLabel: z.string().trim().min(1, 'Descricao do grupo e obrigatoria').max(255, 'Descricao do grupo deve ter no maximo 255 caracteres').optional(),
    strategy: calculationVerbaStrategyEnum.optional(),
    fgtsMode: calculationVerbaFgtsModeEnum.optional(),
    configJson: jsonObjectSchema.optional().nullable(),
    inputSchemaJson: jsonObjectSchema.optional().nullable(),
    sortOrder: z.coerce.number().int('sortOrder deve ser inteiro').optional(),
    isActive: z.boolean().optional()
  })
  .refine(
    (data) =>
      data.code !== undefined ||
      data.label !== undefined ||
      data.groupCode !== undefined ||
      data.groupLabel !== undefined ||
      data.strategy !== undefined ||
      data.fgtsMode !== undefined ||
      data.configJson !== undefined ||
      data.inputSchemaJson !== undefined ||
      data.sortOrder !== undefined ||
      data.isActive !== undefined,
    {
      message: 'Ao menos um campo deve ser informado para atualizar a verba.',
      path: ['label']
    }
  );

export const processCustomVerbaParamsSchema = z.object({
  id: positiveId,
  verbaId: positiveId
});
