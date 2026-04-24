import { z } from 'zod';

export const autocompleteQuerySchema = z.object({
  q: z.string()
    .min(3, 'Query deve ter pelo menos 3 caracteres')
    .max(100, 'Query deve ter no maximo 100 caracteres'),

  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
  }),

  limit: z.coerce.number()
    .int('Limite deve ser um numero inteiro')
    .min(1, 'Limite deve ser pelo menos 1')
    .max(20, 'Limite deve ser no maximo 20')
    .optional()
});

export const createTransactionSchema = z.object({
  description: z.string()
    .min(1, 'Descricao e obrigatoria')
    .max(255, 'Descricao deve ter no maximo 255 caracteres'),

  amount: z.number()
    .positive('Valor deve ser positivo'),

  date: z.coerce.date({
    errorMap: () => ({ message: 'Data deve ser valida' })
  }),

  dueDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de vencimento deve ser valida' })
  }).nullable().optional(),

  effectiveDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de efetivacao deve ser valida' })
  }).nullable().optional(),

  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
  }),

  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
  }).default('COMPLETED'),

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

  tags: z.array(
    z.string().max(50, 'Cada tag deve ter no maximo 50 caracteres')
  ).max(10, 'Maximo 10 tags permitidas').optional(),

  repeatTimes: z.coerce.number()
    .int('Repeticoes deve ser um numero inteiro')
    .min(0, 'Repeticoes deve ser no minimo 0')
    .default(1)
}).refine((data) => {
  if (data.type === 'INCOME' && !data.toAccountId) return false;
  if (data.type === 'EXPENSE' && !data.fromAccountId) return false;

  if (data.type === 'TRANSFER') {
    if (!data.fromAccountId || !data.toAccountId) return false;
    if (data.fromAccountId === data.toAccountId) return false;
  }

  return true;
}, {
  message: 'Configuracao de contas invalida para o tipo de transacao',
  path: ['type']
});

export const updateTransactionSchema = z.object({
  description: z.string()
    .min(1, 'Descricao nao pode estar vazia')
    .max(255, 'Descricao deve ter no maximo 255 caracteres')
    .optional(),

  amount: z.number()
    .positive('Valor deve ser positivo')
    .optional(),

  date: z.coerce.date({
    errorMap: () => ({ message: 'Data deve ser valida' })
  }).optional(),

  dueDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de vencimento deve ser valida' })
  }).nullable().optional(),

  effectiveDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de efetivacao deve ser valida' })
  }).nullable().optional(),

  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
  }).optional(),

  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
  }).optional(),

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

  tags: z.array(
    z.string().max(50, 'Cada tag deve ter no maximo 50 caracteres')
  ).max(10, 'Maximo 10 tags permitidas').optional()
});

export const listTransactionsSchema = z.object({
  startDate: z.string({
    required_error: 'Data inicial e obrigatoria',
    invalid_type_error: 'Data inicial deve ser valida'
  }).min(1, 'Data inicial e obrigatoria')
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Data inicial deve ser valida'
    })
    .transform((value) => new Date(value)),

  endDate: z.string({
    required_error: 'Data final e obrigatoria',
    invalid_type_error: 'Data final deve ser valida'
  }).min(1, 'Data final e obrigatoria')
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Data final deve ser valida'
    })
    .transform((value) => new Date(value)),

  includeVirtualFixed: z.coerce.boolean()
    .optional()
    .default(true),

  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
  }).optional(),

  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
  }).optional(),

  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo')
    .optional(),

  categoryId: z.coerce.number()
    .int('ID da categoria deve ser um numero inteiro')
    .positive('ID da categoria deve ser positivo')
    .optional(),

  search: z.string()
    .max(100, 'Termo de busca deve ter no maximo 100 caracteres')
    .optional(),

  page: z.coerce.number()
    .int('Pagina deve ser um numero inteiro')
    .min(1, 'Pagina deve ser pelo menos 1')
    .default(1),

  pageSize: z.coerce.number()
    .int('Tamanho da pagina deve ser um numero inteiro')
    .min(1, 'Tamanho da pagina deve ser pelo menos 1')
    .max(100, 'Tamanho da pagina deve ser no maximo 100')
    .default(20)
}).refine((data) => {
  return data.endDate >= data.startDate;
}, {
  message: 'Data final deve ser posterior a data inicial',
  path: ['endDate']
});

export const updateTransactionStatusSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
  })
});

export type AutocompleteQuery = z.infer<typeof autocompleteQuerySchema>;
export type CreateTransactionData = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionData = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsSchema>;
export type UpdateTransactionStatus = z.infer<typeof updateTransactionStatusSchema>;
