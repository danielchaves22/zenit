import {
  getInvoiceDisplayStatus,
  getInvoiceDisplayStatusLabel,
  getInvoiceReferenceLabel,
  getInvoiceSettlementLabel
} from '@/utils/creditCards';
import { formatCalendarDate } from '@/utils/financialStatus';
import { formatTransactionDescription } from '@/utils/transactions';
import { buildCsvDocument, formatCsvAmount } from '@/utils/csv';

interface CreditCardInvoiceCsvPaymentTransaction {
  amount: string;
  effectiveDate?: string | null;
  date?: string | null;
  fromAccount?: {
    name: string;
  } | null;
}

interface CreditCardInvoiceCsvTransaction {
  id: number | null;
  description: string;
  amount: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  date?: string | null;
  dueDate?: string | null;
  isExternalCreditCardSettlement?: boolean;
  isProjected?: boolean;
  isFixedProjection?: boolean;
  fixedTemplateId?: number | null;
  category?: {
    name: string;
  } | null;
}

interface CreditCardInvoiceCsvInvoice {
  referenceYear: number;
  referenceMonth: number;
  closingDate: string;
  dueDate: string;
  totalAmount: string;
  status: string;
  itemCount: number;
  fixedItemCount?: number;
  itemsSubtotal?: string;
  fixedSubtotal?: string;
  isProjected?: boolean;
  hasProjectedTransactions?: boolean;
  settlementType?: string | null;
  settledAt?: string | null;
  externalSettledAmount?: string;
  hasExternalSettlements?: boolean;
  paymentTransaction?: CreditCardInvoiceCsvPaymentTransaction | null;
  account: {
    name: string;
  };
  transactions: CreditCardInvoiceCsvTransaction[];
}

export interface CreditCardInvoiceCsvInput {
  cardName: string;
  invoice: CreditCardInvoiceCsvInvoice;
}

type ReconciliationItemStatus = 'OK' | 'SIMILAR' | 'PENDING' | 'NOT_IMPORTABLE';
type ReconciliationReason =
  | 'EXACT'
  | 'AMBIGUOUS_EXACT'
  | 'INVOICE_DIVERGENCE'
  | 'DATE_DIVERGENCE'
  | 'INSTALLMENT_DIVERGENCE'
  | 'NON_IMPORTABLE'
  | 'NO_MATCH';
type ReconciliationSuggestionSource = 'RULE' | 'HISTORY' | 'AI';

interface CreditCardReconciliationCsvCategorySuggestion {
  categoryId: number | null;
  categoryName: string | null;
  source: ReconciliationSuggestionSource | null;
  reason: string | null;
}

interface CreditCardReconciliationCsvMatchedTransaction {
  matchKey: string;
  matchSource: 'TRANSACTION' | 'PROJECTED_FIXED';
  id: number | null;
  fixedTemplateId: number | null;
  description: string;
  amount: string;
  date: string;
  installmentNumber: number | null;
  totalInstallments: number | null;
  invoiceReference: string | null;
}

interface CreditCardReconciliationCsvItem {
  id: string;
  sequence: number;
  status: ReconciliationItemStatus;
  reason: ReconciliationReason;
  kind: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  signedAmount: string;
  purchaseDate: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  sourceDescription: string;
  sourceSection: string;
  cardSuffix: string | null;
  canImport: boolean;
  nonImportableReason: string | null;
  categorySuggestion: CreditCardReconciliationCsvCategorySuggestion;
  matchedTransactions: CreditCardReconciliationCsvMatchedTransaction[];
}

interface CreditCardReconciliationCsvPreview {
  statement: {
    sourceType: string;
    fileName: string | null;
    dueDate: string;
    totalAmount: string;
    parsedNetAmount: string;
    referenceYear: number;
    referenceMonth: number;
  };
  summary: {
    totalItems: number;
    okCount: number;
    similarCount: number;
    pendingCount: number;
    notImportableCount: number;
    importableCount: number;
    importableAmount: string;
    okAmount: string;
    similarAmount: string;
    pendingAmount: string;
    notImportableAmount: string;
  };
}

interface CreditCardReconciliationCsvDraft {
  description: string;
  categoryId: string;
}

interface CreditCardReconciliationCsvCategoryOption {
  id: number | string;
  name: string;
}

interface CreditCardReconciliationCsvTargetInvoice {
  referenceYear: number;
  referenceMonth: number;
  dueDate: string;
  status: string;
  isProjected: boolean;
}

