import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSearch,
  RefreshCw,
  Upload
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import CategorySelect, { type CategoryOption } from '@/components/financial/CategorySelect';
import { PageGuard } from '@/components/ui/AccessGuard';
import {
  AutocompleteInput,
  type AutocompleteSuggestion
} from '@/components/ui/AutoCompleteInput';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { buildCreditCardReconciliationCsv } from '@/utils/creditCardCsv';
import {
  type CreditCardReconciliationSourceType,
  FinancialBank,
  getCreditCardReconciliationSourceType
} from '@/utils/banks';
import { downloadCsvFile } from '@/utils/csv';
import { getInvoiceDisplayStatusLabel } from '@/utils/creditCards';
import { formatCalendarDate } from '@/utils/financialStatus';

type ReconciliationItemStatus = 'OK' | 'SIMILAR' | 'PENDING' | 'NOT_IMPORTABLE';
type ReconciliationReason =
  | 'EXACT'
  | 'MAPPED_FIXED'
  | 'AMBIGUOUS_EXACT'
  | 'INVOICE_DIVERGENCE'
  | 'DATE_DIVERGENCE'
  | 'INSTALLMENT_DIVERGENCE'
  | 'NON_IMPORTABLE'
  | 'NO_MATCH';
type ReconciliationFilter = 'ALL' | ReconciliationItemStatus;
type ReconciliationSuggestionSource = 'RULE' | 'HISTORY' | 'AI';

interface CreditCardAccount {
  id: number;
  name: string;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
  bankName?: string | null;
  bankCode?: string | null;
  bank?: FinancialBank | null;
}

interface ReconciliationInvoiceListItem {
  id: number | null;
  referenceYear: number;
  referenceMonth: number;
  closingDate: string;
  dueDate: string;
  status: string;
  isProjected?: boolean;
  projectionKey?: string | null;
}

interface TargetInvoiceOption {
  key: string;
  invoiceId: number | null;
  projectionKey: string | null;
  referenceYear: number;
  referenceMonth: number;
  closingDate: string;
  dueDate: string;
  status: string;
  isProjected: boolean;
  source: 'CURRENT_RECOMMENDED' | 'PREVIOUS_RECOMMENDED' | 'INVOICE_HISTORY';
}

interface ReconciliationInvoiceSystemTransaction {
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
    id: number;
    name: string;
    color: string;
  } | null;
}

interface ReconciliationTargetInvoiceDetail {
  id: number | null;
  referenceYear: number;
  referenceMonth: number;
  dueDate: string;
  status: string;
  isProjected?: boolean;
  projectionKey?: string | null;
  transactions: ReconciliationInvoiceSystemTransaction[];
}

interface ReconciliationMatchedTransaction {
  matchKey: string;
  matchSource: 'TRANSACTION' | 'PROJECTED_FIXED';
  id: number | null;
  fixedTemplateId: number | null;
  occurrenceKey: string | null;
  description: string;
  amount: string;
  date: string;
  status: string;
  installmentNumber: number | null;
  totalInstallments: number | null;
  purchaseGroupId: string | null;
  invoiceReference: string | null;
  invoiceStatus: string | null;
}

interface ReconciliationPreviewItem {
  id: string;
  sequence: number;
  status: ReconciliationItemStatus;
  reason: ReconciliationReason;
  kind: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
  signedAmount: string;
  purchaseDate: string | null;
  datePrecision: 'PURCHASE_DATE' | 'STATEMENT_REFERENCE';
  installmentNumber: number | null;
  totalInstallments: number | null;
  sourceDescription: string;
  sourceSection: string;
  cardSuffix: string | null;
  canImport: boolean;
  nonImportableReason: string | null;
  categorySuggestion: {
    categoryId: number | null;
    categoryName: string | null;
    categoryColor: string | null;
    categoryIcon: string | null;
    source: ReconciliationSuggestionSource | null;
    reason: string | null;
  };
  matchedTransactions: ReconciliationMatchedTransaction[];
}

