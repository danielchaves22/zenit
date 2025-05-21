import { z } from 'zod';

// Regex para validar cores hexadecimais
const colorRegex = /^#([0-9A-F]{3}){1,2}$/i;

// Schema para criar categoria financeira
export const createCategorySchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser INCOME, EXPENSE ou TRANSFER' })
  }),
  color: z.string().regex(colorRegex, { message: 'Cor deve ser um valor hexadecimal válido (ex: #FF5500)' }).default('#6366F1'),
  parentId: z.number().optional().nullable(),
  accountingCode: z.string().optional(),
});

// Schema para atualizar categoria financeira
export const updateCategorySchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }).optional(),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  color: z.string().regex(colorRegex, { message: 'Cor deve ser um valor hexadecimal válido (ex: #FF5500)' }).optional(),
  parentId: z.number().optional().nullable(),
  accountingCode: z.string().optional().nullable(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualização'
});

// Schema para filtros na listagem de categorias
export const listCategoriesSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  parentId: z.string().optional().transform(val => {
    if (val === 'null') return null;
    return val ? Number(val) : undefined;
  }),
  search: z.string().optional(),
});