export interface CreditCardReconciliationCsvInput {
  cardName: string;
  sourceLabel: string;
  statusFilterLabel: string;
  fileName: string | null;
  preview: CreditCardReconciliationCsvPreview;
  items: CreditCardReconciliationCsvItem[];
  itemDrafts: Record<string, CreditCardReconciliationCsvDraft>;
  selectedItemIds: string[];
  categories: CreditCardReconciliationCsvCategoryOption[];
  targetInvoice: CreditCardReconciliationCsvTargetInvoice | null;
}

function formatOptionalCalendarDate(value?: string | null) {
  if (!value) {
    return '';
  }

  return formatCalendarDate(value);
}

function formatInstallmentLabel(
  installmentNumber?: number | null,
  totalInstallments?: number | null
) {
  if (!installmentNumber || !totalInstallments) {
    return '';
  }

  return `${installmentNumber}/${totalInstallments}`;
}

function buildInvoiceTransactionTypeLabel(transaction: CreditCardInvoiceCsvTransaction) {
  if (transaction.isFixedProjection) {
    return 'Fixa projetada';
  }

  if (transaction.isProjected) {
    return 'Projetada';
  }

  if (transaction.isExternalCreditCardSettlement) {
    return 'Historico externo';
  }

  return 'Compra';
}

function buildInvoiceTransactionNotes(transaction: CreditCardInvoiceCsvTransaction) {
  const notes: string[] = [];

  if (transaction.isExternalCreditCardSettlement) {
    notes.push('Liquidada fora do sistema');
  }

  if (transaction.isFixedProjection) {
    notes.push('Fixa');
  }

  if (transaction.isProjected) {
    notes.push('Projetada');
  }

  return notes.join(' | ');
}

function formatInvoiceStatusLabel(status: string, dueDate?: string | null) {
  return getInvoiceDisplayStatusLabel(getInvoiceDisplayStatus(status, dueDate));
}

function formatBooleanLabel(value?: boolean | null) {
  return value ? 'Sim' : 'Nao';
}

function getReconciliationStatusLabel(status: ReconciliationItemStatus) {
  if (status === 'OK') return 'OK';
  if (status === 'SIMILAR') return 'Similar';
  if (status === 'PENDING') return 'Pendente';
  return 'Nao importavel';
}

function getReconciliationReasonLabel(item: CreditCardReconciliationCsvItem) {
  const hasProjectedFixedMatch = item.matchedTransactions.some(
    (transaction) => transaction.matchSource === 'PROJECTED_FIXED'
  );

  switch (item.reason) {
    case 'EXACT':
      return hasProjectedFixedMatch
        ? 'Fixa projetada equivalente ja encontrada para esta fatura.'
        : 'Lancamento ja encontrado.';
    case 'AMBIGUOUS_EXACT':
      return hasProjectedFixedMatch
        ? 'Ha mais de uma correspondencia equivalente, incluindo fixas projetadas.'
        : 'Mais de um lancamento ja bate exatamente.';
    case 'INVOICE_DIVERGENCE':
      return 'Mesmo valor, data e parcela, mas vinculado a outra fatura.';
    case 'DATE_DIVERGENCE':
      return hasProjectedFixedMatch
        ? 'Existe fixa projetada com mesmo valor nesta fatura; revise a data.'
        : 'Mesmo valor e parcela, com divergencia de data.';
    case 'INSTALLMENT_DIVERGENCE':
      return 'Mesmo valor, com divergencia de parcelamento.';
    case 'NON_IMPORTABLE':
      return 'Linha apenas informativa para esta rotina.';
    default:
      return 'Ainda nao ha lancamento equivalente no cartao.';
  }
}

function getReconciliationSectionLabel(section: string) {
  switch (section) {
    case 'PURCHASES':
      return 'Compras';
    case 'INSTALLMENTS':
      return 'Compras parceladas';
    case 'ANNUITY':
      return 'Anuidade';
    case 'OTHER':
      return 'Outros';
    default:
      return 'Demonstrativo';
  }
}

function getReconciliationSuggestionSourceLabel(
  source: ReconciliationSuggestionSource | null
) {
  if (source === 'RULE') return 'Regra';
  if (source === 'HISTORY') return 'Historico';
  if (source === 'AI') return 'IA';
  return '';
}

function getDirectionLabel(direction: 'DEBIT' | 'CREDIT') {
  return direction === 'DEBIT' ? 'Debito' : 'Credito';
}

