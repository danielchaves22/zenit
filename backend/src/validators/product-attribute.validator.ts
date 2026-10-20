import { z } from 'zod';

export const attributeKey = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const option = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().trim().min(1, 'Informe o valor.').max(100),
    active: z.boolean().default(true)
  })
  .strict();
const options = z
  .array(option)
  .max(200)
  .refine(
    (values) => new Set(values.map((value) => attributeKey(value.label))).size === values.length,
    'Existem valores repetidos.'
  )
  .refine((values) => {
    const ids = values.flatMap((value) => (value.id ? [value.id] : []));
    return new Set(ids).size === ids.length;
  }, 'Existem valores repetidos.');
const fields = {
  name: z.string().trim().min(1, 'Informe o nome.').max(100),
  description: z.string().trim().max(500).default(''),
  type: z.enum(['SELECT', 'TEXT', 'NUMBER']),
  unit: z.string().trim().max(20).default(''),
  active: z.boolean().default(true),
  options
};
const validType = (value: { type: string; unit: string; options: unknown[] }) =>
  (value.type === 'NUMBER' || !value.unit) && (value.type === 'SELECT' || !value.options.length);
export const createAttributeSchema = z
  .object({
    ...fields,
    requestKey: z.string().uuid()
  })
  .strict()
  .refine(validType, 'Valores predefinidos exigem tipo Lista; unidade exige tipo Número.');
export const updateAttributeSchema = z
  .object({
    ...fields,
    version: z.number().int().positive()
  })
  .strict()
  .refine(validType, 'Valores predefinidos exigem tipo Lista; unidade exige tipo Número.');
export const companyOptionsSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    options
  })
  .strict();
export const attributeListSchema = z
  .object({
    q: z.string().trim().max(100).default(''),
    status: z.enum(['active', 'inactive', 'all']).default('active'),
    scope: z.enum(['global', 'company', 'all']).default('all'),
    page: z.coerce.number().int().min(1).max(100000).default(1)
  })
  .strict();
export const productAttributeValuesSchema = z
  .array(
    z
      .object({
        attributeId: z.string().uuid(),
        optionId: z.string().uuid().nullable().optional(),
        textValue: z.string().trim().min(1).max(500).nullable().optional(),
        numberValue: z
          .string()
          .regex(
            /^-?\d{1,12}(?:\.\d{1,6})?$/,
            'Informe um número com até 12 dígitos inteiros e 6 casas decimais.'
          )
          .nullable()
          .optional()
      })
      .strict()
  )
  .max(50)
  .refine(
    (values) => new Set(values.map((value) => value.attributeId)).size === values.length,
    'Selecione cada característica apenas uma vez.'
  );
export type AttributeInput = z.infer<typeof updateAttributeSchema>;
export type ProductAttributeInput = z.infer<typeof productAttributeValuesSchema>;
