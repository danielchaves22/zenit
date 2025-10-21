import { z } from 'zod';

// ============================================
// CREDIT CARD CONFIG VALIDATORS
// ============================================

export const createCreditCardConfigSchema = z.object({
  financialAccountId: z.number({ required_error: 'ID da conta é obrigatório' }),
  creditLimit: z.string().or(z.number())
    .transform(val => {
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? 0 : num;
    })
    .refine(val => val > 0, { message: 'Limite de crédito deve ser maior que zero' }),
  closingDay: z.number()
    .min(1, { message: 'Dia de fechamento deve ser entre 1 e 31' })
    .max(31, { message: 'Dia de fechamento deve ser entre 1 e 31' }),
  dueDay: z.number()
    .min(1, { message: 'Dia de vencimento deve ser entre 1 e 31' })
    .max(31, { message: 'Dia de vencimento deve ser entre 1 e 31' })
    .optional(),
  dueDaysAfterClosing: z.number().min(1).max(30).optional().default(10),
  annualFee: z.string().or(z.number()).optional().nullable()
    .transform(val => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? null : num;
    }),
  annualFeeMonthlyCharge: z.string().or(z.number()).optional().nullable()
    .transform(val => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? null : num;
    }),
  interestRate: z.string().or(z.number()).optional().nullable()
    .transform(val => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? null : num;
    }),
  latePaymentFee: z.string().or(z.number()).optional().nullable()
    .transform(val => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? null : num;
    }),
  minimumPaymentPercent: z.string().or(z.number()).optional().default(10)
    .transform(val => {
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? 10 : num;
    }),
  alertLimitPercent: z.string().or(z.number()).optional().default(80)
    .transform(val => {
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? 80 : num;
    }),
  enableLimitAlerts: z.boolean().optional().default(true),
  enableDueAlerts: z.boolean().optional().default(true),
  dueDaysBeforeAlert: z.number().min(0).max(15).optional().default(3)
});

export const updateCreditCardConfigSchema = z.object({
  creditLimit: z.string().or(z.number()).optional()
    .transform(val => {
      if (val === undefined) return undefined;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? undefined : num;
    }),
  closingDay: z.number().min(1).max(31).optional(),
  dueDay: z.number().min(1).max(31).optional(),
  dueDaysAfterClosing: z.number().min(1).max(30).optional(),
  annualFee: z.string().or(z.number()).optional().nullable()
    .transform(val => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? null : num;
    }),
  annualFeeMonthlyCharge: z.string().or(z.number()).optional().nullable()
    .transform(val => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? null : num;
    }),
  interestRate: z.string().or(z.number()).optional().nullable()
    .transform(val => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? null : num;
    }),
  latePaymentFee: z.string().or(z.number()).optional().nullable()
    .transform(val => {
      if (val === null || val === undefined) return null;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? null : num;
    }),
  minimumPaymentPercent: z.string().or(z.number()).optional()
    .transform(val => {
      if (val === undefined) return undefined;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? undefined : num;
    }),
  alertLimitPercent: z.string().or(z.number()).optional()
    .transform(val => {
      if (val === undefined) return undefined;
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? undefined : num;
    }),
  enableLimitAlerts: z.boolean().optional(),
  enableDueAlerts: z.boolean().optional(),
  dueDaysBeforeAlert: z.number().min(0).max(15).optional(),
  isActive: z.boolean().optional()
}).refine(data => Object.keys(data).filter(k => data[k as keyof typeof data] !== undefined).length > 0, {
  message: 'Pelo menos um campo deve ser fornecido para atualização'
});

// ============================================
// INVOICE VALIDATORS
// ============================================

export const generateInvoiceSchema = z.object({
  referenceMonth: z.number()
    .min(1, { message: 'Mês deve ser entre 1 e 12' })
    .max(12, { message: 'Mês deve ser entre 1 e 12' }),
  referenceYear: z.number()
    .min(2000, { message: 'Ano inválido' })
    .max(2100, { message: 'Ano inválido' })
});

