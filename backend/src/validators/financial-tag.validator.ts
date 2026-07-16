import { z } from 'zod';

export const listFinancialTagsSchema = z.object({
  search: z.string()
    .trim()
    .max(50, 'Busca deve ter no maximo 50 caracteres')
    .optional(),

  limit: z.coerce.number()
    .int('Limite deve ser um numero inteiro')
    .min(1, 'Limite deve ser pelo menos 1')
    .max(50, 'Limite deve ser no maximo 50')
    .optional()
    .default(10)
});

export type ListFinancialTagsQuery = z.infer<typeof listFinancialTagsSchema>;