interface ReconciliationPreview {
  statement: {
    sourceType: CreditCardReconciliationSourceType;
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
  items: ReconciliationPreviewItem[];
}

interface ReconciliationCommitResult {
  summary: {
    selectedCount: number;
    createdCount: number;
    linkedFixedCount: number;
    skippedDuplicateCount: number;
    skippedNotImportableCount: number;
    failedCount: number;
  };
  results: Array<{
    itemId: string;
    status:
      | 'CREATED'
      | 'LINKED_FIXED'
      | 'SKIPPED_DUPLICATE'
      | 'SKIPPED_NOT_IMPORTABLE'
      | 'FAILED';
    message: string;
    createdTransactionIds: number[];
  }>;
}

type ReconciliationCommitAction = 'IMPORT' | 'LINK_FIXED';

interface ReconciliationItemDraft {
  description: string;
  categoryId: string;
}

interface ReconciliationCommitSelection {
  itemId: string;
  action: ReconciliationCommitAction;
  description?: string;
  categoryId?: number;
}

const RECONCILIATION_SOURCE_CONFIG: Record<
  CreditCardReconciliationSourceType,
  {
    fileLabel: string;
    sourceLabel: string;
    selectLabel: string;
    helperText: string;
    accept: string;
    invalidFileMessage: string;
    analyzeFileMessage: string;
    unsupportedTitle: string;
    unsupportedDescription: string;
    statementDateLabel: string;
    totalAmountLabel: string;
    parsedAmountLabel: string;
  }
> = {
  CAIXA_PDF: {
    fileLabel: 'PDF da Caixa',
    sourceLabel: 'PDF Caixa',
    selectLabel: 'Selecionar PDF da Caixa',
    helperText: 'Somente o layout atual da fatura Caixa e suportado neste momento.',
    accept: 'application/pdf,.pdf',
    invalidFileMessage: 'Selecione um arquivo PDF da fatura da Caixa',
    analyzeFileMessage: 'Selecione o PDF da fatura da Caixa antes de analisar',
    unsupportedTitle: 'Conciliacao disponivel apenas para cartoes Caixa, Bradesco e Nubank',
    unsupportedDescription:
      'No momento a conciliacao aceita PDF da Caixa e CSVs do Bradesco e Nubank.',
    statementDateLabel: 'Vencimento',
    totalAmountLabel: 'Total da fatura',
    parsedAmountLabel: 'Lido do PDF'
  },
  BRADESCO_CSV: {
    fileLabel: 'CSV do Bradesco',
    sourceLabel: 'CSV Bradesco',
    selectLabel: 'Selecionar CSV do Bradesco',
    helperText: 'Somente o layout atual de exportacao CSV do Bradesco e suportado neste momento.',
    accept: '.csv,text/csv',
    invalidFileMessage: 'Selecione um arquivo CSV da fatura do Bradesco',
    analyzeFileMessage: 'Selecione o CSV da fatura do Bradesco antes de analisar',
    unsupportedTitle: 'Conciliacao disponivel apenas para cartoes Caixa, Bradesco e Nubank',
    unsupportedDescription:
      'No momento a conciliacao aceita PDF da Caixa e CSVs do Bradesco e Nubank.',
    statementDateLabel: 'Data da fatura',
    totalAmountLabel: 'Total da fatura',
    parsedAmountLabel: 'Lido do arquivo'
  },
  NUBANK_CSV: {
    fileLabel: 'CSV do Nubank',
    sourceLabel: 'CSV Nubank',
    selectLabel: 'Selecionar CSV do Nubank',
    helperText: 'Somente o layout atual de exportacao CSV do Nubank e suportado neste momento.',
    accept: '.csv,text/csv',
    invalidFileMessage: 'Selecione um arquivo CSV da fatura do Nubank',
    analyzeFileMessage: 'Selecione o CSV do Nubank antes de analisar',
    unsupportedTitle: 'Conciliacao disponivel apenas para cartoes Caixa, Bradesco e Nubank',
    unsupportedDescription:
      'No momento a conciliacao aceita PDF da Caixa e CSVs do Bradesco e Nubank.',
    statementDateLabel: 'Data do arquivo',
    totalAmountLabel: 'Total do arquivo',
    parsedAmountLabel: 'Calculado do CSV'
  }
};

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function getStatusLabel(status: ReconciliationItemStatus) {
  if (status === 'OK') return 'OK';
  if (status === 'SIMILAR') return 'Similar';
  if (status === 'PENDING') return 'Pendente';
  return 'Nao importavel';
}

function getStatusClasses(status: ReconciliationItemStatus) {
  if (status === 'OK') {
    return 'border-green-500/40 bg-green-500/10 text-green-200';
  }

  if (status === 'SIMILAR') {
    return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  }

  if (status === 'PENDING') {
    return 'border-blue-500/40 bg-blue-500/10 text-blue-200';
  }

  return 'border-gray-600 bg-gray-800 text-gray-300';
}

function getReasonLabel(item: ReconciliationPreviewItem) {
  const hasProjectedFixedMatch = item.matchedTransactions.some(
    (transaction) => transaction.matchSource === 'PROJECTED_FIXED'
  );

  switch (item.reason) {
    case 'EXACT':
      return hasProjectedFixedMatch
        ? 'Fixa projetada equivalente ja encontrada para esta fatura.'
        : 'Lancamento ja encontrado.';
    case 'MAPPED_FIXED':
      return 'Descricao vinculada automaticamente a fixa recorrente desta fatura.';
    case 'AMBIGUOUS_EXACT':
      return hasProjectedFixedMatch
        ? 'Ha mais de uma correspondencia equivalente, incluindo fixas projetadas.'
        : 'Mais de um lancamento ja bate exatamente.';
    case 'INVOICE_DIVERGENCE':
      return 'Mesmo valor ou valor muito proximo, com mesma data/parcela, mas vinculado a outra fatura.';
    case 'DATE_DIVERGENCE':
      return hasProjectedFixedMatch
        ? 'Existe fixa projetada com valor igual ou muito proximo nesta fatura; revise a data.'
        : 'Mesmo valor ou valor muito proximo, com divergencia de data.';
    case 'INSTALLMENT_DIVERGENCE':
      return 'Mesmo valor ou valor muito proximo, com divergencia de parcelamento.';
    case 'NON_IMPORTABLE':
      return 'Linha apenas informativa para esta rotina.';
    default:
      return 'Ainda nao ha lancamento equivalente no cartao.';
  }
}

function getSectionLabel(section: string) {
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

function getSuggestionSourceLabel(source: ReconciliationSuggestionSource | null) {
  if (source === 'RULE') return 'Regra';
  if (source === 'HISTORY') return 'Historico';
  if (source === 'AI') return 'IA';
  return null;
}

function formatInstallmentLabel(
  installmentNumber: number | null,
  totalInstallments: number | null
) {
  if (!installmentNumber || !totalInstallments) {
    return '-';
  }

  return `${installmentNumber}/${totalInstallments}`;
}

function formatReference(referenceMonth: number, referenceYear: number) {
  return `${String(referenceMonth).padStart(2, '0')}/${referenceYear}`;
}

function buildInvoiceReferenceKey(referenceYear: number, referenceMonth: number) {
  return `${referenceYear}-${String(referenceMonth).padStart(2, '0')}`;
}

function buildDateWithClampedDay(year: number, monthIndex: number, day: number) {
  const safeDay = Math.max(1, Math.min(day, 31));
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(safeDay, lastDay), 12, 0, 0, 0);
}

function buildInvoiceReferenceForMonth(
  referenceYear: number,
  referenceMonth: number,
  closingDay: number,
  dueDay: number
) {
  const closingDate = buildDateWithClampedDay(referenceYear, referenceMonth - 1, closingDay);
  const dueMonthOffset = dueDay > closingDay ? 0 : 1;
  const dueBase = new Date(referenceYear, referenceMonth - 1 + dueMonthOffset, 1, 12, 0, 0, 0);
  const dueDate = buildDateWithClampedDay(dueBase.getFullYear(), dueBase.getMonth(), dueDay);

  return {
    referenceYear,
    referenceMonth,
    closingDate: closingDate.toISOString(),
    dueDate: dueDate.toISOString()
  };
}

function resolveCurrentOpenInvoiceReference(
  closingDay: number,
  dueDay: number,
  now: Date = new Date()
) {
  const referenceBase = new Date(
    now.getFullYear(),
    now.getMonth() + (now.getDate() <= closingDay ? 0 : 1),
    1,
    12,
    0,
    0,
    0
  );

  return buildInvoiceReferenceForMonth(
    referenceBase.getFullYear(),
    referenceBase.getMonth() + 1,
    closingDay,
    dueDay
  );
}

function shiftInvoiceReferenceMonth(
  referenceYear: number,
  referenceMonth: number,
  monthOffset: number,
  closingDay: number,
  dueDay: number
) {
  const referenceBase = new Date(referenceYear, referenceMonth - 1 + monthOffset, 1, 12, 0, 0, 0);

  return buildInvoiceReferenceForMonth(
    referenceBase.getFullYear(),
    referenceBase.getMonth() + 1,
    closingDay,
    dueDay
  );
}

function buildTargetInvoiceOptions(
  card: CreditCardAccount | null,
  invoices: ReconciliationInvoiceListItem[]
): TargetInvoiceOption[] {
  const optionsByKey = new Map<string, TargetInvoiceOption>();
  const existingInvoicesByKey = new Map(
    invoices.map((invoice) => [
      buildInvoiceReferenceKey(invoice.referenceYear, invoice.referenceMonth),
      invoice
    ])
  );

  const addOption = (option: TargetInvoiceOption) => {
    if (!optionsByKey.has(option.key)) {
      optionsByKey.set(option.key, option);
    }
  };

  if (card?.statementClosingDay && card?.statementDueDay) {
    const currentOpenReference = resolveCurrentOpenInvoiceReference(
      card.statementClosingDay,
      card.statementDueDay
    );
    const currentOpenKey = buildInvoiceReferenceKey(
      currentOpenReference.referenceYear,
      currentOpenReference.referenceMonth
    );
    const currentOpenInvoice = existingInvoicesByKey.get(currentOpenKey);

    addOption({
      key: currentOpenKey,
      invoiceId: currentOpenInvoice?.id ?? null,
      projectionKey: currentOpenInvoice?.projectionKey ?? null,
      referenceYear: currentOpenReference.referenceYear,
      referenceMonth: currentOpenReference.referenceMonth,
      closingDate: currentOpenInvoice?.closingDate || currentOpenReference.closingDate,
      dueDate: currentOpenInvoice?.dueDate || currentOpenReference.dueDate,
      status: currentOpenInvoice?.status || 'OPEN',
      isProjected: Boolean(currentOpenInvoice?.isProjected),
      source: 'CURRENT_RECOMMENDED'
    });

    const previousReference = shiftInvoiceReferenceMonth(
      currentOpenReference.referenceYear,
      currentOpenReference.referenceMonth,
      -1,
      card.statementClosingDay,
      card.statementDueDay
    );
    const previousKey = buildInvoiceReferenceKey(
      previousReference.referenceYear,
      previousReference.referenceMonth
    );
    const previousInvoice = existingInvoicesByKey.get(previousKey);

    addOption({
      key: previousKey,
      invoiceId: previousInvoice?.id ?? null,
      projectionKey: previousInvoice?.projectionKey ?? null,
      referenceYear: previousReference.referenceYear,
      referenceMonth: previousReference.referenceMonth,
      closingDate: previousInvoice?.closingDate || previousReference.closingDate,
      dueDate: previousInvoice?.dueDate || previousReference.dueDate,
      status: previousInvoice?.status || 'CLOSED',
      isProjected: Boolean(previousInvoice?.isProjected),
      source: 'PREVIOUS_RECOMMENDED'
    });
  }

  invoices.forEach((invoice) => {
    const key = buildInvoiceReferenceKey(invoice.referenceYear, invoice.referenceMonth);

    addOption({
      key,
      invoiceId: invoice.id,
      projectionKey: invoice.projectionKey ?? null,
      referenceYear: invoice.referenceYear,
      referenceMonth: invoice.referenceMonth,
      closingDate: invoice.closingDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      isProjected: Boolean(invoice.isProjected),
      source: 'INVOICE_HISTORY'
    });
  });

  const sourceOrder: Record<TargetInvoiceOption['source'], number> = {
    CURRENT_RECOMMENDED: 0,
    PREVIOUS_RECOMMENDED: 1,
    INVOICE_HISTORY: 2
  };

  return Array.from(optionsByKey.values()).sort((left: TargetInvoiceOption, right: TargetInvoiceOption) => {
    if (sourceOrder[left.source] !== sourceOrder[right.source]) {
      return sourceOrder[left.source] - sourceOrder[right.source];
    }

    if (left.referenceYear !== right.referenceYear) {
      return right.referenceYear - left.referenceYear;
    }

    if (left.referenceMonth !== right.referenceMonth) {
      return right.referenceMonth - left.referenceMonth;
    }

    return new Date(right.dueDate).getTime() - new Date(left.dueDate).getTime();
  });
}

function getTargetInvoiceOptionLabel(option: TargetInvoiceOption) {
  const prefix =
    option.source === 'CURRENT_RECOMMENDED'
      ? 'Atual recomendada'
      : option.source === 'PREVIOUS_RECOMMENDED'
        ? 'Ultima fechada'
        : 'Outra referencia';
  const statusLabel = getInvoiceDisplayStatusLabel(option.status);
  const projectionLabel = option.isProjected ? 'projetada' : 'real';

  return `${prefix} • ${formatReference(option.referenceMonth, option.referenceYear)} • ${statusLabel} • vence ${formatCalendarDate(option.dueDate)} • ${projectionLabel}`;
}

function isManuallyImportable(item: ReconciliationPreviewItem) {
  return item.canImport && item.status !== 'OK';
}

function getProjectedFixedMatches(item: ReconciliationPreviewItem) {
  return item.matchedTransactions.filter(
    (transaction) => transaction.matchSource === 'PROJECTED_FIXED'
  );
}

function getUniqueProjectedFixedTemplateId(item: ReconciliationPreviewItem) {
  const fixedTemplateIds = Array.from(
    new Set(
      getProjectedFixedMatches(item)
        .map((transaction) => transaction.fixedTemplateId)
        .filter((fixedTemplateId): fixedTemplateId is number => Boolean(fixedTemplateId))
    )
  );

  return fixedTemplateIds.length === 1 ? fixedTemplateIds[0]! : null;
}

function canLinkToFixed(item: ReconciliationPreviewItem) {
  return (
    item.canImport &&
    item.status === 'SIMILAR' &&
    item.kind === 'PURCHASE' &&
    !item.installmentNumber &&
    !item.totalInstallments &&
    item.matchedTransactions.length > 0 &&
    getProjectedFixedMatches(item).length === item.matchedTransactions.length &&
    Boolean(getUniqueProjectedFixedTemplateId(item))
  );
}

function getSystemInvoiceTransactionKey(transaction: ReconciliationInvoiceSystemTransaction) {
  if (transaction.id !== null) {
    return `transaction:${transaction.id}`;
  }

  if (transaction.fixedTemplateId !== null && transaction.fixedTemplateId !== undefined) {
    return `fixed:${transaction.fixedTemplateId}`;
  }

  return `projection:${transaction.description}:${transaction.amount}:${
    transaction.dueDate || transaction.date || ''
  }:${transaction.installmentNumber || ''}:${transaction.totalInstallments || ''}`;
}

function getMatchedTransactionSystemKey(transaction: ReconciliationMatchedTransaction) {
  if (transaction.matchSource === 'TRANSACTION' && transaction.id !== null) {
    return `transaction:${transaction.id}`;
  }

  if (
    transaction.matchSource === 'PROJECTED_FIXED' &&
    transaction.fixedTemplateId !== null
  ) {
    return `fixed:${transaction.fixedTemplateId}`;
  }

  return null;
}

function getSystemTransactionDateLabel(transaction: ReconciliationInvoiceSystemTransaction) {
  if (transaction.date) {
    return `Compra em ${formatCalendarDate(transaction.date)}`;
  }

  if (transaction.dueDate) {
    return `Vence em ${formatCalendarDate(transaction.dueDate)}`;
  }

  return 'Sem data informada';
}

function buildItemDrafts(items: ReconciliationPreviewItem[]) {
  return items.reduce<Record<string, ReconciliationItemDraft>>((accumulator, item) => {
    accumulator[item.id] = {
      description: item.sourceDescription,
      categoryId: item.categorySuggestion.categoryId
        ? String(item.categorySuggestion.categoryId)
        : ''
    };
    return accumulator;
  }, {});
}

function parseAmountToCents(value: string | number) {
  const numericValue = Number(value || 0);
  return Number.isFinite(numericValue) ? Math.round(numericValue * 100) : 0;
}

function centsToDecimalString(value: number) {
  return (value / 100).toFixed(2);
}

function buildPreviewSummary(items: ReconciliationPreviewItem[]): ReconciliationPreview['summary'] {
  const okItems = items.filter((item) => item.status === 'OK');
  const similarItems = items.filter((item) => item.status === 'SIMILAR');
  const pendingItems = items.filter((item) => item.status === 'PENDING');
  const notImportableItems = items.filter((item) => item.status === 'NOT_IMPORTABLE');
  const importableItems = items.filter((item) => item.canImport);

  const sumItems = (entries: ReconciliationPreviewItem[]) =>
    centsToDecimalString(
      entries.reduce((sum, entry) => sum + parseAmountToCents(entry.signedAmount), 0)
    );

  return {
    totalItems: items.length,
    okCount: okItems.length,
    similarCount: similarItems.length,
    pendingCount: pendingItems.length,
    notImportableCount: notImportableItems.length,
    importableCount: importableItems.length,
    importableAmount: sumItems(importableItems),
    okAmount: sumItems(okItems),
    similarAmount: sumItems(similarItems),
    pendingAmount: sumItems(pendingItems),
    notImportableAmount: sumItems(notImportableItems)
  };
}

function resolveCreatedTransactionId(
  item: ReconciliationPreviewItem,
  createdTransactionIds: number[]
) {
  if (createdTransactionIds.length === 0) {
    return null;
  }

  if (item.installmentNumber && createdTransactionIds.length >= item.installmentNumber) {
    return createdTransactionIds[item.installmentNumber - 1] ?? createdTransactionIds[0] ?? null;
  }

  return createdTransactionIds[0] ?? null;
}

function buildCreatedMatchTransaction(params: {
  preview: ReconciliationPreview;
  item: ReconciliationPreviewItem;
  description: string;
  createdTransactionIds: number[];
}): ReconciliationMatchedTransaction[] {
  const createdTransactionId = resolveCreatedTransactionId(
    params.item,
    params.createdTransactionIds
  );

  return [
    {
      matchKey: createdTransactionId
        ? `transaction:${createdTransactionId}`
        : `transaction:created:${params.item.id}`,
      matchSource: 'TRANSACTION',
      id: createdTransactionId,
      fixedTemplateId: null,
      occurrenceKey: null,
      description: params.description,
      amount: params.item.amount,
      date: params.item.purchaseDate || params.preview.statement.dueDate,
      status: 'COMPLETED',
      installmentNumber: params.item.installmentNumber,
      totalInstallments: params.item.totalInstallments,
      purchaseGroupId: null,
      invoiceReference: formatReference(
        params.preview.statement.referenceMonth,
        params.preview.statement.referenceYear
      ),
      invoiceStatus: null
    }
  ];
}

function buildFallbackMatchTransaction(params: {
  preview: ReconciliationPreview;
  item: ReconciliationPreviewItem;
  description: string;
}): ReconciliationMatchedTransaction[] {
  return [
    {
      matchKey: `transaction:existing:${params.item.id}`,
      matchSource: 'TRANSACTION',
      id: null,
      fixedTemplateId: null,
      occurrenceKey: null,
      description: params.description,
      amount: params.item.amount,
      date: params.item.purchaseDate || params.preview.statement.dueDate,
      status: 'COMPLETED',
      installmentNumber: params.item.installmentNumber,
      totalInstallments: params.item.totalInstallments,
      purchaseGroupId: null,
      invoiceReference: formatReference(
        params.preview.statement.referenceMonth,
        params.preview.statement.referenceYear
      ),
      invoiceStatus: null
    }
  ];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Nao foi possivel ler o arquivo selecionado'));
        return;
      }

