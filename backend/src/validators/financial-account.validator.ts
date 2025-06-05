import { z } from 'zod';

// Schema para criar conta financeira
export const createAccountSchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH'], {
    errorMap: () => ({ message: 'Tipo inválido de conta financeira' })
  }),
  initialBalance: z.string().or(z.number()).optional().default('0')
    .transform(val => {
      if (typeof val === 'string' && val.trim() === '') return 0;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? 0 : num;
    }),
  accountNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  allowNegativeBalance: z.boolean().optional().default(false), // ✅ NOVO CAMPO
}).refine((data) => {
  // ✅ REGRA DE NEGÓCIO: Cartão de crédito tradicionalmente permite negativo
  if (data.type === 'CREDIT_CARD' && data.allowNegativeBalance === false) {
    // Não é erro, mas vamos setar como true automaticamente
    data.allowNegativeBalance = true;
  }
  return true;
});

export const updateAccountSchema = z.object({
  name: z.string().min(2, { message: 'Nome deve ter pelo menos 2 caracteres' }).optional(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH']).optional(),
  accountNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  allowNegativeBalance: z.boolean().optional(), // ✅ NOVO CAMPO
}).refine(data => Object.keys(data).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualização'
}).refine((data) => {
  // ✅ REGRA DE NEGÓCIO: Cartão de crédito deve permitir negativo
  if (data.type === 'CREDIT_CARD' && data.allowNegativeBalance === false) {
    throw new Error('Cartões de crédito devem permitir saldo negativo');
  }
  return true;
});

// Schema para filtros na listagem de contas
export const listAccountsSchema = z.object({
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'INVESTMENT', 'CASH']).optional(),
  isActive: z.string().optional().transform(val => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }),
  allowNegativeBalance: z.string().optional().transform(val => { // ✅ NOVO FILTRO
    if (val === 'true') return true;
    if (val === 'false') return false;
    return undefined;
  }),
  search: z.string().optional(),
});

// ✅ SCHEMA ESPECÍFICO PARA TOGGLE DE SALDO NEGATIVO
export const toggleNegativeBalanceSchema = z.object({
  allowNegativeBalance: z.boolean({
    required_error: 'allowNegativeBalance é obrigatório',
    invalid_type_error: 'allowNegativeBalance deve ser true ou false'
  })
}).refine((data) => {
  // Aqui podemos adicionar validações específicas se necessário
  return true;
});

// Tipos TypeScript derivados
export type CreateAccountData = z.infer<typeof createAccountSchema>;
export type UpdateAccountData = z.infer<typeof updateAccountSchema>;
export type ListAccountsQuery = z.infer<typeof listAccountsSchema>;
export type ToggleNegativeBalanceData = z.infer<typeof toggleNegativeBalanceSchema>;