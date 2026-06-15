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
  selectedItems: z.array(
    z.object({
      itemId: z.string().min(1, 'ID do item selecionado e obrigatorio'),
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
    })
  )
    .min(1, 'Selecione ao menos um item para importar')
    .max(500, 'Quantidade maxima de itens excedida')
});

export type PreviewCreditCardReconciliationData = z.infer<typeof previewCreditCardReconciliationSchema>;
export type CommitCreditCardReconciliationData = z.infer<typeof commitCreditCardReconciliationSchema>;
