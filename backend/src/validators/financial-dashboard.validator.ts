import { z } from 'zod';

const categoryIdsFilterSchema = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '' && item !== null && item !== undefined);
}, z.array(
  z.coerce
    .number()
    .int('ID da categoria deve ser um número inteiro')
    .positive('ID da categoria deve ser positivo')
));

export const getFinancialDashboardMonthlySchema = z.object({
  month: z
    .string({
      required_error: 'Mês é obrigatório'
    })
    .regex(/^\d{4}-\d{2}$/, 'Mês deve estar no formato YYYY-MM')
});

export const getFinancialDashboardHistorySchema = z.object({
  months: z.coerce
    .number()
    .int('Quantidade de meses deve ser um número inteiro')
    .min(1, 'Quantidade de meses deve ser pelo menos 1')
    .max(24, 'Quantidade de meses deve ser no máximo 24')
    .default(12),
  categoryIds: categoryIdsFilterSchema.optional()
});

export type GetFinancialDashboardMonthlyQuery = z.infer<
  typeof getFinancialDashboardMonthlySchema
>;
export type GetFinancialDashboardHistoryQuery = z.infer<
  typeof getFinancialDashboardHistorySchema
>;
