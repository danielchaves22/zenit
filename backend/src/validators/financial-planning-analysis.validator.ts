import { z } from 'zod';

const historyMonthsSchema = z.coerce
  .number()
  .int('Período histórico deve ser um número inteiro')
  .min(3, 'Use pelo menos 3 meses de histórico')
  .max(12, 'Use no máximo 12 meses de histórico');

const targetMonthlySavingsSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).replace(',', '.').trim())
  .refine(
    (value) => /^\d+(\.\d{1,2})?$/.test(value),
    'Objetivo mensal deve ter no máximo duas casas decimais'
  )
  .refine((value) => Number(value) > 0, 'Objetivo mensal deve ser maior que zero')
  .refine((value) => Number(value) <= 999999999.99, 'Objetivo mensal excede o limite permitido');

export const previewFinancialPlanningAnalysisSchema = z.object({
  historyMonths: historyMonthsSchema.default(6)
});

export const listFinancialPlanningSnapshotsSchema = z.object({
  cursor: z.coerce.number().int().positive('Cursor inválido').optional(),
  limit: z.coerce
    .number()
    .int('Limite deve ser um número inteiro')
    .min(1, 'Limite deve ser maior que zero')
    .max(25, 'Consulte no máximo 25 diagnósticos por vez')
    .default(10)
});

export const getFinancialPlanningSnapshotSchema = z.object({
  id: z.coerce.number().int().positive('Diagnóstico inválido')
});

export const confirmFinancialPlanningAnalysisSchema = z
  .object({
    objectiveKind: z.literal('MONTHLY_SAVINGS').optional().default('MONTHLY_SAVINGS'),
    targetMonthlySavings: targetMonthlySavingsSchema,
    historyMonths: historyMonthsSchema,
    basisHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/, 'Identificação da base financeira inválida'),
    selectedSourceKeys: z
      .array(z.string().trim().min(1).max(180))
      .max(500, 'Selecione no máximo 500 fontes')
  })
  .superRefine((value, context) => {
    if (new Set(value.selectedSourceKeys).size !== value.selectedSourceKeys.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedSourceKeys'],
        message: 'Uma fonte não pode ser selecionada mais de uma vez'
      });
    }
  });

export type PreviewFinancialPlanningAnalysisQuery = z.infer<
  typeof previewFinancialPlanningAnalysisSchema
>;
export type ListFinancialPlanningSnapshotsQuery = z.infer<
  typeof listFinancialPlanningSnapshotsSchema
>;
export type GetFinancialPlanningSnapshotParams = z.infer<
  typeof getFinancialPlanningSnapshotSchema
>;
export type ConfirmFinancialPlanningAnalysisBody = z.infer<
  typeof confirmFinancialPlanningAnalysisSchema
>;
