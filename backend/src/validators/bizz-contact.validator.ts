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
  document: optionalText(32).transform(
    (value) => value?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || null
  ),
  email: z
    .union([z.string().trim().email('Informe um e-mail válido.').max(254), z.literal('')])
    .nullish()
    .transform((value) => value?.toLowerCase() || null),
  phone: optionalText(40),
  notes: optionalText(2000),
  active: z.boolean().default(true),
  postalCode: optionalText(20).optional(),
  street: optionalText(160).optional(),
  addressNumber: optionalText(20).optional(),
  complement: optionalText(100).optional(),
  neighborhood: optionalText(100).optional(),
  city: optionalText(100).optional(),
  state: optionalText(60).optional(),
  country: optionalText(60).optional()
};
export const createBizzContactSchema = z
  .object({ ...contactFields, requestKey: z.string().uuid() })
  .strict();
export const updateBizzContactSchema = z
  .object({ ...contactFields, version: z.number().int().positive() })
  .strict();
export const bizzContactListSchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    role: z.enum(['customer', 'supplier', 'both', 'none', 'all']).default('all'),
    personType: z.enum(['PERSON', 'BUSINESS', 'all']).default('all'),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    page: z.coerce.number().int().min(1).max(100000).default(1)
  })
  .strict();
export type CreateBizzContact = z.infer<typeof createBizzContactSchema>;
export type UpdateBizzContact = z.infer<typeof updateBizzContactSchema>;