function buildMatchedTransactionDetails(
  transactions: CreditCardReconciliationCsvMatchedTransaction[]
) {
  return transactions
    .map((transaction) => {
      const matchLabel =
        transaction.matchSource === 'PROJECTED_FIXED' ? 'Fixa projetada' : 'Lancamento';
      const details = [
        matchLabel,
        transaction.description,
        formatCsvAmount(transaction.amount),
        formatOptionalCalendarDate(transaction.date),
        formatInstallmentLabel(
          transaction.installmentNumber,
          transaction.totalInstallments
        ),
        transaction.invoiceReference ? `fatura ${transaction.invoiceReference}` : '',
        transaction.id ? `id ${transaction.id}` : '',
        transaction.fixedTemplateId ? `fixa ${transaction.fixedTemplateId}` : ''
      ].filter(Boolean);

      return details.join(' | ');
    })
    .join(' || ');
}

export function buildCreditCardInvoiceCsv({
  cardName,
  invoice
}: CreditCardInvoiceCsvInput) {
  const paymentDate =
    invoice.paymentTransaction?.effectiveDate ||
    invoice.paymentTransaction?.date ||
    invoice.settledAt ||
    null;
  const settlementLabel = getInvoiceSettlementLabel(invoice.settlementType);

  return buildCsvDocument({
    metadataRows: [
      ['Cartao', cardName],
      ['Referencia', getInvoiceReferenceLabel(invoice.referenceYear, invoice.referenceMonth)],
      ['Status', formatInvoiceStatusLabel(invoice.status, invoice.dueDate)],
      ['Conta', invoice.account.name],
      ['Fechamento', formatOptionalCalendarDate(invoice.closingDate)],
      ['Vencimento', formatOptionalCalendarDate(invoice.dueDate)],
      ['Valor_total', formatCsvAmount(invoice.totalAmount)],
      ['Subtotal_itens', formatCsvAmount(invoice.itemsSubtotal || 0)],
      ['Subtotal_fixas', formatCsvAmount(invoice.fixedSubtotal || 0)],
      ['Quantidade_itens', invoice.itemCount],
      ['Quantidade_fixas', invoice.fixedItemCount || 0],
      ['Fatura_projetada', formatBooleanLabel(invoice.isProjected)],
      ['Com_fixas_projetadas', formatBooleanLabel(invoice.hasProjectedTransactions)],
      ['Liquidacao', settlementLabel || 'Em aberto'],
      ['Data_liquidacao', formatOptionalCalendarDate(paymentDate)],
      [
        'Conta_pagadora',
        invoice.paymentTransaction?.fromAccount?.name || ''
      ],
      [
        'Valor_pago',
        invoice.paymentTransaction ? formatCsvAmount(invoice.paymentTransaction.amount) : ''
      ],
      [
        'Liquidado_fora',
        invoice.hasExternalSettlements
          ? formatCsvAmount(invoice.externalSettledAmount || 0)
          : ''
      ]
    ],
    columns: [
      {
        header: 'Descricao',
        getValue: (transaction) =>
          formatTransactionDescription(
            transaction.description,
            transaction.installmentNumber,
            transaction.totalInstallments
          )
      },
      {
        header: 'Categoria',
        getValue: (transaction) => transaction.category?.name || ''
      },
      {
        header: 'Parcela',
        getValue: (transaction) =>
          formatInstallmentLabel(
            transaction.installmentNumber,
            transaction.totalInstallments
          )
      },
      {
        header: 'Valor',
        getValue: (transaction) => formatCsvAmount(transaction.amount)
      },
      {
        header: 'Data_compra',
        getValue: (transaction) => formatOptionalCalendarDate(transaction.date)
      },
      {
        header: 'Data_vencimento',
        getValue: (transaction) => formatOptionalCalendarDate(transaction.dueDate)
      },
      {
        header: 'Lancamento_id',
        getValue: (transaction) => transaction.id ?? ''
      },
      {
        header: 'Tipo',
        getValue: (transaction) => buildInvoiceTransactionTypeLabel(transaction)
      },
      {
        header: 'Observacoes',
        getValue: (transaction) => buildInvoiceTransactionNotes(transaction)
      }
    ],
    rows: invoice.transactions
  });
}

