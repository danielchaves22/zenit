import { z } from 'zod';

const bankCodeSchema = z
  .string()
  .trim()
  .min(2, 'Codigo deve ter pelo menos 2 caracteres')
  .max(60, 'Codigo deve ter no maximo 60 caracteres')
  .regex(/^[A-Za-z0-9_\-\s]+$/, 'Codigo contem caracteres invalidos');

const bankNameSchema = z
  .string()
  .trim()
  .min(2, 'Nome deve ter pelo menos 2 caracteres')
  .max(120, 'Nome deve ter no maximo 120 caracteres');

const iconSlugSchema = z
  .string()
  .trim()
  .min(1, 'Icone e obrigatorio')
  .max(120, 'Icone invalido');

const displayOrderSchema = z
  .coerce
  .number()
  .int('Ordem deve ser um numero inteiro')
  .min(0, 'Ordem nao pode ser negativa')
  .max(9999, 'Ordem muito alta')
  .optional();

export const createBankSchema = z.object({
  code: bankCodeSchema,
  name: bankNameSchema,
  iconSlug: iconSlugSchema,
  displayOrder: displayOrderSchema,
  isActive: z.boolean().optional()
});

export const updateBankSchema = z
  .object({
    code: bankCodeSchema.optional(),
    name: bankNameSchema.optional(),
    iconSlug: iconSlugSchema.optional(),
    displayOrder: displayOrderSchema,
    isActive: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Pelo menos um campo deve ser fornecido para atualizacao'
  });
