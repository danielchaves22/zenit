import { z } from 'zod';
import { CreditCardCreditKind } from '@prisma/client';

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

export const listCreditCardInvoicesSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  includePaid: booleanQuerySchema
    .optional()
    .default(true)
});

export const getCreditCardInvoiceSchema = z.object({
  id: z.coerce.number()
    .int('ID da fatura deve ser um numero inteiro')
    .positive('ID da fatura deve ser positivo')
});

export const listRefundableCreditCardPurchasesSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  search: z.string()
    .trim()
    .max(100, 'Busca deve ter no maximo 100 caracteres')
    .optional()
});

export const createCreditCardInvoiceCreditSchema = z.object({
  id: z.coerce.number()
    .int('ID da fatura deve ser um numero inteiro')
    .positive('ID da fatura deve ser positivo'),
  description: z.string()
    .trim()
    .min(1, 'Descricao e obrigatoria')
    .max(200, 'Descricao deve ter no maximo 200 caracteres'),
  amount: z.coerce.number()
    .positive('Valor do credito deve ser positivo'),
  date: z.coerce.date({
    errorMap: () => ({ message: 'Data do credito deve ser valida' })
  }),
  creditKind: z.nativeEnum(CreditCardCreditKind),
  refundOfTransactionId: z.coerce.number()
    .int('ID da compra deve ser um numero inteiro')
    .positive('ID da compra deve ser positivo')
    .nullish(),
  categoryId: z.coerce.number()
    .int('ID da categoria deve ser um numero inteiro')
    .positive('ID da categoria deve ser positivo')
    .nullish(),
  notes: z.string()
    .trim()
    .max(1000, 'Observacoes devem ter no maximo 1000 caracteres')
    .optional()
}).superRefine((value, context) => {
  if (value.creditKind === CreditCardCreditKind.REFUND && !value.refundOfTransactionId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['refundOfTransactionId'],
      message: 'Selecione a compra original do estorno'
    });
  }

  if (value.creditKind !== CreditCardCreditKind.REFUND && value.refundOfTransactionId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['refundOfTransactionId'],
      message: 'Somente estornos podem ser vinculados a uma compra'
    });
  }
});

export const getProjectedCreditCardInvoiceSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  projectionKey: z.string()
    .regex(/^\d{4}-\d{2}$/, 'Chave de projeção inválida')
});

export const creditCardFixedMaterializationSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  referenceYear: z.coerce.number()
    .int('Ano de referencia deve ser um numero inteiro')
    .min(1900, 'Ano de referencia invalido')
    .max(9999, 'Ano de referencia invalido'),
  referenceMonth: z.coerce.number()
    .int('Mes de referencia deve ser um numero inteiro')
    .min(1, 'Mes de referencia deve ser entre 1 e 12')
    .max(12, 'Mes de referencia deve ser entre 1 e 12')
});

export const payCreditCardInvoiceSchema = z.object({
  id: z.coerce.number()
    .int('ID da fatura deve ser um numero inteiro')
    .positive('ID da fatura deve ser positivo'),
  fromAccountId: z.number()
    .int('ID da conta pagadora deve ser um numero inteiro')
    .positive('ID da conta pagadora deve ser positivo'),
  amount: z.coerce.number()
    .positive('Valor do pagamento deve ser positivo')
    .optional(),
  paymentDate: z.coerce.date({
    errorMap: () => ({ message: 'Data de pagamento deve ser valida' })
  }).optional(),
  notes: z.string()
    .max(1000, 'Observacoes devem ter no maximo 1000 caracteres')
    .optional()
});

export const anticipateCreditCardInstallmentsSchema = z.object({
  id: z.coerce.number()
    .int('ID da fatura deve ser um numero inteiro')
    .positive('ID da fatura deve ser positivo'),
  transactionIds: z.array(
    z.coerce.number()
      .int('ID da parcela deve ser um numero inteiro')
      .positive('ID da parcela deve ser positivo')
  ).min(1, 'Selecione ao menos uma parcela para antecipar'),
  anticipatedAt: z.coerce.date({
    errorMap: () => ({ message: 'Data da antecipacao deve ser valida' })
  }).optional(),
  discountAmount: z.coerce.number()
    .min(0, 'Desconto da antecipacao nao pode ser negativo')
    .optional(),
  notes: z.string()
    .trim()
    .max(1000, 'Observacoes devem ter no maximo 1000 caracteres')
    .optional()
});

export const reopenCreditCardInvoiceSchema = z.object({
  id: z.coerce.number()
    .int('ID da fatura deve ser um numero inteiro')
    .positive('ID da fatura deve ser positivo')
});
