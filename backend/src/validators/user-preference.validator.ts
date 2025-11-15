import { z } from 'zod';

export const updateColorSchemeSchema = z.object({
  colorScheme: z.string().min(1, { message: 'colorScheme é obrigatório.' })
});

export const updatePreferencesSchema = z.object({
  colorScheme: z.string().min(1, { message: 'colorScheme é obrigatório.' }).optional(),
  confirmNegativeBalanceMovements: z.boolean().optional()
}).refine(
  (data) => data.colorScheme !== undefined || data.confirmNegativeBalanceMovements !== undefined,
  {
    message: 'É necessário informar pelo menos uma preferência para atualizar.'
  }
);
