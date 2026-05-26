import { z } from 'zod';

export const executeFinancialResetSchema = z.object({
  confirmationText: z
    .string()
    .trim()
    .min(1, 'Texto de confirmacao e obrigatorio')
});
