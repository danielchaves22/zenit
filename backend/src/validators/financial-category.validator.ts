import { z } from 'zod';
import { CATEGORY_ICON_NAMES, DEFAULT_CATEGORY_ICON } from '../constants/category-icons';

const colorRegex = /^#([0-9A-F]{3}){1,2}$/i;

export const createCategorySchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }),
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser INCOME, EXPENSE ou TRANSFER' })
  }),
  color: z
    .string()
    .regex(colorRegex, {
      message: 'Cor deve ser um valor hexadecimal valido (ex: #FF5500)'
    })
    .default('#6366F1'),
  icon: z.enum(CATEGORY_ICON_NAMES).default(DEFAULT_CATEGORY_ICON),
  parentId: z.number().optional().nullable(),
  accountingCode: z.string().optional()
});

export const updateCategorySchema = z
  .object({
    name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }).optional(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
    color: z
      .string()
      .regex(colorRegex, {
        message: 'Cor deve ser um valor hexadecimal valido (ex: #FF5500)'
      })
      .optional(),
    icon: z.enum(CATEGORY_ICON_NAMES).optional(),
    parentId: z.number().optional().nullable(),
    accountingCode: z.string().optional().nullable()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Pelo menos um campo deve ser fornecido para atualizacao'
  });

export const listCategoriesSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
  parentId: z.string().optional().transform((value) => {
    if (value === 'null') {
      return null;
    }

    return value ? Number(value) : undefined;
  }),
  search: z.string().optional()
});

export type ListCategoriesQuery = z.infer<typeof listCategoriesSchema>;
