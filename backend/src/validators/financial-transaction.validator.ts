// backend/src/validators/financial-transaction.validator.ts - CORRIGIDO COM ZOD
import { z } from 'zod';

// ✅ SCHEMA PARA AUTOCOMPLETE COM TIPO OBRIGATÓRIO (ZOD)
export const autocompleteQuerySchema = z.object({
  q: z.string()
    .min(3, 'Query deve ter pelo menos 3 caracteres')
    .max(100, 'Query deve ter no máximo 100 caracteres'),
  
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
  }),
  
  limit: z.coerce.number()
    .int('Limite deve ser um número inteiro')
    .min(1, 'Limite deve ser pelo menos 1')
    .max(20, 'Limite deve ser no máximo 20')
    .optional()
});

export const createTransactionSchema = z.object({
  description: z.string()
    .min(1, 'Descrição é obrigatória')
    .max(255, 'Descrição deve ter no máximo 255 caracteres'),
  
  amount: z.number()
    .positive('Valor deve ser positivo'),
  
  date: z.coerce.date({
    errorMap: () => ({ message: 'Data deve ser válida' })
  }),

  dueDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de vencimento deve ser válida' })
  }).nullable().optional(),

  effectiveDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de efetivação deve ser válida' })
  }).nullable().optional(),
  
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
  }),
  
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
  }).default('COMPLETED'),
  
  notes: z.string()
    .max(1000, 'Observações devem ter no máximo 1000 caracteres')
    .optional(),
  
  fromAccountId: z.number()
    .int('ID da conta de origem deve ser um número inteiro')
    .positive('ID da conta de origem deve ser positivo')
    .optional()
    .nullable(),
  
  toAccountId: z.number()
    .int('ID da conta de destino deve ser um número inteiro')
    .positive('ID da conta de destino deve ser positivo')
    .optional()
    .nullable(),
  
  categoryId: z.number()
    .int('ID da categoria deve ser um número inteiro')
    .positive('ID da categoria deve ser positivo')
    .optional()
    .nullable(),
  
  tags: z.array(
    z.string().max(50, 'Cada tag deve ter no máximo 50 caracteres')
  ).max(10, 'Máximo 10 tags permitidas').optional(),
  repeatTimes: z.coerce.number()
    .int('Número de repetições deve ser um inteiro')
    .min(1, 'Número de repetições deve ser pelo menos 1')
    .max(36, 'Número de repetições deve ser no máximo 36')
    .optional()
}).refine((data) => {
  // Validação customizada baseada no tipo
  if (data.type === 'INCOME' && !data.toAccountId) {
    return false;
  }
  
  if (data.type === 'EXPENSE' && !data.fromAccountId) {
    return false;
  }
  
  if (data.type === 'TRANSFER') {
    if (!data.fromAccountId || !data.toAccountId) {
      return false;
    }
    if (data.fromAccountId === data.toAccountId) {
      return false;
    }
  }
  
  return true;
}, {
  message: 'Configuração de contas inválida para o tipo de transação',
  path: ['type'] // Associa o erro ao campo type
});

export const updateTransactionSchema = z.object({
  description: z.string()
    .min(1, 'Descrição não pode estar vazia')
    .max(255, 'Descrição deve ter no máximo 255 caracteres')
    .optional(),
  
  amount: z.number()
    .positive('Valor deve ser positivo')
    .optional(),
  
  date: z.coerce.date({
    errorMap: () => ({ message: 'Data deve ser válida' })
  }).optional(),

  dueDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de vencimento deve ser válida' })
  }).nullable().optional(),

  effectiveDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de efetivação deve ser válida' })
  }).nullable().optional(),

  
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
  }).optional(),
  
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
  }).optional(),
  
  notes: z.string()
    .max(1000, 'Observações devem ter no máximo 1000 caracteres')
    .optional(),
  
  fromAccountId: z.number()
    .int('ID da conta de origem deve ser um número inteiro')
    .positive('ID da conta de origem deve ser positivo')
    .optional()
    .nullable(),
  
  toAccountId: z.number()
    .int('ID da conta de destino deve ser um número inteiro')
    .positive('ID da conta de destino deve ser positivo')
    .optional()
    .nullable(),
  
  categoryId: z.number()
    .int('ID da categoria deve ser um número inteiro')
    .positive('ID da categoria deve ser positivo')
    .optional()
    .nullable(),
  
  tags: z.array(
    z.string().max(50, 'Cada tag deve ter no máximo 50 caracteres')
  ).max(10, 'Máximo 10 tags permitidas').optional()
});

export const listTransactionsSchema = z.object({
  startDate: z.coerce.date({
    errorMap: () => ({ message: 'Data inicial deve ser válida' })
  }).optional(),
  
  endDate: z.coerce.date({
    errorMap: () => ({ message: 'Data final deve ser válida' })
  }).optional(),
  
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER'], {
    errorMap: () => ({ message: 'Tipo deve ser: INCOME, EXPENSE ou TRANSFER' })
  }).optional(),
  
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
  }).optional(),
  
  accountId: z.coerce.number()
    .int('ID da conta deve ser um número inteiro')
    .positive('ID da conta deve ser positivo')
    .optional(),
  
  categoryId: z.coerce.number()
    .int('ID da categoria deve ser um número inteiro')
    .positive('ID da categoria deve ser positivo')
    .optional(),
  
  search: z.string()
    .max(100, 'Termo de busca deve ter no máximo 100 caracteres')
    .optional(),
  
  page: z.coerce.number()
    .int('Página deve ser um número inteiro')
    .min(1, 'Página deve ser pelo menos 1')
    .default(1),
  
  pageSize: z.coerce.number()
    .int('Tamanho da página deve ser um número inteiro')
    .min(1, 'Tamanho da página deve ser pelo menos 1')
    .max(100, 'Tamanho da página deve ser no máximo 100')
    .default(20)
}).refine((data) => {
  // Validação para garantir que endDate >= startDate
  if (data.startDate && data.endDate) {
    return data.endDate >= data.startDate;
  }
  return true;
}, {
  message: 'Data final deve ser posterior à data inicial',
  path: ['endDate']
});

export const updateTransactionStatusSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELED'], {
    errorMap: () => ({ message: 'Status deve ser: PENDING, COMPLETED ou CANCELED' })
  })
});

// Tipos TypeScript derivados dos schemas (para usar nos controllers)
export type AutocompleteQuery = z.infer<typeof autocompleteQuerySchema>;
export type CreateTransactionData = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionData = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsSchema>;
export type UpdateTransactionStatus = z.infer<typeof updateTransactionStatusSchema>;