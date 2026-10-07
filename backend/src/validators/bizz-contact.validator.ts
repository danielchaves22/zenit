import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const contactFields = {
  name: z.string().trim().min(1, 'Informe o nome.').max(160),
  personType: z.enum(['PERSON', 'BUSINESS']),
  isCustomer: z.boolean(),
  isSupplier: z.boolean(),
  document: optionalText(32).transform((value) => value?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || null),
  email: z
    .union([z.string().trim().email('Informe um e-mail válido.').max(254), z.literal('')])
    .nullish()
    .transform((value) => value?.toLowerCase() || null),
  phone: optionalText(40),
  notes: optionalText(2000),
  active: z.boolean().default(true)
};
const hasRole = (data: { isCustomer: boolean; isSupplier: boolean }) => data.isCustomer || data.isSupplier;
const roleMessage = { message: 'Selecione cliente, fornecedor ou ambos.', path: ['isCustomer'] };
export const createBizzContactSchema = z
  .object({ ...contactFields, requestKey: z.string().uuid() })
  .strict()
  .refine(hasRole, roleMessage);
export const updateBizzContactSchema = z
  .object({ ...contactFields, version: z.number().int().positive() })
  .strict()
  .refine(hasRole, roleMessage);
export const bizzContactListSchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    role: z.enum(['customer', 'supplier', 'all']).default('all'),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    page: z.coerce.number().int().min(1).max(100000).default(1)
  })
  .strict();
export type CreateBizzContact = z.infer<typeof createBizzContactSchema>;
export type UpdateBizzContact = z.infer<typeof updateBizzContactSchema>;
