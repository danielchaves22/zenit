import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { productAttributeValuesSchema } from './product-attribute.validator';

const fields = {
  attributes: productAttributeValuesSchema.optional(),
  name: z.string().trim().min(1, 'Informe o nome.').max(160),
  kind: z.enum(['PRODUCT', 'SERVICE']),
  unit: z.string().trim().min(1, 'Informe a unidade.').max(40),
  canPurchase: z.boolean(),
  canSell: z.boolean(),
  salePrice: z
    .string()
    .trim()
    .regex(
      /^\d{1,12}(\.\d{1,2})?$/,
      'Informe um preço válido, positivo ou zero, com até duas casas decimais.'
    )
    .transform((value) => new Prisma.Decimal(value).toFixed(2))
    .nullish()
    .transform((value) => value ?? null),
  active: z.boolean().default(true)
};
const hasUsage = (item: { canPurchase: boolean; canSell: boolean }) =>
  item.canPurchase || item.canSell;
const usageError = { message: 'Selecione compra, venda ou ambas.', path: ['canSell'] };
export const createBizzCatalogSchema = z
  .object({ ...fields, requestKey: z.string().uuid() })
  .strict()
  .refine(hasUsage, usageError);
export const updateBizzCatalogSchema = z
  .object({ ...fields, version: z.number().int().positive() })
  .strict()
  .refine(hasUsage, usageError);
export const bizzCatalogListSchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    kind: z.enum(['PRODUCT', 'SERVICE', 'all']).default('all'),
    usage: z.enum(['purchase', 'sale', 'both', 'all']).default('all'),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    page: z.coerce.number().int().min(1).max(100000).default(1)
  })
  .strict();
export type CreateBizzCatalog = z.infer<typeof createBizzCatalogSchema>;
export type UpdateBizzCatalog = z.infer<typeof updateBizzCatalogSchema>;
