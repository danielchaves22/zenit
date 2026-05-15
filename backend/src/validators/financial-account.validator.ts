import { z } from 'zod';

const accountTypeSchema = z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH'], {
  errorMap: () => ({ message: 'Tipo inválido de conta financeira' })
});

const moneyLikeSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const numericValue =
      typeof value === 'string'
        ? Number(value.replace(/[^\d.-]/g, ''))
        : value;

    return Number.isNaN(numericValue) ? null : Number(numericValue);
  });

const initialBalanceSchema = z
  .union([z.string(), z.number()])
  .optional()
  .default('0')
  .transform((value) => {
    if (typeof value === 'string' && value.trim() === '') {
      return 0;
    }

    const numericValue =
      typeof value === 'string'
        ? Number(value.replace(/[^\d.-]/g, ''))
        : value;

    return Number.isNaN(numericValue) ? 0 : Number(numericValue);
  });

const dayOfMonthSchema = z.coerce
  .number()
  .int('Dia deve ser um número inteiro')
  .min(1, 'Dia deve estar entre 1 e 31')
  .max(31, 'Dia deve estar entre 1 e 31')
  .optional()
  .nullable();

const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB')
  .optional()
  .nullable();

export const createAccountSchema = z
  .object({
    name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }),
    type: accountTypeSchema,
    initialBalance: initialBalanceSchema,
    accountNumber: z.string().optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankCode: z.string().max(40).optional().nullable(),
    bankId: z.coerce.number().int().positive().optional().nullable(),
    allowNegativeBalance: z.boolean().optional().default(false),
    creditLimit: moneyLikeSchema,
    cardColor: hexColorSchema,
    statementClosingDay: dayOfMonthSchema,
    statementDueDay: dayOfMonthSchema
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'CREDIT_CARD') {
      return;
    }

    if (data.creditLimit === null || data.creditLimit <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['creditLimit'],
        message: 'Limite do cartão é obrigatório e deve ser maior que zero'
      });
    }

    if (!data.statementClosingDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['statementClosingDay'],
        message: 'Dia de fechamento é obrigatório para cartão de crédito'
      });
    }

    if (!data.statementDueDay) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['statementDueDay'],
        message: 'Dia de vencimento é obrigatório para cartão de crédito'
      });
    }
  });

export const updateAccountSchema = z
  .object({
    name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }).optional(),
    type: accountTypeSchema.optional(),
    accountNumber: z.string().optional().nullable(),
    bankName: z.string().optional().nullable(),
    bankCode: z.string().max(40).optional().nullable(),
    bankId: z.coerce.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional(),
    allowNegativeBalance: z.boolean().optional(),
    creditLimit: moneyLikeSchema,
    cardColor: hexColorSchema,
    statementClosingDay: dayOfMonthSchema,
    statementDueDay: dayOfMonthSchema
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Pelo menos um campo deve ser fornecido para atualização'
  });

export const listAccountsSchema = z.object({
  type: accountTypeSchema.optional(),
  isActive: z.string().optional().transform((value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }),
  allowNegativeBalance: z.string().optional().transform((value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }),
  search: z.string().optional()
});

export const toggleNegativeBalanceSchema = z.object({
  allowNegativeBalance: z.boolean({
    required_error: 'allowNegativeBalance é obrigatório',
    invalid_type_error: 'allowNegativeBalance deve ser true ou false'
  })
});

export type CreateAccountData = z.infer<typeof createAccountSchema>;
export type UpdateAccountData = z.infer<typeof updateAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsSchema>;
export type ToggleNegativeBalanceData = z.infer<typeof toggleNegativeBalanceSchema>;
