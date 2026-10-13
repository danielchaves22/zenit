import { z } from 'zod';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);
const emailValue = z.string().trim().email('Informe um e-mail válido.').max(254).toLowerCase();
const phoneValue = z.string().trim().min(1, 'Informe o telefone.').max(40);
const contactValues = (schema: z.ZodType<string>, kind: 'phone' | 'email') =>
  z
    .array(schema)
    .max(20, 'Cadastre no máximo 20 telefones ou 20 e-mails.')
    .superRefine((values, ctx) => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        const key = kind === 'phone' ? value.replace(/\D/g, '') || value.toLowerCase() : value;
        if (seen.has(key))
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index],
            message:
              kind === 'phone' ? 'Este telefone está repetido.' : 'Este e-mail está repetido.'
          });
        seen.add(key);
      });
    })
    .optional();
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
  country: optionalText(60).optional(),
  phones: contactValues(phoneValue, 'phone'),
  emails: contactValues(emailValue, 'email')
};
export const createBizzContactSchema = z
  .object({ ...contactFields, requestKey: z.string().uuid() })
  .strict();
export const updateBizzContactSchema = z
  .object({
    ...contactFields,
    email: contactFields.email.optional(),
    phone: contactFields.phone.optional(),
    version: z.number().int().positive()
  })
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
