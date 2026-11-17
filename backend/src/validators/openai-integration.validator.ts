import { z } from 'zod';

const assistantModel = z.string().trim().min(1).max(100)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'Informe um identificador de modelo válido.');

export const assistantDefaultsSchema = z.object({
  model: assistantModel,
  reasoningEffort: z.enum(['none', 'low', 'medium', 'high']).nullable()
}).strict().refine(({ model, reasoningEffort }) => {
  const baseModel = model.replace(/^ft:/i, '');
  return reasoningEffort === null || !/^(?:gpt-3\.5|gpt-4(?:[.-]|o\b|$)|chatgpt-4o\b)/i.test(baseModel);
}, {
  path: ['reasoningEffort'],
  message: 'Essa família de modelos requer o esforço padrão do provedor.'
});

export const upsertOpenAiByokSchema = z.object({
  apiKey: z.string().trim().min(10, 'apiKey invalida').optional(),
  model: z.string().trim().min(1).max(100).optional(),
  assistantModelOverride: assistantModel.nullable().optional(),
  promptVersion: z.string().trim().min(1).max(50).optional(),
  isActive: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Ao menos um campo deve ser informado.'
});

export const testOpenAiCredentialSchema = z.object({
  apiKey: z.string().trim().min(10, 'apiKey invalida').optional(),
  model: z.string().trim().min(1).max(100).optional()
});

