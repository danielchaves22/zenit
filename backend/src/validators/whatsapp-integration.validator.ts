import { z } from 'zod';

export const createWhatsAppBindingChallengeSchema = z.object({
  preferredCompanyId: z.number().int().positive().optional()
});

export const updateWhatsAppActiveCompanySchema = z.object({
  companyId: z.number().int().positive()
});
