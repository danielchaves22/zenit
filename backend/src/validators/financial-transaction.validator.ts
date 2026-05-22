import { z } from 'zod';

const transactionTypeSchema = z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
  errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
});

const transactionStatusSchema = z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
  errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
});

const purchaseScopeSchema = z.enum(['SINGLE', 'FUTURE', 'PURCHASE'], {
  errorMap: () => ({ message: 'Escopo deve ser SINGLE, FUTURE ou PURCHASE' })
});

const transactionListDateFieldSchema = z.enum(['dueDate', 'date', 'effectiveDate', 'createdAt'], {
  errorMap: () => ({
    message: 'Campo de data deve ser: dueDate, date, effectiveDate ou createdAt'
  })
});

const transactionTypesFilterSchema = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : []))
    .map((item) => item.trim())
    .filter(Boolean);
}, z.array(transactionTypeSchema));

const accountIdsFilterSchema = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '' && item !== null && item !== undefined);
}, z.array(
  z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo')
));

const categoryIdsFilterSchema = z.preprocess((value) => {
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '' && item !== null && item !== undefined);
}, z.array(
  z.coerce.number()
    .int('ID da categoria deve ser um numero inteiro')
    .positive('ID da categoria deve ser positivo')
));

function parseDateFilterValue(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  return new Date(value);
}

const booleanQuerySchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean());

export const autocompleteQuerySchema = z.object({
  q: z.string()
    .min(3, 'Query deve ter pelo menos 3 caracteres')
    .max(100, 'Query deve ter no maximo 100 caracteres'),

  type: transactionTypeSchema,

  limit: z.coerce.number()
    .int('Limite deve ser um numero inteiro')
    .min(1, 'Limite deve ser pelo menos 1')
    .max(20, 'Limite deve ser no maximo 20')
    .optional()
});

export const createTransactionSchema = z
  .object({
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

    type: transactionTypeSchema,

    status: transactionStatusSchema.default('COMPLETED'),

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
      .default(0),

    installmentCount: z.coerce.number()
      .int('Parcelas deve ser um numero inteiro')
      .min(1, 'Parcelas deve ser no minimo 1')
      .max(120, 'Parcelas deve ser no maximo 120')
      .optional()
      .default(1)
  })
  .refine((data) => {
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
  })
  .refine((data) => !(data.repeatTimes > 0 && (data.installmentCount ?? 1) > 1), {
    message: 'Nao e possivel usar repeticao e parcelamento ao mesmo tempo',
    path: ['installmentCount']
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

  type: transactionTypeSchema.optional(),

  status: transactionStatusSchema.optional(),

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

  purchaseScope: purchaseScopeSchema.optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualizacao'
});

export const listTransactionsSchema = z.object({
  startDate: z.string({
    required_error: 'Data inicial e obrigatoria',
    invalid_type_error: 'Data inicial deve ser valida'
  }).min(1, 'Data inicial e obrigatoria')
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Data inicial deve ser valida'
    })
    .transform((value) => parseDateFilterValue(value)),

  endDate: z.string({
    required_error: 'Data final e obrigatoria',
    invalid_type_error: 'Data final deve ser valida'
  }).min(1, 'Data final e obrigatoria')
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: 'Data final deve ser valida'
    })
    .transform((value) => parseDateFilterValue(value)),

  dateField: transactionListDateFieldSchema
    .optional()
    .default('date'),

  includeCreditCardTransactions: booleanQuerySchema
    .optional()
    .default(true),

  includeVirtualFixed: booleanQuerySchema
    .optional()
    .default(true),

  type: transactionTypeSchema.optional(),

  types: transactionTypesFilterSchema.optional(),

  status: transactionStatusSchema.optional(),

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
}).refine((data) => data.endDate >= data.startDate, {
  message: 'Data final deve ser posterior a data inicial',
  path: ['endDate']
});

export const listCreditCardPurchasesSchema = z.object({
  accountIds: accountIdsFilterSchema.optional(),
  categoryIds: categoryIdsFilterSchema.optional(),

  page: z.coerce.number()
    .int('Pagina deve ser um numero inteiro')
    .min(1, 'Pagina deve ser pelo menos 1')
    .default(1),

  pageSize: z.coerce.number()
    .int('Tamanho da pagina deve ser um numero inteiro')
    .min(1, 'Tamanho da pagina deve ser pelo menos 1')
    .max(100, 'Tamanho da pagina deve ser no maximo 100')
    .default(20)
});

export const updateTransactionStatusSchema = z.object({
  status: transactionStatusSchema
});

export type AutocompleteQuery = z.infer<typeof autocompleteQuerySchema>;
export type CreateTransactionData = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionData = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsSchema>;
export type ListCreditCardPurchasesQuery = z.infer<typeof listCreditCardPurchasesSchema>;
export type UpdateTransactionStatus = z.infer<typeof updateTransactionStatusSchema>;
