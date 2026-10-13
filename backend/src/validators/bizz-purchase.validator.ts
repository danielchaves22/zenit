import { z } from 'zod';
import { Prisma } from '@prisma/client';

const decimal = (places: number, integerDigits: number) =>
  z
    .string()
    .regex(
      new RegExp(`^\\d{1,${integerDigits}}(?:\\.\\d{1,${places}})?$`),
      'Informe um valor decimal válido.'
    )
    .refine((value) => {
      try {
        return new Prisma.Decimal(value).gt(0);
      } catch {
        return false;
      }
    }, 'O valor deve ser maior que zero.')
    .transform((value) => new Prisma.Decimal(value).toFixed(places));
export const purchaseDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe uma data válida.')
  .refine((value) => {
    const date = new Date(`${value}T12:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value &&
      value >= '2000-01-01' &&
      value <= '2100-12-31'
    );
  }, 'Informe uma data válida entre 2000 e 2100.');
export const bizzPurchaseListSchema = z.object({
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'pending', 'paid', 'canceled']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1)
});
export const createBizzPurchaseSchema = z
  .object({
    requestKey: z.string().uuid(),
    supplierId: z.string().uuid(),
    date: purchaseDate,
    notes: z.string().trim().max(2000).default(''),
    items: z
      .array(
        z
          .object({
            catalogItemId: z.string().uuid(),
            quantity: decimal(3, 8),
            unitPrice: decimal(2, 10)
          })
          .strict()
      )
      .min(1, 'Adicione ao menos um item.')
      .max(100),
    fromAccountId: z.number().int().positive(),
    categoryId: z.number().int().positive().nullable().default(null),
    installmentCount: z.number().int().min(1).max(60).default(1),
    firstDueDate: purchaseDate
  })
  .strict();
export const settleBizzPurchaseSchema = z
  .object({
    requestKey: z.string().uuid(),
    expectedUpdatedAt: z.string().datetime(),
    fromAccountId: z.number().int().positive(),
    effectiveDate: purchaseDate,
    amount: decimal(2, 12)
  })
  .strict();
export type CreateBizzPurchase = z.infer<typeof createBizzPurchaseSchema>;
export type SettleBizzPurchase = z.infer<typeof settleBizzPurchaseSchema>;
