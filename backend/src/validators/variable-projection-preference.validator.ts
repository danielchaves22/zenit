import { z } from 'zod';

export const updateVariableProjectionPreferenceSchema = z.object({
  trackedExpenseCategoryIds: z
    .array(
      z.coerce
        .number()
        .int('ID da categoria deve ser um número inteiro')
        .positive('ID da categoria deve ser positivo')
    )
    .max(10, 'Selecione no máximo 10 categorias')
});
