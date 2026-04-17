import { z } from 'zod';

export const createProcessTagSchema = z.object({
  name: z.string().trim().min(1, 'Nome da tag e obrigatorio').max(100, 'Nome da tag deve ter no maximo 100 caracteres')
});

export const listProcessTagsSchema = z.object({
  search: z.string().trim().max(100, 'Busca deve ter no maximo 100 caracteres').optional(),
  limit: z.coerce.number().int('Limit deve ser inteiro').min(1, 'Limit deve ser no minimo 1').max(50, 'Limit deve ser no maximo 50').optional().default(20)
});
