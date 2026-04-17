import { z } from 'zod';

export const updateGmailIngestionConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    subjectRequiredText: z.string().trim().min(1).max(255).optional(),
    lookbackDays: z.coerce.number().int().min(1).max(30).optional(),
    pollingIntervalMinutes: z.coerce.number().int().min(1).max(120).optional(),
    reconciliationIntervalMinutes: z.coerce.number().int().min(5).max(1440).optional(),
    maxEmailsPerRun: z.coerce.number().int().min(1).max(200).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Ao menos um campo deve ser informado para atualizar a configuracao.'
  });