      resolve(reader.result);
    };

    reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo selecionado'));
    reader.readAsDataURL(file);
  });
}

function CreditCardReconciliationPageInner() {
  const router = useRouter();
  const { addToast } = useToast();
  const accountId = Number(router.query.accountId);

  const [card, setCard] = useState<CreditCardAccount | null>(null);
  const [loadingCard, setLoadingCard] = useState(true);
  const [invoices, setInvoices] = useState<ReconciliationInvoiceListItem[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState('');
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [commitResult, setCommitResult] = useState<ReconciliationCommitResult | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [itemDrafts, setItemDrafts] = useState<Record<string, ReconciliationItemDraft>>({});
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReconciliationFilter>('ALL');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [committingItemIds, setCommittingItemIds] = useState<string[]>([]);
  const [selectedTargetInvoiceKey, setSelectedTargetInvoiceKey] = useState('');
  const [targetInvoiceDetail, setTargetInvoiceDetail] =
    useState<ReconciliationTargetInvoiceDetail | null>(null);
  const [targetInvoiceDetailLoading, setTargetInvoiceDetailLoading] = useState(false);
  const [localSystemSelections, setLocalSystemSelections] = useState<Record<string, string>>({});
  const commitInFlightItemIdsRef = useRef<Set<string>>(new Set());
  const batchCommitInFlightRef = useRef(false);

  const reconciliationSourceType = useMemo(
    () => getCreditCardReconciliationSourceType(card?.bank, card?.bankCode, card?.bankName),
    [card]
  );
  const sourceConfig = reconciliationSourceType
    ? RECONCILIATION_SOURCE_CONFIG[reconciliationSourceType]
    : null;
  const targetInvoiceOptions = useMemo(
    () => buildTargetInvoiceOptions(card, invoices),
    [card, invoices]
  );
  const selectedTargetInvoice = useMemo(
    () =>
      targetInvoiceOptions.find((option) => option.key === selectedTargetInvoiceKey) || null,
    [selectedTargetInvoiceKey, targetInvoiceOptions]
  );
  const targetInvoiceTransactions = useMemo(
    () => targetInvoiceDetail?.transactions || [],
    [targetInvoiceDetail]
  );
  const targetInvoiceTransactionsByKey = useMemo(
    () =>
      new Map(
        targetInvoiceTransactions.map((transaction) => [
          getSystemInvoiceTransactionKey(transaction),
          transaction
        ])
      ),
    [targetInvoiceTransactions]
  );
  const previewMatchedTransactionKeys = useMemo(() => {
    if (!preview) {
      return new Set<string>();
    }

    return preview.items.reduce((keys, item) => {
      item.matchedTransactions.forEach((transaction) => {
        const transactionKey = getMatchedTransactionSystemKey(transaction);

        if (transactionKey) {
          keys.add(transactionKey);
        }
      });
      return keys;
    }, new Set<string>());
  }, [preview]);

  const filteredItems = useMemo(() => {
    if (!preview) {
      return [];
    }

    if (statusFilter === 'ALL') {
      return preview.items;
    }

    return preview.items.filter((item) => item.status === statusFilter);
  }, [preview, statusFilter]);

  const selectedItemSet = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);

  const selectedItems = useMemo(() => {
    if (!preview) {
      return [];
    }

    return preview.items.filter((item) => selectedItemSet.has(item.id));
  }, [preview, selectedItemSet]);

  const selectedAmount = useMemo(
    () => selectedItems.reduce((sum, item) => sum + Number(item.amount), 0),
    [selectedItems]
  );

  const selectedDraftIssues = useMemo(() => {
    return selectedItems.reduce(
      (summary, item) => {
        const draft = itemDrafts[item.id] || {
          description: item.sourceDescription,
          categoryId: item.categorySuggestion.categoryId
            ? String(item.categorySuggestion.categoryId)
            : ''
        };

        if (!draft.description.trim()) {
          summary.missingDescriptionCount += 1;
        }

        if (!draft.categoryId) {
          summary.missingCategoryCount += 1;
        }

        return summary;
      },
      {
        missingDescriptionCount: 0,
        missingCategoryCount: 0
      }
    );
  }, [itemDrafts, selectedItems]);
  const hasPendingSingleCommit = committingItemIds.length > 0;

  useEffect(() => {
    if (!router.isReady || Number.isNaN(accountId)) {
      return;
    }

    void fetchCard();
    void fetchInvoices();
    void fetchCategories();
  }, [accountId, router.isReady]);

  useEffect(() => {
    if (targetInvoiceOptions.length === 0) {
      if (selectedTargetInvoiceKey) {
        setSelectedTargetInvoiceKey('');
      }
      return;
    }

    if (selectedTargetInvoiceKey && targetInvoiceOptions.some((option) => option.key === selectedTargetInvoiceKey)) {
      return;
    }

    setSelectedTargetInvoiceKey(targetInvoiceOptions[0]!.key);
  }, [selectedTargetInvoiceKey, targetInvoiceOptions]);

  useEffect(() => {
    if (!router.isReady || Number.isNaN(accountId) || !selectedTargetInvoice) {
      setTargetInvoiceDetail(null);
      return;
    }

    void fetchTargetInvoiceDetail(selectedTargetInvoice);
  }, [accountId, router.isReady, selectedTargetInvoice]);

  useEffect(() => {
    setLocalSystemSelections({});
  }, [preview, selectedTargetInvoiceKey]);

  useEffect(() => {
    if (targetInvoiceTransactionsByKey.size === 0) {
      return;
    }

    setLocalSystemSelections((current) => {
      let changed = false;
      const nextEntries = Object.entries(current).filter(([, transactionKey]) => {
        const exists = targetInvoiceTransactionsByKey.has(transactionKey);

        if (!exists) {
          changed = true;
        }

        return exists;
      });

      return changed ? Object.fromEntries(nextEntries) : current;
    });
  }, [targetInvoiceTransactionsByKey]);

  async function fetchCard() {
    setLoadingCard(true);

    try {
      const response = await api.get('/financial/credit-cards');
      const nextCard =
        (response.data || []).find((entry: CreditCardAccount) => entry.id === accountId) || null;
      setCard(nextCard);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar cartao', 'error');
    } finally {
      setLoadingCard(false);
    }
  }

  async function fetchCategories() {
    setCategoriesLoading(true);

    try {
      const response = await api.get('/financial/categories', {
        params: {
          type: 'EXPENSE'
        }
      });
      setCategories(
        (response.data || []).map((category: any) => ({
          id: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          isDefault: category.isDefault,
          parentId: category.parentId
        }))
      );
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar categorias', 'error');
    } finally {
      setCategoriesLoading(false);
    }
  }

  async function fetchInvoices() {
    setInvoicesLoading(true);

    try {
      const response = await api.get(`/financial/credit-cards/${accountId}/invoices`);
      setInvoices(response.data || []);
    } catch (error: any) {
      setInvoices([]);
      addToast(error.response?.data?.error || 'Erro ao carregar referencias de fatura', 'error');
    } finally {
      setInvoicesLoading(false);
    }
  }

  async function fetchTargetInvoiceDetail(invoice: TargetInvoiceOption) {
    const canLoadProjected = invoice.isProjected && Boolean(invoice.projectionKey);
    const canLoadReal = invoice.invoiceId !== null;

    if (!canLoadProjected && !canLoadReal) {
      setTargetInvoiceDetail(null);
      setTargetInvoiceDetailLoading(false);
      return;
    }

    setTargetInvoiceDetailLoading(true);

    try {
      const response = canLoadProjected
        ? await api.get(
            `/financial/credit-cards/${accountId}/invoices/projected/${invoice.projectionKey}`
          )
        : await api.get(`/financial/credit-card-invoices/${invoice.invoiceId}`);
      setTargetInvoiceDetail(response.data);
    } catch (error: any) {
      setTargetInvoiceDetail(null);
      addToast(
        error.response?.data?.error || 'Erro ao carregar itens da fatura selecionada',
        'error'
      );
    } finally {
      setTargetInvoiceDetailLoading(false);
    }
  }

  function applyDefaultSelection(nextPreview: ReconciliationPreview) {
    setSelectedItemIds(
      nextPreview.items
        .filter((item) => item.status === 'PENDING' && item.canImport)
        .map((item) => item.id)
    );
    setItemDrafts(buildItemDrafts(nextPreview.items));
  }

  async function runPreview() {
    if (!fileBase64 || !fileName) {
      addToast(sourceConfig?.analyzeFileMessage || 'Selecione a fatura antes de analisar', 'error');
      return;
    }

    if (!reconciliationSourceType) {
      addToast('Cartao sem fonte de conciliacao suportada', 'error');
      return;
    }

    if (!selectedTargetInvoice) {
      addToast('Selecione a fatura-alvo antes de analisar', 'error');
      return;
    }

    setPreviewLoading(true);

    try {
      const response = await api.post(
        `/financial/credit-cards/${accountId}/reconciliation/preview`,
        {
          sourceType: reconciliationSourceType,
          targetReferenceYear: selectedTargetInvoice.referenceYear,
          targetReferenceMonth: selectedTargetInvoice.referenceMonth,
          fileBase64,
          fileName
        }
      );

      setPreview(response.data);
      setCommitResult(null);
      setStatusFilter('ALL');
      applyDefaultSelection(response.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao analisar fatura', 'error');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function refreshPreviewSilently() {
    if (!fileBase64 || !fileName || !reconciliationSourceType || !selectedTargetInvoice) {
      return;
    }

    const response = await api.post(
      `/financial/credit-cards/${accountId}/reconciliation/preview`,
      {
        sourceType: reconciliationSourceType,
        targetReferenceYear: selectedTargetInvoice.referenceYear,
        targetReferenceMonth: selectedTargetInvoice.referenceMonth,
        fileBase64,
        fileName
      }
    );

    setPreview(response.data);
    applyDefaultSelection(response.data);
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) {
      return;
    }

    const fileNameLower = nextFile.name.toLowerCase();
    const isValidFile = reconciliationSourceType === 'CAIXA_PDF'
      ? nextFile.type === 'application/pdf' || fileNameLower.endsWith('.pdf')
      : nextFile.type === 'text/csv' || fileNameLower.endsWith('.csv');
    if (!isValidFile) {
      addToast(sourceConfig?.invalidFileMessage || 'Selecione um arquivo suportado', 'error');
      event.target.value = '';
      return;
    }

    try {
      const nextFileBase64 = await readFileAsDataUrl(nextFile);
      setFileName(nextFile.name);
      setFileBase64(nextFileBase64);
      setPreview(null);
      setCommitResult(null);
      setItemDrafts({});
      setSelectedItemIds([]);
    } catch (error: any) {
      addToast(error.message || 'Erro ao ler arquivo', 'error');
    }
  }

  function handleTargetInvoiceChange(nextTargetInvoiceKey: string) {
    if (nextTargetInvoiceKey === selectedTargetInvoiceKey) {
      return;
    }

    setSelectedTargetInvoiceKey(nextTargetInvoiceKey);
    setPreview(null);
    setCommitResult(null);
    setItemDrafts({});
    setSelectedItemIds([]);
  }

  function handleLocalSystemSelectionChange(itemId: string, transactionKey: string) {
    setLocalSystemSelections((current) => {
      if (!transactionKey) {
        if (!(itemId in current)) {
          return current;
        }

        const next = { ...current };
        delete next[itemId];
        return next;
      }

      if (current[itemId] === transactionKey) {
        return current;
      }

      return {
        ...current,
        [itemId]: transactionKey
      };
    });
  }

  function handleToggleSelection(itemId: string, checked: boolean) {
    setSelectedItemIds((current) => {
      if (checked) {
        return current.includes(itemId) ? current : [...current, itemId];
      }

      return current.filter((value) => value !== itemId);
    });
  }

  function handleSelectPending() {
    if (!preview) {
      return;
    }

    setSelectedItemIds(
      preview.items
        .filter((item) => item.status === 'PENDING' && item.canImport)
        .map((item) => item.id)
    );
  }

  function handleSelectVisibleImportable() {
    setSelectedItemIds(
      filteredItems
        .filter((item) => isManuallyImportable(item))
        .map((item) => item.id)
    );
  }

  function handleExportPreviewCsv() {
    if (!preview) {
      addToast('Analise a fatura antes de exportar a previa', 'error');
      return;
    }

    try {
      const csv = buildCreditCardReconciliationCsv({
        cardName: card?.name || 'Cartao',
        sourceLabel: sourceConfig?.sourceLabel || preview.statement.sourceType,
        statusFilterLabel: statusFilter === 'ALL' ? 'Todos' : getStatusLabel(statusFilter),
        fileName,
        preview,
        items: filteredItems,
        itemDrafts,
        selectedItemIds,
        categories,
        targetInvoice: selectedTargetInvoice
      });
      const referenceMonth = String(preview.statement.referenceMonth).padStart(2, '0');
      const filterSuffix = statusFilter === 'ALL' ? 'todos' : statusFilter.toLowerCase();

      downloadCsvFile(
        `previa-conciliacao-${accountId}-${preview.statement.referenceYear}-${referenceMonth}-${filterSuffix}.csv`,
        csv
      );
      addToast('CSV da previa exportado com sucesso', 'success');
    } catch (error) {
      addToast('Erro ao exportar CSV da previa', 'error');
    }
  }

  function getItemDraft(item: ReconciliationPreviewItem): ReconciliationItemDraft {
    return (
      itemDrafts[item.id] || {
        description: item.sourceDescription,
        categoryId: item.categorySuggestion.categoryId
          ? String(item.categorySuggestion.categoryId)
          : ''
      }
    );
  }

  function handleDraftDescriptionChange(itemId: string, description: string) {
    setItemDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || { description: '', categoryId: '' }),
        description
      }
    }));
  }

  function handleDraftCategoryChange(itemId: string, categoryId: string) {
    setItemDrafts((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] || { description: '', categoryId: '' }),
        categoryId
      }
    }));
  }

  async function fetchDescriptionSuggestions(query: string): Promise<AutocompleteSuggestion[]> {
    if (query.trim().length < 3) {
      return [];
    }

    try {
      const response = await api.get('/financial/transactions/autocomplete', {
        params: {
          q: query,
          type: 'EXPENSE'
        }
      });

      return response.data.suggestions || [];
    } catch (error) {
      console.error('Error fetching reconciliation description suggestions:', error);
      return [];
    }
  }

  function handleDraftSuggestionSelect(itemId: string, suggestion: AutocompleteSuggestion) {
    const nextCategoryId = suggestion.categoryId ? String(suggestion.categoryId) : '';
    const hasKnownCategory = nextCategoryId
      ? categories.some((category) => String(category.id) === nextCategoryId)
      : false;

    setItemDrafts((current) => ({
      ...current,
      [itemId]: {
        description: suggestion.description,
        categoryId: hasKnownCategory
          ? nextCategoryId
          : current[itemId]?.categoryId || ''
      }
    }));
  }

  function buildCommitPayload(
    itemIds: string[],
    action: ReconciliationCommitAction = 'IMPORT'
  ): ReconciliationCommitSelection[] {
    if (!preview) {
      return [];
    }

    return itemIds.map((itemId) => {
      const item = preview.items.find((entry) => entry.id === itemId);

      if (!item) {
        throw new Error('Item selecionado nao foi localizado na previa');
      }

      if (action === 'LINK_FIXED') {
        return {
          itemId,
          action: 'LINK_FIXED'
        };
      }

      const draft = getItemDraft(item);
      const description = draft.description.trim();
      if (!description) {
        throw new Error(`Informe a descricao a lancar do item ${item.sequence}`);
      }

      if (!draft.categoryId) {
        throw new Error(`Selecione a categoria do item ${item.sequence}`);
      }

      return {
        itemId,
        action: 'IMPORT',
        description,
        categoryId: Number(draft.categoryId)
      };
    });
  }

  function applySingleItemCommitLocally(
    selectedItem: ReconciliationCommitSelection,
    result: ReconciliationCommitResult['results'][number]
  ) {
    if (result.status === 'FAILED') {
      return;
    }

    setPreview((currentPreview) => {
      if (!currentPreview) {
        return currentPreview;
      }

      const nextItems = currentPreview.items.map((item) => {
        if (item.id !== selectedItem.itemId) {
          return item;
        }

        if (result.status === 'SKIPPED_NOT_IMPORTABLE') {
          return {
            ...item,
            status: 'NOT_IMPORTABLE' as const,
            reason: 'NON_IMPORTABLE' as const,
            canImport: false,
            nonImportableReason: result.message
          };
        }

        const projectedFixedMatches = getProjectedFixedMatches(item);
        const isFixedLinkAction = selectedItem.action === 'LINK_FIXED';
        const matchedTransactions = result.status === 'CREATED'
          ? buildCreatedMatchTransaction({
              preview: currentPreview,
              item,
              description: selectedItem.description || item.sourceDescription,
              createdTransactionIds: result.createdTransactionIds
            })
          : projectedFixedMatches.length > 0
            ? projectedFixedMatches
            : isFixedLinkAction
              ? item.matchedTransactions
              : buildFallbackMatchTransaction({
                preview: currentPreview,
                item,
                description: selectedItem.description || item.sourceDescription
              });

        return {
          ...item,
          status: 'OK' as const,
          reason: (
            result.status === 'LINKED_FIXED' || isFixedLinkAction ? 'MAPPED_FIXED' : 'EXACT'
          ) as ReconciliationReason,
          canImport: false,
          nonImportableReason: null,
          matchedTransactions
        };
      });

      return {
        ...currentPreview,
        items: nextItems,
        summary: buildPreviewSummary(nextItems)
      };
    });

    setSelectedItemIds((current) => current.filter((itemId) => itemId !== selectedItem.itemId));
  }

  async function commitItems(
    itemIds: string[],
    action: ReconciliationCommitAction = 'IMPORT'
  ) {
    if (!preview || !fileBase64 || !fileName || !reconciliationSourceType || !selectedTargetInvoice) {
      addToast('Analise a fatura antes de processar os itens', 'error');
      return;
    }

    if (itemIds.length === 0) {
      addToast('Selecione ao menos um item para processar', 'error');
      return;
    }

    let selectedItems: ReconciliationCommitSelection[] = [];
    try {
      selectedItems = buildCommitPayload(itemIds, action);
    } catch (error: any) {
      addToast(error.message || 'Revise os dados selecionados antes de continuar', 'error');
      return;
    }

    const isSingleItemCommit = itemIds.length === 1;

    if (isSingleItemCommit) {
      if (batchCommitInFlightRef.current || commitInFlightItemIdsRef.current.size > 0) {
        return;
      }

      commitInFlightItemIdsRef.current.add(itemIds[0]!);
      setCommittingItemIds((current) => Array.from(new Set([...current, ...itemIds])));
    } else {
      if (batchCommitInFlightRef.current || commitInFlightItemIdsRef.current.size > 0) {
        return;
      }

      batchCommitInFlightRef.current = true;
      setCommitLoading(true);
    }

    try {
      const response = await api.post(
        `/financial/credit-cards/${accountId}/reconciliation/commit`,
        {
          sourceType: reconciliationSourceType,
          targetReferenceYear: selectedTargetInvoice.referenceYear,
          targetReferenceMonth: selectedTargetInvoice.referenceMonth,
          fileBase64,
          fileName,
          selectedItems
        }
      );

      setCommitResult(response.data);

      if (isSingleItemCommit) {
        const result = response.data.results[0];

        if (result) {
          if (result.status === 'FAILED') {
            addToast(
              result.message ||
                (action === 'LINK_FIXED'
                  ? 'Erro ao vincular item a fixa recorrente'
                  : 'Erro ao importar lancamento'),
              'error'
            );
          } else {
            addToast(
              result.message ||
                (action === 'LINK_FIXED'
                  ? 'Descricao vinculada a fixa recorrente'
                  : 'Lancamento processado na conciliacao'),
              'success'
            );
            applySingleItemCommitLocally(selectedItems[0]!, result);
          }
        }
      } else {
        addToast(
          action === 'LINK_FIXED'
            ? `${response.data.summary.linkedFixedCount} vinculo(s) com fixa recorrente salvo(s)`
            : `${response.data.summary.createdCount} lancamento(s) criado(s) na conciliacao`,
          'success'
        );
        await refreshPreviewSilently();
      }
    } catch (error: any) {
      addToast(
        error.response?.data?.error ||
          (action === 'LINK_FIXED'
            ? 'Erro ao vincular item a fixa recorrente'
            : 'Erro ao importar lancamentos'),
        'error'
      );
    } finally {
      if (isSingleItemCommit) {
        itemIds.forEach((itemId) => commitInFlightItemIdsRef.current.delete(itemId));
        setCommittingItemIds((current) =>
          current.filter((currentItemId) => !itemIds.includes(currentItemId))
        );
      } else {
        batchCommitInFlightRef.current = false;
        setCommitLoading(false);
      }
    }
  }

  const filterButtons: Array<{ value: ReconciliationFilter; label: string; count: number }> = [
    { value: 'ALL', label: 'Todos', count: preview?.summary.totalItems || 0 },
    { value: 'OK', label: 'OK', count: preview?.summary.okCount || 0 },
    { value: 'SIMILAR', label: 'Similares', count: preview?.summary.similarCount || 0 },
    { value: 'PENDING', label: 'Pendentes', count: preview?.summary.pendingCount || 0 },
    {
      value: 'NOT_IMPORTABLE',
      label: 'Nao importaveis',
      count: preview?.summary.notImportableCount || 0
    }
  ];

  return (
    <DashboardLayout title={card ? `Conciliacao de ${card.name}` : 'Conciliacao de cartao'}>
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Cartoes e Faturas', href: '/financial/credit-cards' },
          { label: card?.name || 'Cartao', href: `/financial/credit-cards/${accountId}/invoices` },
          { label: 'Conciliacao' }
        ]}
      />

      <div className="mb-6 mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Conciliacao de fatura</h1>
          <p className="mt-1 text-sm text-gray-400">
            Compare a fatura importada com as compras ja lancadas no cartao e crie os
            pendentes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/financial/credit-cards/${accountId}/invoices`}>
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft size={16} />
              Voltar para faturas
            </Button>
          </Link>
        </div>
      </div>

      {loadingCard ? (
        <Card>
          <div className="h-40 animate-pulse rounded bg-[#1b212c]" />
        </Card>
      ) : !card ? (
        <Card>
          <div className="py-12 text-center text-gray-300">
            Nao foi possivel localizar o cartao selecionado.
          </div>
        </Card>
      ) : !reconciliationSourceType || !sourceConfig ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="text-amber-300" size={40} />
            <div className="text-lg font-semibold text-white">
              {sourceConfig?.unsupportedTitle || 'Conciliacao indisponivel para este cartao'}
            </div>
            <p className="max-w-2xl text-sm text-gray-400">
              {sourceConfig?.unsupportedDescription ||
                'No momento a conciliacao aceita apenas formatos homologados por banco.'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded-xl border border-gray-700 bg-[#11161d] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-400">
                  Arquivo da fatura
                </div>
                <div className="mt-3 rounded-xl border border-dashed border-gray-600 bg-[#0f141b] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-accent/30 bg-accent/10 p-2 text-accent">
                      <Upload size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">
                        {sourceConfig.selectLabel}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover">
                      <Upload size={14} />
                      Escolher arquivo
                      <input
                        type="file"
                        accept={sourceConfig.accept}
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-300">
                      {fileName || 'Nenhum arquivo escolhido'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-700 bg-[#11161d] p-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs uppercase tracking-[0.18em] text-gray-400">
                    Cartao selecionado
                  </span>
                  <span className="text-lg font-semibold text-white">{card.name}</span>
                  <span className="text-sm text-gray-400">
                    {card.bank?.name || card.bankName || 'Banco nao informado'}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-xs uppercase tracking-[0.18em] text-gray-400">
                      Fatura-alvo da conciliacao
                    </div>
                    <select
                      value={selectedTargetInvoiceKey}
                      onChange={(event) => handleTargetInvoiceChange(event.target.value)}
                      disabled={invoicesLoading || targetInvoiceOptions.length === 0}
                      className="w-full rounded border border-gray-700 bg-background px-3 py-2 text-sm text-white focus:border-accent focus:outline-none focus:ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {targetInvoiceOptions.length === 0 ? (
                        <option value="">
                          {invoicesLoading
                            ? 'Carregando referencias de fatura...'
                            : 'Nenhuma referencia disponivel'}
                        </option>
                      ) : (
                        targetInvoiceOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {getTargetInvoiceOptionLabel(option)}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <Button
                    variant="accent"
                    onClick={() => void runPreview()}
                    disabled={
                      !fileBase64 ||
                      previewLoading ||
                      invoicesLoading ||
                      !selectedTargetInvoice
                    }
                    className="flex shrink-0 items-center justify-center gap-2 xl:mt-5"
                  >
                    {previewLoading ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        Analisando
                      </>
                    ) : (
                      <>
                        <FileSearch size={16} />
                        Analisar fatura
                      </>
                    )}
                  </Button>
                </div>

                {selectedTargetInvoice && (
                  <div className="mt-3 text-xs text-gray-400">
                    Referencia escolhida:{' '}
                    <span className="text-gray-200">
                      {formatReference(
                        selectedTargetInvoice.referenceMonth,
                        selectedTargetInvoice.referenceYear
                      )}{' '}
                      • {getInvoiceDisplayStatusLabel(selectedTargetInvoice.status)} • vence{' '}
                      {formatCalendarDate(selectedTargetInvoice.dueDate)}
                      {selectedTargetInvoice.isProjected ? ' • projetada' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {preview && (
            <>
              <div className="grid gap-4 xl:grid-cols-4">
                <Card>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400">
                    Referencia
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatReference(
                      preview.statement.referenceMonth,
                      preview.statement.referenceYear
                    )}
                  </div>
                  <div className="mt-2 text-sm text-gray-400">
                    {sourceConfig.statementDateLabel} {formatCalendarDate(preview.statement.dueDate)}
                  </div>
                </Card>
                <Card>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400">
                    {sourceConfig.totalAmountLabel}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatCurrency(preview.statement.totalAmount)}
                  </div>
                  <div className="mt-2 text-sm text-gray-400">
                    {sourceConfig.parsedAmountLabel}: {formatCurrency(preview.statement.parsedNetAmount)}
                  </div>
                </Card>
                <Card>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400">
                    Pendentes
                  </div>
                  <div className="mt-2 text-xl font-semibold text-blue-200">
                    {preview.summary.pendingCount}
                  </div>
                  <div className="mt-2 text-sm text-gray-400">
                    {formatCurrency(preview.summary.pendingAmount)}
                  </div>
                </Card>
                <Card>
                  <div className="text-xs uppercase tracking-[0.18em] text-gray-400">
                    Ja conciliados
                  </div>
                  <div className="mt-2 text-xl font-semibold text-green-200">
                    {preview.summary.okCount}
                  </div>
                  <div className="mt-2 text-sm text-gray-400">
                    {formatCurrency(preview.summary.okAmount)}
                  </div>
                </Card>
              </div>

              <Card>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      Conferencia da conciliacao
                    </div>
                    <div className="mt-1 text-sm text-gray-400">
                      {preview.summary.similarCount} similar(es),{' '}
                      {preview.summary.notImportableCount} nao importavel(is) e{' '}
                      {preview.summary.importableCount} item(ns) importavel(is).
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={handleExportPreviewCsv}
                      disabled={commitLoading}
                      className="flex items-center gap-2"
                    >
                      <Download size={16} />
                      Exportar CSV
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSelectPending}
                      disabled={commitLoading}
                    >
                      Selecionar pendentes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSelectVisibleImportable}
                      disabled={commitLoading}
                    >
                      Selecionar visiveis
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedItemIds([])}
                      disabled={commitLoading}
                    >
                      Limpar selecao
                    </Button>
                    <Button
                      variant="accent"
                      onClick={() => void commitItems(selectedItemIds)}
                      disabled={
                        commitLoading ||
                        hasPendingSingleCommit ||
                        categoriesLoading ||
                        selectedItemIds.length === 0 ||
                        selectedDraftIssues.missingDescriptionCount > 0 ||
                        selectedDraftIssues.missingCategoryCount > 0
                      }
                    >
                      {commitLoading
                        ? 'Importando...'
                        : `Importar ${selectedItemIds.length} selecionado(s)`}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {filterButtons.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setStatusFilter(filter.value)}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        statusFilter === filter.value
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-gray-700 bg-[#11161d] text-gray-300 hover:border-accent hover:text-accent'
                      }`}
                    >
                      {filter.label} ({filter.count})
                    </button>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-gray-700 bg-[#11161d] px-4 py-3 text-sm text-gray-300">
                  Selecao atual: <span className="font-semibold text-white">{selectedItems.length}</span>{' '}
                  item(ns) somando <span className="font-semibold text-white">{formatCurrency(selectedAmount)}</span>.
                  A selecao inicial marca apenas os pendentes; itens similares podem ser marcados
                  manualmente ou vinculados a uma fixa recorrente.
                  {selectedDraftIssues.missingDescriptionCount > 0 && (
                    <span className="block pt-2 text-amber-300">
                      Revise {selectedDraftIssues.missingDescriptionCount} descricao(oes) antes de importar.
                    </span>
                  )}
                  {selectedDraftIssues.missingCategoryCount > 0 && (
                    <span className="block pt-1 text-amber-300">
                      Selecione categoria para {selectedDraftIssues.missingCategoryCount} item(ns) marcado(s).
                    </span>
                  )}
                  {categoriesLoading && (
                    <span className="block pt-1 text-gray-400">Carregando categorias...</span>
                  )}
                </div>
              </Card>

              <div className="space-y-4">
                {filteredItems.map((item) => {
                  const selectable = isManuallyImportable(item);
                  const linkableToFixed = canLinkToFixed(item);
                  const draft = getItemDraft(item);
                  const suggestionSourceLabel = getSuggestionSourceLabel(
                    item.categorySuggestion.source
                  );
                  const itemCommitLoading = committingItemIds.includes(item.id);
                  const missingDescription = selectable && !draft.description.trim();
                  const missingCategory = selectable && !draft.categoryId;
                  const localSelectionKey = localSystemSelections[item.id] || '';
                  const selectedSystemTransaction = localSelectionKey
                    ? targetInvoiceTransactionsByKey.get(localSelectionKey) || null
                    : null;
                  const otherLocalSelectionKeys = new Set(
                    Object.entries(localSystemSelections)
                      .filter(([entryItemId]) => entryItemId !== item.id)
                      .map(([, transactionKey]) => transactionKey)
                  );
                  const availableSystemTransactions =
                    item.matchedTransactions.length > 0
                      ? []
                      : targetInvoiceTransactions.filter((transaction) => {
                          if (transaction.isExternalCreditCardSettlement) {
                            return false;
                          }

                          const transactionKey = getSystemInvoiceTransactionKey(transaction);

                          if (transactionKey === localSelectionKey) {
                            return true;
                          }

                          if (previewMatchedTransactionKeys.has(transactionKey)) {
                            return false;
                          }

                          return !otherLocalSelectionKeys.has(transactionKey);
                        });
                  const bankDateLabel = item.purchaseDate
                    ? formatCalendarDate(item.purchaseDate)
                    : `Referencia ${formatReference(
                        preview.statement.referenceMonth,
                        preview.statement.referenceYear
                      )}`;

                  return (
                    <Card key={item.id} className="overflow-visible p-0">
                      <div className="grid divide-y divide-gray-700 xl:grid-cols-2 xl:divide-x xl:divide-y-0">
                        <div className="px-5 py-4">
                          <div className="mb-3 text-xs uppercase tracking-[0.22em] text-gray-500">
                            Na fatura do banco
                          </div>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedItemSet.has(item.id)}
                                disabled={!selectable || commitLoading || itemCommitLoading}
                                onChange={(event) =>
                                  handleToggleSelection(item.id, event.target.checked)
                                }
                                className="mt-1 h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                              />
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                    Item {item.sequence}
                                  </span>
                                  <span
                                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClasses(item.status)}`}
                                  >
                                    {getStatusLabel(item.status)}
                                  </span>
                                  <span className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300">
                                    {getSectionLabel(item.sourceSection)}
                                  </span>
                                </div>
                                <div className="mt-2 text-base font-semibold text-white">
                                  {item.sourceDescription}
                                </div>
                                <div className="mt-2 text-sm text-gray-400">
                                  {getReasonLabel(item)}
                                </div>
                                {item.nonImportableReason && (
                                  <div className="mt-2 text-sm text-amber-300">
                                    {item.nonImportableReason}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-col items-start gap-2 lg:items-end">
                              <div className="text-2xl font-semibold text-white">
                                {formatCurrency(item.amount)}
                              </div>
                              <div className="flex flex-wrap gap-2 lg:justify-end">
                                {linkableToFixed && (
                                  <Button
                                    variant="outline"
                                    onClick={() => void commitItems([item.id], 'LINK_FIXED')}
                                    disabled={
                                      commitLoading ||
                                      hasPendingSingleCommit ||
                                      itemCommitLoading
                                    }
                                    className="flex items-center gap-2 text-sm"
                                  >
                                    {itemCommitLoading && (
                                      <RefreshCw size={14} className="animate-spin" />
                                    )}
                                    {itemCommitLoading ? 'Salvando vinculo...' : 'Vincular a fixa'}
                                  </Button>
                                )}
                                {selectable && (
                                  <Button
                                    variant="outline"
                                    onClick={() => void commitItems([item.id])}
                                    disabled={
                                      commitLoading ||
                                      hasPendingSingleCommit ||
                                      categoriesLoading ||
                                      itemCommitLoading ||
                                      missingDescription ||
                                      missingCategory
                                    }
                                    className="flex items-center gap-2 text-sm"
                                  >
                                    {itemCommitLoading && (
                                      <RefreshCw size={14} className="animate-spin" />
                                    )}
                                    {itemCommitLoading ? 'Importando...' : 'Importar este item'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                Data da compra
                              </div>
                              <div className="mt-1 text-sm text-white">{bankDateLabel}</div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                Parcela
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {formatInstallmentLabel(
                                  item.installmentNumber,
                                  item.totalInstallments
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                Cartao na fatura
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {item.cardSuffix ? `Final ${item.cardSuffix}` : '-'}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                Correspondencias
                              </div>
                              <div className="mt-1 text-sm text-white">
                                {item.matchedTransactions.length}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-[#0f141b] px-5 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="text-xs uppercase tracking-[0.22em] text-gray-500">
                                No Zenit
                              </div>
                              <div className="mt-2 text-sm text-gray-400">
                                {selectedTargetInvoice
                                  ? `Fatura ${formatReference(
                                      selectedTargetInvoice.referenceMonth,
                                      selectedTargetInvoice.referenceYear
                                    )}`
                                  : 'Selecione a fatura-alvo'}
                              </div>
                            </div>
                            <span className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300">
                              {item.matchedTransactions.length > 0
                                ? `${item.matchedTransactions.length} relacionado(s)`
                                : 'Sem relacao atual'}
                            </span>
                          </div>

                          <div className="mt-4 space-y-3">
                            {item.matchedTransactions.length > 0 ? (
                              item.matchedTransactions.map((transaction) => (
                                <div
                                  key={`${item.id}-${transaction.matchKey}`}
                                  className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3"
                                >
                                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <div className="font-medium text-white">
                                          {transaction.description}
                                        </div>
                                        {transaction.matchSource === 'PROJECTED_FIXED' && (
                                          <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                                            Fixa projetada
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-1 text-sm text-gray-400">
                                        {transaction.matchSource === 'PROJECTED_FIXED'
                                          ? `Fechamento em ${formatCalendarDate(transaction.date)}`
                                          : `Compra em ${formatCalendarDate(transaction.date)}`}{' '}
                                        • parcela{' '}
                                        {formatInstallmentLabel(
                                          transaction.installmentNumber,
                                          transaction.totalInstallments
                                        )}
                                        {transaction.invoiceReference
                                          ? ` • fatura ${transaction.invoiceReference}`
                                          : ''}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <div className="text-sm font-semibold text-white">
                                        {formatCurrency(transaction.amount)}
                                      </div>
                                      {transaction.matchSource === 'TRANSACTION' &&
                                        transaction.id && (
                                          <Link
                                            href={`/financial/transactions/${transaction.id}`}
                                            className="text-sm font-medium text-accent hover:text-accent-hover"
                                          >
                                            Abrir
                                          </Link>
                                        )}
                                      {transaction.matchSource === 'PROJECTED_FIXED' &&
                                        transaction.fixedTemplateId && (
                                          <Link
                                            href={`/financial/fixed-transactions/${transaction.fixedTemplateId}`}
                                            className="text-sm font-medium text-accent hover:text-accent-hover"
                                          >
                                            Abrir fixa
                                          </Link>
                                        )}
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : targetInvoiceDetailLoading ? (
                              <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-6 text-sm text-gray-400">
                                Carregando itens da fatura do Zenit...
                              </div>
                            ) : selectedSystemTransaction ? (
                              <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="font-medium text-white">
                                        {selectedSystemTransaction.description}
                                      </div>
                                      {selectedSystemTransaction.isFixedProjection && (
                                        <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                                          Fixa projetada
                                        </span>
                                      )}
                                      {selectedSystemTransaction.category && (
                                        <span
                                          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                                          style={{
                                            backgroundColor:
                                              selectedSystemTransaction.category.color
                                          }}
                                        >
                                          {selectedSystemTransaction.category.name}
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-1 text-sm text-gray-400">
                                      {getSystemTransactionDateLabel(selectedSystemTransaction)} •
                                      parcela{' '}
                                      {formatInstallmentLabel(
                                        selectedSystemTransaction.installmentNumber ?? null,
                                        selectedSystemTransaction.totalInstallments ?? null
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-sm font-semibold text-white">
                                      {formatCurrency(selectedSystemTransaction.amount)}
                                    </div>
                                    {selectedSystemTransaction.id !== null && (
                                      <Link
                                        href={`/financial/transactions/${selectedSystemTransaction.id}`}
                                        className="text-sm font-medium text-accent hover:text-accent-hover"
                                      >
                                        Abrir
                                      </Link>
                                    )}
                                    {selectedSystemTransaction.id === null &&
                                      selectedSystemTransaction.fixedTemplateId && (
                                        <Link
                                          href={`/financial/fixed-transactions/${selectedSystemTransaction.fixedTemplateId}`}
                                          className="text-sm font-medium text-accent hover:text-accent-hover"
                                        >
                                          Abrir fixa
                                        </Link>
                                      )}
                                  </div>
                                </div>
                              </div>
                            ) : targetInvoiceDetail ? (
                              <div className="rounded-lg border border-dashed border-gray-700 bg-[#11161d] px-4 py-6 text-sm text-gray-400">
                                Nenhum item relacionado na fatura do Zenit para este lancamento.
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed border-gray-700 bg-[#11161d] px-4 py-6 text-sm text-gray-400">
                                A referencia selecionada ainda nao expoe itens da fatura do Zenit
                                para comparacao visual.
                              </div>
                            )}

                            {item.matchedTransactions.length === 0 && (
                              <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                                <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                  Selecionar contraparte na fatura do Zenit
                                </div>
                                <select
                                  value={localSelectionKey}
                                  onChange={(event) =>
                                    handleLocalSystemSelectionChange(item.id, event.target.value)
                                  }
                                  disabled={
                                    targetInvoiceDetailLoading ||
                                    (!selectedSystemTransaction &&
                                      availableSystemTransactions.length === 0)
                                  }
                                  className="mt-2 w-full rounded-lg border border-gray-700 bg-background px-3 py-2 text-sm text-white focus:border-accent focus:outline-none"
                                >
                                  <option value="">
                                    {availableSystemTransactions.length > 0
                                      ? 'Nenhum item selecionado'
                                      : 'Nenhum item disponivel'}
                                  </option>
                                  {availableSystemTransactions.map((transaction) => {
                                    const transactionDate = transaction.date || transaction.dueDate;

                                    return (
                                      <option
                                        key={getSystemInvoiceTransactionKey(transaction)}
                                        value={getSystemInvoiceTransactionKey(transaction)}
                                      >
                                        {`${transaction.description} • ${formatCurrency(
                                          transaction.amount
                                        )} • ${
                                          transactionDate
                                            ? formatCalendarDate(transactionDate)
                                            : 'sem data'
                                        } • ${formatInstallmentLabel(
                                          transaction.installmentNumber ?? null,
                                          transaction.totalInstallments ?? null
                                        )}`}
                                      </option>
                                    );
                                  })}
                                </select>
                                <div className="mt-2 text-sm text-gray-400">
                                  Comparacao visual apenas. O vinculo efetivo continua sendo
                                  definido pela conciliacao.
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {selectable && (
                        <div className="border-t border-gray-700 bg-[#0f141b] px-5 py-4">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                Descricao a lancar
                              </div>
                              <AutocompleteInput
                                value={draft.description}
                                onChange={(value) => handleDraftDescriptionChange(item.id, value)}
                                onSuggestionSelect={(suggestion) =>
                                  handleDraftSuggestionSelect(item.id, suggestion)
                                }
                                fetchSuggestions={fetchDescriptionSuggestions}
                                placeholder="Digite para buscar descricoes anteriores"
                                minLength={3}
                                maxSuggestions={10}
                                disabled={commitLoading || itemCommitLoading}
                                className="mt-2"
                              />
                              {missingDescription && (
                                <div className="mt-2 text-sm text-amber-300">
                                  Informe a descricao que deve ser salva no lancamento.
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                Categoria do lancamento
                              </div>
                              <div className="mt-2">
                                <CategorySelect
                                  categories={categories}
                                  value={draft.categoryId}
                                  onChange={(value) => handleDraftCategoryChange(item.id, value)}
                                  placeholder={
                                    categoriesLoading
                                      ? 'Carregando categorias...'
                                      : 'Selecione a categoria'
                                  }
                                  disabled={commitLoading || categoriesLoading || itemCommitLoading}
                                />
                              </div>
                              {suggestionSourceLabel && (
                                <div className="mt-2 text-sm text-gray-400">
                                  Sugestao inicial por {suggestionSourceLabel.toLowerCase()}.
                                </div>
                              )}
                              {item.categorySuggestion.reason && (
                                <div className="mt-1 text-sm text-gray-500">
                                  {item.categorySuggestion.reason}
                                </div>
                              )}
                              {missingCategory && (
                                <div className="mt-2 text-sm text-amber-300">
                                  Escolha a categoria antes de importar este item.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}

                {filteredItems.length === 0 && (
                  <Card>
                    <div className="py-10 text-center text-gray-400">
                      Nenhum item encontrado para o filtro atual.
                    </div>
                  </Card>
                )}
              </div>

              {commitResult && (
                <Card>
                  <div className="flex items-center gap-2 text-lg font-semibold text-white">
                    <CheckCircle2 size={18} className="text-green-300" />
                    Resultado do processamento
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-5">
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        Selecionados
                      </div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {commitResult.summary.selectedCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        Criados
                      </div>
                      <div className="mt-1 text-lg font-semibold text-green-200">
                        {commitResult.summary.createdCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        Vinculados a fixas
                      </div>
                      <div className="mt-1 text-lg font-semibold text-sky-200">
                        {commitResult.summary.linkedFixedCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        Duplicados ignorados
                      </div>
                      <div className="mt-1 text-lg font-semibold text-amber-200">
                        {commitResult.summary.skippedDuplicateCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                        Falhas
                      </div>
                      <div className="mt-1 text-lg font-semibold text-red-200">
                        {commitResult.summary.failedCount}
                      </div>
                    </div>
                  </div>

                  {commitResult.results.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {commitResult.results.map((result) => (
                        <div
                          key={`${result.itemId}-${result.status}`}
                          className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3 text-sm text-gray-300"
                        >
                          <span className="font-medium text-white">{result.itemId}</span>: {result.message}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}

export default function CreditCardReconciliationPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <CreditCardReconciliationPageInner />
    </PageGuard>
  );
}
