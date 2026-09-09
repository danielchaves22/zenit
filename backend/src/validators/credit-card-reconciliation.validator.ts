import { z } from 'zod';

const sourceTypeSchema = z.enum(['CAIXA_PDF', 'BRADESCO_CSV', 'NUBANK_CSV'], {
  errorMap: () => ({ message: 'Fonte de conciliacao invalida' })
});

const fileBase64Schema = z
  .string()
  .min(1, 'Arquivo da fatura e obrigatorio')
  .max(10_000_000, 'Arquivo da fatura excede o tamanho suportado');

const targetReferenceYearSchema = z.coerce.number()
  .int('Ano da fatura-alvo deve ser um numero inteiro')
  .min(2000, 'Ano da fatura-alvo invalido')
  .max(2200, 'Ano da fatura-alvo invalido');

const targetReferenceMonthSchema = z.coerce.number()
  .int('Mes da fatura-alvo deve ser um numero inteiro')
  .min(1, 'Mes da fatura-alvo invalido')
  .max(12, 'Mes da fatura-alvo invalido');

const sessionIdSchema = z.coerce.number()
  .int('ID da sessao deve ser um numero inteiro')
  .positive('ID da sessao deve ser positivo');

const expectedRevisionSchema = z.coerce.number()
  .int('Revisao esperada deve ser um numero inteiro')
  .positive('Revisao esperada deve ser positiva');

const selectedItemSchema = z.object({
  itemId: z.string().trim().min(1, 'ID do item selecionado e obrigatorio').max(64),
  action: z.enum(['IMPORT', 'LINK_FIXED']).optional().default('IMPORT'),
  description: z.string()
    .trim()
    .max(255, 'Descricao do lancamento deve ter no maximo 255 caracteres')
    .optional(),
  categoryId: z.coerce.number()
    .int('Categoria do lancamento deve ser um numero inteiro')
    .positive('Categoria do lancamento deve ser positiva')
    .optional()
}).superRefine((item, ctx) => {
  if ((item.action || 'IMPORT') !== 'IMPORT') {
    return;
  }

  if (!item.description?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['description'],
      message: 'Descricao do lancamento e obrigatoria'
    });
  }

  if (!item.categoryId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['categoryId'],
      message: 'Categoria do lancamento deve ser informada'
    });
  }
});

export const previewCreditCardReconciliationSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  sourceType: sourceTypeSchema,
  targetReferenceYear: targetReferenceYearSchema,
  targetReferenceMonth: targetReferenceMonthSchema,
  fileBase64: fileBase64Schema,
  fileName: z.string()
    .max(255, 'Nome do arquivo deve ter no maximo 255 caracteres')
    .optional()
    .nullable()
});

export const commitCreditCardReconciliationSchema = z.object({
  accountId: z.coerce.number()
    .int('ID da conta deve ser um numero inteiro')
    .positive('ID da conta deve ser positivo'),
  sourceType: sourceTypeSchema,
  targetReferenceYear: targetReferenceYearSchema,
  targetReferenceMonth: targetReferenceMonthSchema,
  fileBase64: fileBase64Schema,
  fileName: z.string()
    .max(255, 'Nome do arquivo deve ter no maximo 255 caracteres')
    .optional()
    .nullable(),
  selectedItems: z.array(selectedItemSchema)
    .min(1, 'Selecione ao menos um item para importar')
    .max(500, 'Quantidade maxima de itens excedida')
});

export const startCreditCardReconciliationSessionSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  sourceType: sourceTypeSchema,
  targetReferenceYear: targetReferenceYearSchema,
  targetReferenceMonth: targetReferenceMonthSchema,
  fileBase64: fileBase64Schema,
  fileName: z.string().trim().min(1, 'Nome do arquivo e obrigatorio').max(255),
  replace: z.boolean().optional().default(false),
  expectedSessionId: sessionIdSchema.optional(),
  expectedRevision: expectedRevisionSchema.optional()
}).superRefine((value, ctx) => {
  if (!value.replace) {
    return;
  }

  if (!value.expectedSessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedSessionId'],
      message: 'Informe a sessao esperada para substituir o arquivo'
    });
  }

  if (!value.expectedRevision) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expectedRevision'],
      message: 'Informe a revisao esperada para substituir o arquivo'
    });
  }
});

export const getCreditCardReconciliationSessionSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  referenceYear: targetReferenceYearSchema,
  referenceMonth: targetReferenceMonthSchema
});

export const commitCreditCardReconciliationSessionSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  sessionId: sessionIdSchema,
  expectedRevision: expectedRevisionSchema,
  selectedItems: z.array(selectedItemSchema)
    .min(1, 'Selecione ao menos um item para importar')
    .max(500, 'Quantidade maxima de itens excedida')
});

export const decideCreditCardReconciliationItemSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  sessionId: sessionIdSchema,
  itemId: z.string().trim().min(1).max(64),
  expectedRevision: expectedRevisionSchema,
  decision: z.enum(['CONFIRM_EXISTING', 'IGNORE', 'RESTORE']),
  transactionIds: z.array(z.coerce.number().int().positive()).max(50).optional()
}).superRefine((value, ctx) => {
  const transactionIds = value.transactionIds || [];
  if (value.decision === 'CONFIRM_EXISTING' && transactionIds.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['transactionIds'],
      message: 'Informe ao menos um lancamento existente para confirmar'
    });
  }

  if (new Set(transactionIds).size !== transactionIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['transactionIds'],
      message: 'Lancamentos repetidos nao sao permitidos'
    });
  }

  if (value.decision !== 'CONFIRM_EXISTING' && transactionIds.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['transactionIds'],
      message: 'Lancamentos so podem ser informados ao confirmar uma correspondencia'
    });
  }
});

export const updateCreditCardReconciliationSessionStatusSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  sessionId: sessionIdSchema,
  expectedRevision: expectedRevisionSchema,
  status: z.enum(['OPEN', 'COMPLETED'])
});

export const resetCreditCardReconciliationSessionSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  sessionId: sessionIdSchema,
  expectedRevision: expectedRevisionSchema,
  confirmed: z.literal(true)
});

export type PreviewCreditCardReconciliationData = z.infer<typeof previewCreditCardReconciliationSchema>;
export type CommitCreditCardReconciliationData = z.infer<typeof commitCreditCardReconciliationSchema>;
export type StartCreditCardReconciliationSessionData = z.infer<typeof startCreditCardReconciliationSessionSchema>;
export type CommitCreditCardReconciliationSessionData = z.infer<typeof commitCreditCardReconciliationSessionSchema>;
export type DecideCreditCardReconciliationItemData = z.infer<typeof decideCreditCardReconciliationItemSchema>;
