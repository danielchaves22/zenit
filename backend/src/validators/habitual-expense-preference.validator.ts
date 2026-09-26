import { z } from 'zod';

export const saveHabitualExpensePreferenceSchema = z.object({
  categoryIds: z.array(z.number().int().positive()).max(500)
});
