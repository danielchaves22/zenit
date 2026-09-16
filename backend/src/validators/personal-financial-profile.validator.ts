import { z } from 'zod';

const nullableInteger = (minimum: number, maximum: number, label: string) =>
  z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.coerce
      .number()
      .int(`${label} deve ser um número inteiro`)
      .min(minimum, `${label} deve ser no mínimo ${minimum}`)
      .max(maximum, `${label} deve ser no máximo ${maximum}`)
      .nullable()
  );

const nullableMoney = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z
    .union([z.string(), z.number()])
    .transform((value) => String(value).replace(',', '.').trim())
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), 'Valor deve ter no máximo duas casas decimais')
    .refine((value) => Number(value) >= 0, 'Valor não pode ser negativo')
    .refine((value) => Number(value) <= 999999999.99, 'Valor excede o limite permitido')
    .nullable()
);

export const savePersonalFinancialProfileSchema = z
  .object({
    planningContext: z.enum(['INDIVIDUAL', 'FAMILY']).nullable().optional(),
    adultsCount: nullableInteger(1, 20, 'Quantidade de adultos').optional(),
    dependentsCount: nullableInteger(0, 30, 'Quantidade de dependentes').optional(),
    financialDataCoverage: z.enum(['FULL', 'PARTIAL']).nullable().optional(),
    emergencyReserveTargetMonths: nullableInteger(0, 24, 'Meta da reserva').optional(),
    planningStyle: z.enum(['CONSERVATIVE', 'BALANCED', 'FLEXIBLE']).nullable().optional(),
    adjustmentPace: z.enum(['GRADUAL', 'IMMEDIATE']).nullable().optional(),
    categoryPrioritiesReviewed: z.boolean().optional().default(false),
    categoryPreferences: z
      .array(
        z.object({
          categoryId: z.coerce.number().int().positive(),
          flexibility: z.enum(['PROTECTED', 'MODERATE', 'FLEXIBLE']),
          minimumMonthlyAmount: nullableMoney.optional()
        })
      )
      .max(500)
      .optional()
      .default([])
  })
  .superRefine((value, context) => {
    if (value.planningContext === 'INDIVIDUAL' && value.adultsCount !== null && value.adultsCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adultsCount'],
        message: 'O planejamento individual deve considerar uma pessoa adulta'
      });
    }

    const categoryIds = value.categoryPreferences.map((item) => item.categoryId);
    if (new Set(categoryIds).size !== categoryIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['categoryPreferences'],
        message: 'Uma categoria não pode aparecer mais de uma vez'
      });
    }
  });

export type SavePersonalFinancialProfileBody = z.infer<
  typeof savePersonalFinancialProfileSchema
>;
