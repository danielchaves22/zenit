import { z } from 'zod';

function currentDateKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

function currentMonthKey(): string {
  return currentDateKey().slice(0, 7);
}

function maximumDateKey(): string {
  const today = new Date();
  return `${today.getFullYear() + 10}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

function maximumMonthKey(): string {
  return maximumDateKey().slice(0, 7);
}

function isValidDateKey(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).replace(',', '.').trim())
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), 'Valor deve ter no máximo duas casas decimais')
  .refine((value) => Number(value) > 0, 'Valor deve ser maior que zero')
  .refine((value) => Number(value) <= 999999999.99, 'Valor excede o limite permitido');

const optionalMoneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).replace(',', '.').trim())
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), 'Valor deve ter no máximo duas casas decimais')
  .refine((value) => Number(value) >= 0, 'Valor não pode ser negativo')
  .refine((value) => Number(value) <= 999999999.99, 'Valor excede o limite permitido');

const baseMonthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Mês deve estar no formato YYYY-MM')
  .refine((value) => {
    const month = Number(value.slice(5));
    return month >= 1 && month <= 12;
  }, 'Mês inválido')
  .refine((value) => value <= maximumMonthKey(), 'Use um mês dentro dos próximos 10 anos');

const newMonthKeySchema = baseMonthKeySchema.refine(
  (value) => value >= currentMonthKey(),
  'O mês inicial não pode estar no passado'
);

const futureDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
  .refine(isValidDateKey, 'Data inválida')
  .refine((value) => value >= currentDateKey(), 'A data prevista não pode estar no passado')
  .refine((value) => value <= maximumDateKey(), 'Use uma data dentro dos próximos 10 anos');

const occurredAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD')
  .refine(isValidDateKey, 'Data inválida')
  .refine((value) => value <= currentDateKey(), 'Não é possível confirmar uma movimentação futura');

const provisionFields = {
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(100),
  categoryId: z.coerce.number().int().positive(),
  kind: z.enum(['ONE_TIME', 'ANNUAL']),
  expectedAmount: moneySchema,
  targetDate: futureDateSchema,
  notes: z.string().trim().max(500).nullable().optional()
};

function validatePeriod(
  value: { startMonth: string; targetDate: string },
  context: z.RefinementCtx
) {
  if (value.startMonth > value.targetDate.slice(0, 7)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['startMonth'],
      message: 'O mês inicial deve ser anterior ou igual à data prevista'
    });
  }
}

export const createFinancialProvisionSchema = z
  .object({ ...provisionFields, startMonth: newMonthKeySchema })
  .extend({ initialReservedAmount: optionalMoneySchema.optional().default('0') })
  .superRefine(validatePeriod);

export const updateFinancialProvisionSchema = z
  .object({ ...provisionFields, startMonth: baseMonthKeySchema })
  .superRefine(validatePeriod);

export const createFinancialProvisionEntrySchema = z.object({
  type: z.enum(['CONTRIBUTION', 'WITHDRAWAL']),
  amount: moneySchema,
  occurredAt: occurredAtSchema.optional(),
  notes: z.string().trim().max(300).nullable().optional()
});

export const useFinancialProvisionSchema = z.object({
  actualAmount: moneySchema,
  occurredAt: occurredAtSchema.optional(),
  notes: z.string().trim().max(300).nullable().optional()
});

export type CreateFinancialProvisionBody = z.infer<typeof createFinancialProvisionSchema>;
export type UpdateFinancialProvisionBody = z.infer<typeof updateFinancialProvisionSchema>;
export type CreateFinancialProvisionEntryBody = z.infer<typeof createFinancialProvisionEntrySchema>;
export type UseFinancialProvisionBody = z.infer<typeof useFinancialProvisionSchema>;