export function buildCreditCardReconciliationCsv({
  cardName,
  sourceLabel,
  statusFilterLabel,
  fileName,
  preview,
  items,
  itemDrafts,
  selectedItemIds,
  categories,
  targetInvoice
}: CreditCardReconciliationCsvInput) {
  const selectedItemSet = new Set(selectedItemIds);
  const categoriesById = new Map(
    categories.map((category) => [String(category.id), category.name])
  );
  const targetInvoiceStatusLabel = targetInvoice
    ? formatInvoiceStatusLabel(targetInvoice.status, targetInvoice.dueDate)
    : '';
  const targetInvoiceLabel = targetInvoice
    ? `${getInvoiceReferenceLabel(targetInvoice.referenceYear, targetInvoice.referenceMonth)} (${targetInvoiceStatusLabel}${targetInvoice.isProjected ? ', projetada' : ''})`
    : '';

  return buildCsvDocument({
    metadataRows: [
      ['Cartao', cardName],
      ['Fonte', sourceLabel],
      ['Arquivo', fileName || preview.statement.fileName || ''],
      ['Filtro', statusFilterLabel],
      [
        'Referencia_detectada',
        getInvoiceReferenceLabel(
          preview.statement.referenceYear,
          preview.statement.referenceMonth
        )
      ],
      ['Fatura_alvo', targetInvoiceLabel],
      ['Vencimento_fatura_alvo', formatOptionalCalendarDate(targetInvoice?.dueDate)],
      ['Data_fatura', formatOptionalCalendarDate(preview.statement.dueDate)],
      ['Total_arquivo', formatCsvAmount(preview.statement.totalAmount)],
      ['Liquido_calculado', formatCsvAmount(preview.statement.parsedNetAmount)],
      ['Itens_exportados', items.length],
      ['Itens_total_previa', preview.summary.totalItems],
      ['Ja_conciliados', preview.summary.okCount],
      ['Similares', preview.summary.similarCount],
      ['Pendentes', preview.summary.pendingCount],
      ['Nao_importaveis', preview.summary.notImportableCount],
      ['Importaveis', preview.summary.importableCount],
      ['Valor_importavel', formatCsvAmount(preview.summary.importableAmount)]
    ],
    columns: [
      {
        header: 'Selecionado',
        getValue: (item) => formatBooleanLabel(selectedItemSet.has(item.id))
      },
      {
        header: 'Item',
        getValue: (item) => item.sequence
      },
      {
        header: 'Status',
        getValue: (item) => getReconciliationStatusLabel(item.status)
      },
      {
        header: 'Motivo',
        getValue: (item) => getReconciliationReasonLabel(item)
      },
      {
        header: 'Descricao_fatura',
        getValue: (item) => item.sourceDescription
      },
      {
        header: 'Descricao_a_importar',
        getValue: (item) => itemDrafts[item.id]?.description || item.sourceDescription
      },
      {
        header: 'Categoria_a_importar',
        getValue: (item) => {
          const categoryId = itemDrafts[item.id]?.categoryId || '';
          return categoriesById.get(categoryId) || '';
        }
      },
      {
        header: 'Categoria_sugerida',
        getValue: (item) => item.categorySuggestion.categoryName || ''
      },
      {
        header: 'Fonte_sugestao',
        getValue: (item) =>
          getReconciliationSuggestionSourceLabel(item.categorySuggestion.source)
      },
      {
        header: 'Valor',
        getValue: (item) => formatCsvAmount(item.amount)
      },
      {
        header: 'Valor_assinado',
        getValue: (item) => formatCsvAmount(item.signedAmount)
      },
      {
        header: 'Data_compra',
        getValue: (item) => formatOptionalCalendarDate(item.purchaseDate)
      },
      {
        header: 'Parcela',
        getValue: (item) =>
          formatInstallmentLabel(item.installmentNumber, item.totalInstallments)
      },
      {
        header: 'Secao',
        getValue: (item) => getReconciliationSectionLabel(item.sourceSection)
      },
      {
        header: 'Tipo_linha',
        getValue: (item) => item.kind
      },
      {
        header: 'Direcao',
        getValue: (item) => getDirectionLabel(item.direction)
      },
      {
        header: 'Final_cartao',
        getValue: (item) => item.cardSuffix || ''
      },
      {
        header: 'Importavel',
        getValue: (item) => formatBooleanLabel(item.canImport)
      },
      {
        header: 'Correspondencias',
        getValue: (item) => item.matchedTransactions.length
      },
      {
        header: 'Correspondencias_detalhes',
        getValue: (item) => buildMatchedTransactionDetails(item.matchedTransactions)
      },
      {
        header: 'Motivo_nao_importavel',
        getValue: (item) => item.nonImportableReason || ''
      },
      {
        header: 'Item_id',
        getValue: (item) => item.id
      }
    ],
    rows: items
  });
}
