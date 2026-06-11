import { z } from 'zod';

export const updateVariableProjectionPreferenceSchema = z.object({
  trackedExpenseCategoryIds: z
    .array(
      z.coerce
        .number()
        .int('ID da categoria deve ser um numero inteiro')
        .positive('ID da categoria deve ser positivo')
    )
    .max(10, 'Selecione no maximo 10 categorias')
});
