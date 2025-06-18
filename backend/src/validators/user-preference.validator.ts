import { z } from 'zod';

export const updateColorSchemeSchema = z.object({
  colorScheme: z.string().min(1, { message: 'colorScheme é obrigatório.' })
});