export const listInvoicesSchema = z.object({
  status: z.enum(['OPEN', 'CLOSED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELED']).optional(),
  limit: z.string().optional().transform(val => {
    if (!val) return undefined;
    const num = parseInt(val, 10);
    return isNaN(num) ? undefined : num;
  }),
  offset: z.string().optional().transform(val => {
    if (!val) return undefined;
    const num = parseInt(val, 10);
    return isNaN(num) ? undefined : num;
  })
});

export const addTransactionToInvoiceSchema = z.object({
  transactionId: z.number({ required_error: 'ID da transação é obrigatório' }),
  installmentId: z.number().optional()
});

// ============================================
// INSTALLMENT VALIDATORS
// ============================================

export const createInstallmentPurchaseSchema = z.object({
  description: z.string().min(3, { message: 'Descrição deve ter pelo menos 3 caracteres' }),
  totalAmount: z.string().or(z.number())
    .transform(val => {
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? 0 : num;
    })
    .refine(val => val > 0, { message: 'Valor total deve ser maior que zero' }),
  numberOfInstallments: z.number()
    .min(2, { message: 'Número de parcelas deve ser entre 2 e 48' })
    .max(48, { message: 'Número de parcelas deve ser entre 2 e 48' }),
  purchaseDate: z.string().or(z.date())
    .transform(val => {
      if (val instanceof Date) return val;
      const date = new Date(val);
      return isNaN(date.getTime()) ? new Date() : date;
    }),
  categoryId: z.number().optional()
});

// ============================================
// PAYMENT VALIDATORS
// ============================================

export const payInvoiceFullSchema = z.object({
  fromAccountId: z.number({ required_error: 'Conta de origem é obrigatória' }),
  paymentDate: z.string().or(z.date())
    .transform(val => {
      if (val instanceof Date) return val;
      const date = new Date(val);
      return isNaN(date.getTime()) ? new Date() : date;
    }),
  notes: z.string().optional()
});

export const payInvoiceMinimumSchema = z.object({
  fromAccountId: z.number({ required_error: 'Conta de origem é obrigatória' }),
  paymentDate: z.string().or(z.date())
    .transform(val => {
      if (val instanceof Date) return val;
      const date = new Date(val);
      return isNaN(date.getTime()) ? new Date() : date;
    }),
  notes: z.string().optional()
});

export const payInvoicePartialSchema = z.object({
  amount: z.string().or(z.number())
    .transform(val => {
      const num = typeof val === 'string' ? Number(val.replace(/[^\d.-]/g, '')) : val;
      return isNaN(num) ? 0 : num;
    })
    .refine(val => val > 0, { message: 'Valor de pagamento deve ser maior que zero' }),
  fromAccountId: z.number({ required_error: 'Conta de origem é obrigatória' }),
  paymentDate: z.string().or(z.date())
    .transform(val => {
      if (val instanceof Date) return val;
      const date = new Date(val);
      return isNaN(date.getTime()) ? new Date() : date;
    }),
  notes: z.string().optional()
});

export const paymentHistorySchema = z.object({
  startDate: z.string().optional().transform(val => {
    if (!val) return undefined;
    const date = new Date(val);
    return isNaN(date.getTime()) ? undefined : date;
  }),
  endDate: z.string().optional().transform(val => {
    if (!val) return undefined;
    const date = new Date(val);
    return isNaN(date.getTime()) ? undefined : date;
  }),
  limit: z.string().optional().transform(val => {
    if (!val) return undefined;
    const num = parseInt(val, 10);
    return isNaN(num) ? undefined : num;
  })
});

// ============================================
// TYPES
// ============================================

export type CreateCreditCardConfigData = z.infer<typeof createCreditCardConfigSchema>;
export type UpdateCreditCardConfigData = z.infer<typeof updateCreditCardConfigSchema>;
export type GenerateInvoiceData = z.infer<typeof generateInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesSchema>;
export type AddTransactionToInvoiceData = z.infer<typeof addTransactionToInvoiceSchema>;
export type CreateInstallmentPurchaseData = z.infer<typeof createInstallmentPurchaseSchema>;
export type PayInvoiceFullData = z.infer<typeof payInvoiceFullSchema>;
export type PayInvoiceMinimumData = z.infer<typeof payInvoiceMinimumSchema>;
export type PayInvoicePartialData = z.infer<typeof payInvoicePartialSchema>;
export type PaymentHistoryQuery = z.infer<typeof paymentHistorySchema>;
