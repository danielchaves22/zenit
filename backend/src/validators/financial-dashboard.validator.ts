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

export const financialForecastSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido').optional(),
  sources: z.object({
    income: z.boolean().default(true),
    fixed: z.boolean().default(true), other: z.boolean().default(true),
    cards: z.boolean().default(true), variable: z.boolean().default(true)
  }).default({}),
  cardMode: z.enum(['KNOWN_ONLY', 'ESTIMATE']).default('ESTIMATE'),
  historyMonths: z.number().int().min(1).max(12).default(6),
  includeOverdue: z.boolean().default(false),
  excludedIncomeIds: z.array(z.number().int().positive()).max(500).default([]),
  excludedVariableKeys: z.array(z.string().regex(/^(ACCOUNT|CARD:\d+):\d+$/)).max(500).default([]),
  overrides: z.record(
    z.string().regex(/^(ACCOUNT|CARD:\d+):\d+$/),
    z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Informe um valor válido e não negativo')
  ).refine((value) => Object.keys(value).length <= 500, 'Quantidade de ajustes excedida').default({})
});
