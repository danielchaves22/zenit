import { z } from 'zod';

export const updateVariableProjectionPreferenceSchema = z.object({
  trackedExpenseCategoryIds: z
    .array(
      z.coerce
        .number()
        .int('ID da categoria deve ser um numero inteiro')
        .positive('ID da categoria deve ser positivo')
    )
    .max(10, 'Selecione no maximo 10 categorias'),
  smallSliceThresholdPercent: z.coerce
    .number()
    .int('O percentual deve ser um numero inteiro')
    .min(0, 'O percentual deve estar entre 0 e 25')
    .max(25, 'O percentual deve estar entre 0 e 25')
    .default(3)
});
