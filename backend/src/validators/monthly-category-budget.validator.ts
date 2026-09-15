import { z } from 'zod';

const monthKeySchema = z
  .string({ required_error: 'Mês é obrigatório' })
  .regex(/^\d{4}-\d{2}$/, 'Mês deve estar no formato YYYY-MM')
  .refine((value) => {
    const [year, month] = value.split('-').map(Number);
    return year >= 2000 && month >= 1 && month <= 12;
  }, 'Mês inválido')
  .refine((value) => {
    const today = new Date();
    const maximumDate = new Date(today.getFullYear(), today.getMonth() + 24, 1, 12, 0, 0, 0);
    const maximumMonth = `${maximumDate.getFullYear()}-${String(maximumDate.getMonth() + 1).padStart(2, '0')}`;
    return value <= maximumMonth;
  }, 'O planejamento pode ser criado com até 24 meses de antecedência');

const mutableMonthKeySchema = monthKeySchema.refine((value) => {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  return value >= currentMonth;
}, 'O planejamento não pode alterar meses anteriores');

const planOnlySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional()
  .default('false');

const allocationSchema = z.object({
  categoryId: z.coerce
    .number()
    .int('ID da categoria deve ser um número inteiro')
    .positive('ID da categoria deve ser positivo'),
  limitAmount: z
    .union([z.string(), z.number()])
    .transform((value) => String(value).replace(',', '.').trim())
    .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), 'Limite deve ter no máximo duas casas decimais')
    .refine((value) => Number(value) > 0, 'Limite deve ser maior que zero')
    .refine((value) => Number(value) <= 999999999.99, 'Limite excede o valor máximo permitido'),
  includeChildren: z.boolean().optional().default(true),
  recurringChangeScope: z.enum(['MONTH_ONLY', 'FROM_MONTH']).optional().default('MONTH_ONLY')
});

export const getMonthlyCategoryBudgetSchema = z.object({
  month: monthKeySchema,
  planOnly: planOnlySchema
});

export const replaceMonthlyCategoryBudgetSchema = z
  .object({
    month: mutableMonthKeySchema,
    allocations: z.array(allocationSchema).max(200, 'Use no máximo 200 categorias por mês')
  })
  .superRefine((value, context) => {
    const seenCategoryIds = new Set<number>();

    value.allocations.forEach((allocation, index) => {
      if (seenCategoryIds.has(allocation.categoryId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['allocations', index, 'categoryId'],
          message: 'A categoria não pode aparecer mais de uma vez'
        });
      }

      seenCategoryIds.add(allocation.categoryId);
    });
  });

export const createMonthlyCategoryBudgetSchema = z.object({
  month: mutableMonthKeySchema,
  categoryId: allocationSchema.shape.categoryId,
  limitAmount: allocationSchema.shape.limitAmount,
  includeChildren: allocationSchema.shape.includeChildren,
  kind: z.enum(['ONE_TIME', 'FIXED_MONTHLY'])
});

export const endRecurringMonthlyCategoryBudgetSchema = z.object({
  month: mutableMonthKeySchema
});

export type GetMonthlyCategoryBudgetQuery = z.infer<typeof getMonthlyCategoryBudgetSchema>;
export type ReplaceMonthlyCategoryBudgetBody = z.infer<
  typeof replaceMonthlyCategoryBudgetSchema
>;
export type CreateMonthlyCategoryBudgetBody = z.infer<
  typeof createMonthlyCategoryBudgetSchema
>;
export type EndRecurringMonthlyCategoryBudgetBody = z.infer<
  typeof endRecurringMonthlyCategoryBudgetSchema
>;
