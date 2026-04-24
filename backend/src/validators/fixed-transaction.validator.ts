import { z } from 'zod';

const transactionTypeSchema = z.enum(['INCOME', 'EXPENSE'], {
  errorMap: () => ({ message: 'Tipo deve ser INCOME ou EXPENSE' })
});

export const createFixedTransactionSchema = z.object({
  description: z.string()
    .min(1, 'Descricao e obrigatoria')
    .max(255, 'Descricao deve ter no maximo 255 caracteres'),

  amount: z.number()
    .positive('Valor deve ser positivo'),

  type: transactionTypeSchema,

  dayOfMonth: z.coerce.number()
    .int('Dia do mes deve ser um numero inteiro')
    .min(1, 'Dia do mes deve ser entre 1 e 31')
    .max(31, 'Dia do mes deve ser entre 1 e 31'),

  startDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de inicio deve ser valida' })
  }).optional(),

  endDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de fim deve ser valida' })
  }).nullable().optional(),

  notes: z.string()
    .max(1000, 'Observacoes devem ter no maximo 1000 caracteres')
    .optional(),

  fromAccountId: z.number()
    .int('ID da conta de origem deve ser um numero inteiro')
    .positive('ID da conta de origem deve ser positivo')
    .optional()
    .nullable(),

  toAccountId: z.number()
    .int('ID da conta de destino deve ser um numero inteiro')
    .positive('ID da conta de destino deve ser positivo')
    .optional()
    .nullable(),

  categoryId: z.number()
    .int('ID da categoria deve ser um numero inteiro')
    .positive('ID da categoria deve ser positivo')
    .optional()
    .nullable()
}).refine((data) => {
  if (data.type === 'INCOME' && !data.toAccountId) return false;
  if (data.type === 'EXPENSE' && !data.fromAccountId) return false;
  return true;
}, {
  message: 'Configuracao de contas invalida para o tipo da transacao fixa',
  path: ['type']
}).refine((data) => {
  if (!data.startDate || !data.endDate) {
    return true;
  }

  return data.endDate >= data.startDate;
}, {
  message: 'Data final deve ser posterior ou igual a data inicial',
  path: ['endDate']
});

export const updateFixedTransactionSchema = z.object({
  description: z.string()
    .min(1, 'Descricao nao pode estar vazia')
    .max(255, 'Descricao deve ter no maximo 255 caracteres')
    .optional(),

  amount: z.number()
    .positive('Valor deve ser positivo')
    .optional(),

  type: transactionTypeSchema.optional(),

  dayOfMonth: z.coerce.number()
    .int('Dia do mes deve ser um numero inteiro')
    .min(1, 'Dia do mes deve ser entre 1 e 31')
    .max(31, 'Dia do mes deve ser entre 1 e 31')
    .optional(),

  notes: z.string()
    .max(1000, 'Observacoes devem ter no maximo 1000 caracteres')
    .optional(),

  fromAccountId: z.number()
    .int('ID da conta de origem deve ser um numero inteiro')
    .positive('ID da conta de origem deve ser positivo')
    .optional()
    .nullable(),

  toAccountId: z.number()
    .int('ID da conta de destino deve ser um numero inteiro')
    .positive('ID da conta de destino deve ser positivo')
    .optional()
    .nullable(),

  categoryId: z.number()
    .int('ID da categoria deve ser um numero inteiro')
    .positive('ID da categoria deve ser positivo')
    .optional()
    .nullable(),

  endDate: z.coerce.date({
    errorMap: () => ({ message: 'Data final deve ser valida' })
  }).nullable().optional(),

  isActive: z.coerce.boolean().optional()
}).refine((data) => {
  return Object.keys(data).length > 0;
}, {
  message: 'Informe ao menos um campo para atualizar'
});

export const listFixedTransactionsSchema = z.object({
  includeInactive: z.coerce.boolean().optional().default(false),
  type: transactionTypeSchema.optional()
});

export const materializeFixedTransactionSchema = z.object({
  occurrenceDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de ocorrencia deve ser valida' })
  })
});

export type CreateFixedTransactionData = z.infer<typeof createFixedTransactionSchema>;
export type UpdateFixedTransactionData = z.infer<typeof updateFixedTransactionSchema>;
export type ListFixedTransactionsQuery = z.infer<typeof listFixedTransactionsSchema>;
export type MaterializeFixedTransactionData = z.infer<typeof materializeFixedTransactionSchema>;
