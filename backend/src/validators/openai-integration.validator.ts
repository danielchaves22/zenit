import { z } from 'zod';

export const upsertOpenAiByokSchema = z.object({
  apiKey: z.string().trim().min(10, 'apiKey invalida').optional(),
  model: z.string().trim().min(1).max(100).optional(),
  promptVersion: z.string().trim().min(1).max(50).optional(),
  isActive: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Ao menos um campo deve ser informado.'
});

export const testOpenAiCredentialSchema = z.object({
  apiKey: z.string().trim().min(10, 'apiKey invalida').optional(),
  model: z.string().trim().min(1).max(100).optional()
});

