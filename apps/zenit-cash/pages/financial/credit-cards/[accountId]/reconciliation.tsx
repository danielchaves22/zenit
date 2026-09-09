import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Columns2,
  Download,
  FileSearch,
  RefreshCw,
  Rows3,
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
import { getInvoiceDisplayStatus, getInvoiceDisplayStatusLabel } from '@/utils/creditCards';
import { formatCalendarDate } from '@/utils/financialStatus';

type ReconciliationItemStatus = 'OK' | 'SIMILAR' | 'PENDING' | 'NOT_IMPORTABLE';
type ReconciliationReason =
  | 'EXACT'
  | 'MAPPED_FIXED'
  | 'AMBIGUOUS_EXACT'
  | 'INVOICE_DIVERGENCE'
  | 'AMOUNT_DIVERGENCE'
  | 'DATE_DIVERGENCE'
  | 'INSTALLMENT_DIVERGENCE'
  | 'NON_IMPORTABLE'
  | 'NO_MATCH';
type ReconciliationFilter = 'ALL' | ReconciliationItemStatus;
type ReconciliationSuggestionSource = 'RULE' | 'HISTORY' | 'AI';
type ReconciliationViewMode = 'DETAILED' | 'SIDE_BY_SIDE';
type ReconciliationMobilePanel = 'ZENIT' | 'FILE';

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
  occurrenceKey?: string | null;
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
  progress?: {
    itemId: string;
    identityKey: string;
    resolution:
      | 'PENDING'
      | 'IMPORTED'
      | 'LINKED_FIXED'
      | 'CONFIRMED_EXISTING'
      | 'IGNORED';
    resolutionData?: Record<string, unknown> | null;
    terminal?: boolean;
    transactionIds?: number[];
    resolvedAt?: string | null;
    resolvedBy?: number | null;
  } | null;
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
  statement: ReconciliationPreview['statement'];
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

type ReconciliationSessionStatus = 'OPEN' | 'COMPLETED';
type ReconciliationItemResolution = NonNullable<
  ReconciliationPreviewItem['progress']
>['resolution'];

interface ReconciliationSession {
  id: number;
  accountId: number;
  referenceYear: number;
  referenceMonth: number;
  sourceType: CreditCardReconciliationSourceType;
  fileName: string;
  fileHash: string;
  parserVersion?: number | null;
  status: ReconciliationSessionStatus;
  revision: number;
  createdBy: number;
  updatedBy?: number | null;
  completedAt?: string | null;
  completedBy?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ReconciliationProgress {
  totalCount: number;
  resolvedCount: number;
  pendingCount: number;
  importedCount: number;
  linkedFixedCount: number;
  confirmedExistingCount: number;
  ignoredCount: number;
}

interface ReconciliationWorkspace {
  session: ReconciliationSession | null;
  preview: ReconciliationPreview | null;
  progress: ReconciliationProgress | null;
  events: Array<{
    id: number;
    itemId?: string | null;
    userId?: number | null;
    action: string;
    details?: Record<string, unknown> | null;
    createdAt: string;
  }>;
  commitResult?: ReconciliationCommitResult | null;
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
    fileLabel: 'Arquivo da Caixa',
    sourceLabel: 'Arquivo Caixa',
    selectLabel: 'Selecionar arquivo da Caixa',
    helperText: 'Aceita o PDF da fatura fechada da Caixa ou um TXT copiado da fatura aberta.',
    accept: '.pdf,.txt',
    invalidFileMessage: 'Selecione um arquivo PDF ou TXT da fatura da Caixa',
    analyzeFileMessage: 'Selecione o arquivo da Caixa antes de analisar',
    unsupportedTitle: 'Conciliacao disponivel apenas para cartoes Caixa, Bradesco e Nubank',
    unsupportedDescription:
      'No momento a conciliacao aceita PDF ou TXT da Caixa e CSVs do Bradesco e Nubank.',
    statementDateLabel: 'Data de referencia',
    totalAmountLabel: 'Total do arquivo',
    parsedAmountLabel: 'Calculado do arquivo'
  },
  BRADESCO_CSV: {
    fileLabel: 'CSV do Bradesco',
    sourceLabel: 'CSV Bradesco',
    selectLabel: 'Selecionar CSV do Bradesco',
    helperText: 'Somente o layout atual de exportacao CSV do Bradesco e suportado neste momento.',
    accept: '.csv',
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
    accept: '.csv',
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

function getResolutionLabel(resolution: ReconciliationItemResolution) {
  switch (resolution) {
    case 'IMPORTED':
      return 'Importado';
    case 'LINKED_FIXED':
      return 'Fixa vinculada';
    case 'CONFIRMED_EXISTING':
      return 'Existente confirmado';
    case 'IGNORED':
      return 'Ignorado';
    default:
      return 'A conferir';
  }
}

function getCommitResultStatusLabel(
  status: ReconciliationCommitResult['results'][number]['status']
) {
  switch (status) {
    case 'CREATED':
      return 'Criado';
    case 'LINKED_FIXED':
      return 'Vinculado a fixa';
    case 'SKIPPED_DUPLICATE':
      return 'Duplicidade encontrada';
    case 'SKIPPED_NOT_IMPORTABLE':
      return 'Nao importavel';
    default:
      return 'Falhou';
  }
}

function isSuccessfulCommitStatus(
  status: ReconciliationCommitResult['results'][number]['status']
) {
  return status === 'CREATED' || status === 'LINKED_FIXED';
}

function isSuccessfulCommitResult(
  result: ReconciliationCommitResult['results'][number],
  resultPreview: ReconciliationPreview | null
) {
  if (isSuccessfulCommitStatus(result.status)) {
    return true;
  }

  return Boolean(
    result.status === 'SKIPPED_DUPLICATE' &&
      resultPreview?.items.some(
        (item) =>
          item.id === result.itemId &&
          getItemResolution(item) === 'LINKED_FIXED'
      )
  );
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
    case 'AMOUNT_DIVERGENCE':
      return 'Mesma data, mesma parcela e mesma fatura, mas com pequena divergencia de valor.';
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
    if (option.status === 'PAID') {
      return;
    }

    if (!optionsByKey.has(option.key)) {
      optionsByKey.set(option.key, {
        ...option,
        status: getInvoiceDisplayStatus(option.status, option.dueDate)
      });
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
  return (
    item.canImport &&
    item.status !== 'OK' &&
    (!item.progress || item.progress.resolution === 'PENDING')
  );
}

function getItemResolution(item: ReconciliationPreviewItem): ReconciliationItemResolution {
  if (item.progress?.resolution) {
    return item.progress.resolution;
  }

  // Match classification is only a suggestion. Resolution advances exclusively
  // when the persisted workspace contains an explicit human checkpoint.
  return 'PENDING';
}

function canIgnoreItem(item: ReconciliationPreviewItem) {
  return (
    item.status !== 'NOT_IMPORTABLE' &&
    item.canImport &&
    getItemResolution(item) === 'PENDING'
  );
}

function buildProgressFromPreview(preview: ReconciliationPreview | null): ReconciliationProgress | null {
  if (!preview) {
    return null;
  }

  const resolutions = preview.items.map(getItemResolution);
  const count = (resolution: ReconciliationItemResolution) =>
    resolutions.filter((value) => value === resolution).length;
  const resolvedCount = preview.items.filter(
    (item) =>
      item.progress?.terminal ||
      item.status === 'NOT_IMPORTABLE' ||
      getItemResolution(item) !== 'PENDING'
  ).length;
  const pendingCount = resolutions.length - resolvedCount;

  return {
    totalCount: resolutions.length,
    resolvedCount,
    pendingCount,
    importedCount: count('IMPORTED'),
    linkedFixedCount: count('LINKED_FIXED'),
    confirmedExistingCount: count('CONFIRMED_EXISTING'),
    ignoredCount: count('IGNORED')
  };
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
    getItemResolution(item) === 'PENDING' &&
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

  if (
    transaction.isFixedProjection &&
    transaction.fixedTemplateId !== null &&
    transaction.fixedTemplateId !== undefined &&
    transaction.occurrenceKey
  ) {
    return `projected-fixed:${transaction.fixedTemplateId}:${transaction.occurrenceKey}`;
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
    transaction.fixedTemplateId !== null &&
    transaction.occurrenceKey
  ) {
    return `projected-fixed:${transaction.fixedTemplateId}:${transaction.occurrenceKey}`;
  }

  return null;
}

function getSystemInvoiceTransactionAliases(
  transaction: ReconciliationInvoiceSystemTransaction
) {
  const aliases: string[] = [];

  if (transaction.id !== null) {
    aliases.push(`transaction:${transaction.id}`);
  }

  if (transaction.occurrenceKey) {
    aliases.push(`occurrence:${transaction.occurrenceKey}`);
  }

  if (
    transaction.isFixedProjection &&
    transaction.fixedTemplateId !== null &&
    transaction.fixedTemplateId !== undefined &&
    transaction.occurrenceKey
  ) {
    aliases.push(`projected-fixed:${transaction.fixedTemplateId}:${transaction.occurrenceKey}`);
  }

  return Array.from(new Set(aliases));
}

function getMatchedTransactionSystemAliases(transaction: ReconciliationMatchedTransaction) {
  const aliases: string[] = [];
  const transactionKey = getMatchedTransactionSystemKey(transaction);

  if (transactionKey) {
    aliases.push(transactionKey);
  }

  if (transaction.occurrenceKey) {
    aliases.push(`occurrence:${transaction.occurrenceKey}`);
  }

  return Array.from(new Set(aliases));
}

interface PreviewItemSystemMatchResolution {
  rowIds: Set<string>;
  outsideTargetCount: number;
  unresolvedCount: number;
  hasIdentityCollision: boolean;
}

function resolvePreviewItemSystemMatches(params: {
  item: ReconciliationPreviewItem;
  localSelectionKey?: string;
  rowIdsByIdentityKey: Map<string, Set<string>>;
  targetInvoiceReference?: string | null;
}): PreviewItemSystemMatchResolution {
  const rowIds = new Set<string>();
  let outsideTargetCount = 0;
  let unresolvedCount = 0;
  let hasIdentityCollision = false;

  const addResolvedRows = (resolvedRowIds: Set<string> | undefined) => {
    if (!resolvedRowIds || resolvedRowIds.size === 0) {
      return false;
    }

    if (resolvedRowIds.size > 1) {
      hasIdentityCollision = true;
    }

    resolvedRowIds.forEach((rowId) => rowIds.add(rowId));
    return true;
  };

  if (params.localSelectionKey) {
    if (!addResolvedRows(params.rowIdsByIdentityKey.get(params.localSelectionKey))) {
      unresolvedCount = 1;
    }

    return {
      rowIds,
      outsideTargetCount,
      unresolvedCount,
      hasIdentityCollision
    };
  }

  params.item.matchedTransactions.forEach((transaction) => {
    const primaryKey = getMatchedTransactionSystemKey(transaction);
    if (primaryKey && addResolvedRows(params.rowIdsByIdentityKey.get(primaryKey))) {
      return;
    }

    const occurrenceKey = transaction.occurrenceKey
      ? `occurrence:${transaction.occurrenceKey}`
      : null;
    if (occurrenceKey && addResolvedRows(params.rowIdsByIdentityKey.get(occurrenceKey))) {
      return;
    }

    if (
      params.targetInvoiceReference &&
      transaction.invoiceReference &&
      transaction.invoiceReference !== params.targetInvoiceReference
    ) {
      outsideTargetCount += 1;
      return;
    }

    unresolvedCount += 1;
  });

  return {
    rowIds,
    outsideTargetCount,
    unresolvedCount,
    hasIdentityCollision
  };
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

function hasAnyFileExtension(fileName: string, extensions: string[]) {
  const normalizedFileName = fileName.toLowerCase();

  return extensions.some((extension) => normalizedFileName.endsWith(extension));
}

function isPdfOrTxtStatementFile(file: File) {
  const fileType = file.type.toLowerCase();

  return (
    hasAnyFileExtension(file.name, ['.pdf', '.txt']) ||
    fileType === 'application/pdf' ||
    fileType === 'text/plain' ||
    fileType === 'application/octet-stream'
  );
}

function isCsvStatementFile(file: File) {
  const fileType = file.type.toLowerCase();

  return (
    hasAnyFileExtension(file.name, ['.csv']) ||
    fileType === 'text/csv' ||
    fileType === 'application/csv' ||
    fileType === 'application/vnd.ms-excel' ||
    fileType === 'application/octet-stream'
  );
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

interface SystemInvoiceTransactionRow {
  rowId: string;
  transactionKey: string;
  aliases: string[];
  transaction: ReconciliationInvoiceSystemTransaction;
}

interface CreditCardReconciliationSideBySideProps {
  preview: ReconciliationPreview;
  rows: SystemInvoiceTransactionRow[];
  identityCollisionRowIds: Set<string>;
  items: ReconciliationPreviewItem[];
  filteredItemIds: Set<string>;
  selectedItemSet: Set<string>;
  focusedPreviewItemId: string | null;
  highlightedSystemTransactionRowIds: Set<string>;
  resolvedSystemTransactionIds: Set<number>;
  focusedMatchOutsideTargetCount: number;
  focusedMatchUnresolvedCount: number;
  focusedMatchHasIdentityCollision: boolean;
  focusedSelectedSystemTransactionKey: string;
  sessionStatus: ReconciliationSessionStatus;
  targetInvoiceDetailLoading: boolean;
  targetInvoiceDetailAvailable: boolean;
  targetInvoiceDetailError: string | null;
  selectedTargetInvoice: TargetInvoiceOption | null;
  commitLoading: boolean;
  committingItemIds: string[];
  decisionItemIds: string[];
  sessionActionLoading: boolean;
  sessionTargetReady: boolean;
  mobilePanel: ReconciliationMobilePanel;
  itemRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  systemTransactionRefs: React.MutableRefObject<Record<string, HTMLLIElement | null>>;
  comparisonStatusRef: React.MutableRefObject<HTMLDivElement | null>;
  onMobilePanelChange: (panel: ReconciliationMobilePanel) => void;
  onSelectPreviewItem: (itemId: string) => void;
  onSelectSystemTransaction: (itemId: string, transactionKey: string) => void;
  onToggleImportSelection: (itemId: string, checked: boolean) => void;
  onConfirmExisting: (itemId: string, transactionId: number) => void;
  onIgnore: (itemId: string) => void;
  onRestore: (itemId: string) => void;
  onRetryTargetInvoiceDetail: () => void;
}

function CreditCardReconciliationSideBySide({
  preview,
  rows,
  identityCollisionRowIds,
  items,
  filteredItemIds,
  selectedItemSet,
  focusedPreviewItemId,
  highlightedSystemTransactionRowIds,
  resolvedSystemTransactionIds,
  focusedMatchOutsideTargetCount,
  focusedMatchUnresolvedCount,
  focusedMatchHasIdentityCollision,
  focusedSelectedSystemTransactionKey,
  sessionStatus,
  targetInvoiceDetailLoading,
  targetInvoiceDetailAvailable,
  targetInvoiceDetailError,
  selectedTargetInvoice,
  commitLoading,
  committingItemIds,
  decisionItemIds,
  sessionActionLoading,
  sessionTargetReady,
  mobilePanel,
  itemRefs,
  systemTransactionRefs,
  comparisonStatusRef,
  onMobilePanelChange,
  onSelectPreviewItem,
  onSelectSystemTransaction,
  onToggleImportSelection,
  onConfirmExisting,
  onIgnore,
  onRestore,
  onRetryTargetInvoiceDetail
}: CreditCardReconciliationSideBySideProps) {
  const focusedItem = focusedPreviewItemId
    ? preview.items.find((item) => item.id === focusedPreviewItemId) || null
    : null;
  const highlightedRows = rows.filter((row) =>
    highlightedSystemTransactionRowIds.has(row.rowId)
  );
  const selectedSystemRow = focusedSelectedSystemTransactionKey
    ? rows.find((row) => row.transactionKey === focusedSelectedSystemTransactionKey) || null
    : null;
  const focusedResolution = focusedItem ? getItemResolution(focusedItem) : null;
  const focusedDecisionLoading = focusedItem
    ? decisionItemIds.includes(focusedItem.id)
    : false;
  const mutationInFlight =
    !sessionTargetReady ||
    commitLoading ||
    committingItemIds.length > 0 ||
    decisionItemIds.length > 0 ||
    sessionActionLoading;
  const focusedItemOutsideFilter = focusedItem
    ? !filteredItemIds.has(focusedItem.id)
    : false;
  const focusedMatchStatusMessage = (() => {
    if (focusedItem === null) {
      return 'Selecione um item da fatura para comparar.';
    }

    if (targetInvoiceDetailLoading) {
      return 'Carregando os lançamentos do Zenit para localizar a correspondência.';
    }

    if (targetInvoiceDetailError) {
      return 'Não foi possível verificar a correspondência nos lançamentos do Zenit.';
    }

    if (!targetInvoiceDetailAvailable) {
      return 'Os lançamentos do Zenit não estão disponíveis para verificar a correspondência.';
    }

    if (focusedMatchHasIdentityCollision) {
      return 'A identidade da possível correspondência aparece em mais de um lançamento do Zenit. Revise os lançamentos destacados.';
    }

    if (highlightedRows.length === 0) {
      if (focusedMatchOutsideTargetCount > 0 && focusedMatchUnresolvedCount > 0) {
        return 'Há possíveis correspondências fora da fatura-alvo e outras que não estão disponíveis nos lançamentos carregados.';
      }

      if (focusedMatchOutsideTargetCount > 0) {
        return 'A possível correspondência foi localizada fora da fatura-alvo selecionada.';
      }

      if (focusedMatchUnresolvedCount > 0) {
        return 'A possível correspondência foi indicada, mas não está disponível nos lançamentos carregados.';
      }

      return 'Nenhuma correspondência foi encontrada no Zenit para este item.';
    }

    if (highlightedRows.length > 1) {
      return `Mais de uma correspondência foi encontrada. Revise os ${highlightedRows.length} lançamentos destacados.`;
    }

    if (focusedItem.status === 'OK') {
      return 'Correspondência encontrada e classificada como OK.';
    }

    return `Possível correspondência destacada. ${getReasonLabel(focusedItem)}`;
  })();

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Painel da comparação"
        className="grid grid-cols-2 rounded-xl border border-gray-700 bg-[#11161d] p-1 lg:hidden"
      >
        <button
          type="button"
          aria-pressed={mobilePanel === 'FILE'}
          onClick={() => onMobilePanelChange('FILE')}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            mobilePanel === 'FILE'
              ? 'bg-accent text-white'
              : 'text-gray-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          Fatura
        </button>
        <button
          type="button"
          aria-pressed={mobilePanel === 'ZENIT'}
          onClick={() => onMobilePanelChange('ZENIT')}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            mobilePanel === 'ZENIT'
              ? 'bg-accent text-white'
              : 'text-gray-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          Zenit
        </button>
      </div>

      <div className="grid h-[clamp(32rem,68vh,46rem)] min-h-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section
          className={`${mobilePanel === 'FILE' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-gray-700 bg-surface shadow-md lg:flex`}
        >
          <div className="shrink-0 border-b border-gray-700 bg-surface px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Itens do arquivo da fatura</h2>
                <p className="mt-1 text-sm text-gray-400">
                  Selecione um item para localizar sua possível correspondência no Zenit.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300">
                {items.length}
              </span>
            </div>
          </div>

          <div
            role="region"
            aria-label="Itens do arquivo da fatura"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
          >
            {items.length > 0 ? (
              <ul aria-label="Itens analisados do arquivo da fatura" className="space-y-2">
                {items.map((item) => {
                  const selectable = isManuallyImportable(item);
                  const itemCommitLoading = committingItemIds.includes(item.id);
                  const isSelected = focusedPreviewItemId === item.id;
                  const isOutsideFilter = !filteredItemIds.has(item.id);
                  const bankDateLabel = item.purchaseDate
                    ? formatCalendarDate(item.purchaseDate)
                    : `Referência ${formatReference(
                        preview.statement.referenceMonth,
                        preview.statement.referenceYear
                      )}`;

                  return (
                    <li
                      key={item.id}
                      data-reconciliation-item-id={item.id}
                      className={`rounded-lg border px-4 py-3 transition-colors focus-within:border-accent ${
                        isSelected
                          ? 'border-accent bg-accent/10 ring-1 ring-accent/30'
                          : 'border-gray-700 bg-[#11161d]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar item ${item.sequence} para importação`}
                          checked={selectedItemSet.has(item.id)}
                          disabled={
                            !selectable ||
                            mutationInFlight ||
                            sessionStatus === 'COMPLETED'
                          }
                          onChange={(event) =>
                            onToggleImportSelection(item.id, event.target.checked)
                          }
                          className="mt-1 h-4 w-4 shrink-0 rounded border-gray-600 bg-background text-accent focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <button
                          ref={(node) => {
                            itemRefs.current[item.id] = node;
                          }}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => onSelectPreviewItem(item.id)}
                          className="min-w-0 flex-1 text-left focus:outline-none"
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-xs uppercase tracking-[0.16em] text-gray-500">
                                  Item {item.sequence}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusClasses(item.status)}`}
                                >
                                  {getStatusLabel(item.status)}
                                </span>
                                <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
                                  {getSectionLabel(item.sourceSection)}
                                </span>
                                {getItemResolution(item) !== 'PENDING' && (
                                  <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-200">
                                    {getResolutionLabel(getItemResolution(item))}
                                  </span>
                                )}
                                {isOutsideFilter && (
                                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                                    Fora do filtro atual
                                  </span>
                                )}
                              </span>
                              <span className="mt-2 block font-medium text-white">
                                {item.sourceDescription}
                              </span>
                              <span className="mt-1 block text-sm text-gray-400">
                                {bankDateLabel} • parcela{' '}
                                {formatInstallmentLabel(
                                  item.installmentNumber,
                                  item.totalInstallments
                                )}
                                {item.cardSuffix ? ` • cartão final ${item.cardSuffix}` : ''}
                              </span>
                              <span className="mt-2 block text-sm text-gray-400">
                                {getReasonLabel(item)}
                              </span>
                              {item.nonImportableReason && (
                                <span className="mt-1 block text-sm text-amber-300">
                                  {item.nonImportableReason}
                                </span>
                              )}
                              {isSelected && (
                                <>
                                  <span className="mt-2 block text-xs font-medium text-accent">
                                    {focusedMatchStatusMessage}
                                  </span>
                                  <span className="sr-only">
                                    Item selecionado para comparação.
                                  </span>
                                </>
                              )}
                            </span>
                            <span className="shrink-0 text-right">
                              <span className="block font-semibold text-white">
                                {formatCurrency(item.amount)}
                              </span>
                              {itemCommitLoading && (
                                <span className="mt-1 flex items-center justify-end gap-1 text-xs text-gray-400">
                                  <RefreshCw size={12} className="animate-spin" />
                                  Processando
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 bg-[#11161d] px-4 py-8 text-center text-sm text-gray-400">
                Nenhum item encontrado para o filtro atual.
              </div>
            )}
          </div>
        </section>

        <section
          className={`${mobilePanel === 'ZENIT' ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-gray-700 bg-surface shadow-md lg:flex`}
        >
          <div className="shrink-0 border-b border-gray-700 bg-surface px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-white">Lançamentos da fatura no Zenit</h2>
                <p className="mt-1 text-sm text-gray-400">
                  {selectedTargetInvoice
                    ? `Fatura ${formatReference(
                        selectedTargetInvoice.referenceMonth,
                        selectedTargetInvoice.referenceYear
                      )}.`
                    : 'Selecione a fatura-alvo.'}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-300">
                {rows.length}
              </span>
            </div>

            <div
              ref={comparisonStatusRef}
              role="status"
              aria-live="polite"
              tabIndex={-1}
              className={`mt-3 rounded-lg border px-3 py-2 text-sm ${
                focusedItem === null || targetInvoiceDetailLoading
                  ? 'border-gray-700 bg-[#11161d] text-gray-400'
                  : targetInvoiceDetailError
                    ? 'border-red-500/40 bg-red-500/10 text-red-200'
                    : !targetInvoiceDetailAvailable
                      ? 'border-gray-700 bg-[#11161d] text-gray-400'
                      : focusedMatchHasIdentityCollision
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                        : highlightedRows.length === 0
                          ? 'border-gray-700 bg-[#11161d] text-gray-300'
                          : highlightedRows.length > 1
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                            : focusedItem.status === 'OK'
                              ? 'border-green-500/40 bg-green-500/10 text-green-200'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
              }`}
            >
              {focusedMatchStatusMessage}
              {!targetInvoiceDetailLoading &&
                !targetInvoiceDetailError &&
                focusedMatchOutsideTargetCount > 0 &&
                highlightedRows.length > 0 && (
                  <span className="block pt-1 text-xs">
                    {focusedMatchOutsideTargetCount === 1
                      ? 'Há também uma correspondência fora da fatura-alvo.'
                      : `Há também ${focusedMatchOutsideTargetCount} correspondências fora da fatura-alvo.`}
                  </span>
                )}
              {!targetInvoiceDetailLoading &&
                !targetInvoiceDetailError &&
                focusedMatchUnresolvedCount > 0 &&
                highlightedRows.length > 0 && (
                  <span className="block pt-1 text-xs">
                    {focusedMatchUnresolvedCount === 1
                      ? 'Há também uma correspondência indisponível nos lançamentos carregados.'
                      : `Há também ${focusedMatchUnresolvedCount} correspondências indisponíveis nos lançamentos carregados.`}
                  </span>
                )}
            </div>
            {focusedItem && sessionStatus === 'OPEN' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {focusedResolution === 'PENDING' &&
                  focusedItem.status !== 'NOT_IMPORTABLE' &&
                  selectedSystemRow?.transaction.id && (
                  <Button
                    variant="accent"
                    onClick={() =>
                      onConfirmExisting(focusedItem.id, selectedSystemRow.transaction.id as number)
                    }
                    disabled={mutationInFlight || focusedDecisionLoading}
                  >
                    {focusedDecisionLoading
                      ? 'Salvando...'
                      : 'Confirmar correspondencia existente'}
                  </Button>
                )}
                {canIgnoreItem(focusedItem) && (
                  <Button
                    variant="outline"
                    onClick={() => onIgnore(focusedItem.id)}
                    disabled={mutationInFlight || focusedDecisionLoading}
                  >
                    {focusedDecisionLoading ? 'Salvando...' : 'Ignorar item'}
                  </Button>
                )}
                {focusedResolution === 'IGNORED' && (
                  <Button
                    variant="outline"
                    onClick={() => onRestore(focusedItem.id)}
                    disabled={mutationInFlight || focusedDecisionLoading}
                  >
                    {focusedDecisionLoading ? 'Salvando...' : 'Voltar a conferir'}
                  </Button>
                )}
              </div>
            )}
          </div>

          <div
            role="region"
            aria-label="Lançamentos da fatura no Zenit"
            tabIndex={0}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
          >
            {targetInvoiceDetailLoading ? (
              <div className="space-y-2" aria-label="Carregando lançamentos do Zenit">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="h-24 animate-pulse rounded-lg bg-[#1b212c]" />
                ))}
              </div>
            ) : targetInvoiceDetailError ? (
              <div
                role="alert"
                className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-5 text-sm text-red-200"
              >
                <div>{targetInvoiceDetailError}</div>
                <button
                  type="button"
                  onClick={onRetryTargetInvoiceDetail}
                  className="mt-3 rounded-lg border border-red-400/50 px-3 py-1.5 font-medium text-red-100 transition-colors hover:bg-red-500/10"
                >
                  Tentar novamente
                </button>
              </div>
            ) : rows.length > 0 ? (
              <ul aria-label="Lançamentos analisados no Zenit" className="space-y-2">
                {rows.map(({ rowId, transactionKey, transaction }) => {
                  const isHighlighted = highlightedSystemTransactionRowIds.has(rowId);
                  const isAmbiguousHighlight = isHighlighted && highlightedRows.length > 1;
                  const hasIdentityCollision = identityCollisionRowIds.has(rowId);
                  const isExternalSettlement = Boolean(
                    transaction.isExternalCreditCardSettlement
                  );
                  const isAlreadyClaimed = Boolean(
                    transaction.id && resolvedSystemTransactionIds.has(transaction.id)
                  );
                  const canSelect =
                    Boolean(focusedItem) && !isExternalSettlement && !isAlreadyClaimed;

                  return (
                    <li
                      key={rowId}
                      ref={(node) => {
                        systemTransactionRefs.current[rowId] = node;
                      }}
                      tabIndex={-1}
                      data-reconciliation-transaction-key={transactionKey}
                      data-reconciliation-highlighted={isHighlighted}
                      className={`rounded-lg border px-4 py-3 transition-colors ${
                        isHighlighted
                          ? isAmbiguousHighlight || focusedItem?.status !== 'OK'
                            ? 'border-amber-400/70 bg-amber-500/10 ring-1 ring-amber-400/30'
                            : 'border-green-400/70 bg-green-500/10 ring-1 ring-green-400/30'
                          : 'border-gray-700 bg-[#11161d]'
                      }`}
                    >
                      <button
                        type="button"
                        aria-pressed={
                          focusedSelectedSystemTransactionKey === transactionKey
                        }
                        disabled={
                          !canSelect ||
                          mutationInFlight ||
                          sessionStatus === 'COMPLETED'
                        }
                        onClick={() => {
                          if (focusedItem) {
                            onSelectSystemTransaction(focusedItem.id, transactionKey);
                          }
                        }}
                        className="flex w-full items-start justify-between gap-3 text-left disabled:cursor-default"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-white">{transaction.description}</div>
                          <div className="mt-1 text-sm text-gray-400">
                            {getSystemTransactionDateLabel(transaction)} • parcela{' '}
                            {formatInstallmentLabel(
                              transaction.installmentNumber ?? null,
                              transaction.totalInstallments ?? null
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {transaction.isFixedProjection && (
                              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                                Fixa projetada
                              </span>
                            )}
                            {isExternalSettlement && (
                              <span className="rounded-full border border-gray-600 bg-gray-500/10 px-2 py-0.5 text-[11px] font-medium text-gray-300">
                                Liquidada fora do sistema
                              </span>
                            )}
                            {isAlreadyClaimed && (
                              <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-200">
                                Ja utilizado nesta conciliacao
                              </span>
                            )}
                            {hasIdentityCollision && (
                              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                                Identidade duplicada
                              </span>
                            )}
                            {transaction.category && (
                              <span
                                className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                                style={{ backgroundColor: transaction.category.color }}
                              >
                                {transaction.category.name}
                              </span>
                            )}
                          </div>
                          {isHighlighted && (
                            <span className="sr-only">
                              Correspondência destacada para o item selecionado da fatura.
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-white">
                          {formatCurrency(transaction.amount)}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="rounded-lg border border-dashed border-gray-700 bg-[#11161d] px-4 py-8 text-center text-sm text-gray-400">
                {targetInvoiceDetailAvailable
                  ? 'A fatura selecionada não possui lançamentos no Zenit.'
                  : 'Os lançamentos da fatura selecionada não estão disponíveis para comparação.'}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
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
  const [session, setSession] = useState<ReconciliationSession | null>(null);
  const [sessionProgress, setSessionProgress] = useState<ReconciliationProgress | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionReadyTargetKey, setSessionReadyTargetKey] = useState('');
  const [sessionActionLoading, setSessionActionLoading] = useState<
    'START' | 'STATUS' | 'RESET' | null
  >(null);
  const [decisionItemIds, setDecisionItemIds] = useState<string[]>([]);
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
  const [targetInvoiceDetailError, setTargetInvoiceDetailError] = useState<string | null>(null);
  const [localSystemSelections, setLocalSystemSelections] = useState<Record<string, string>>({});
  const [reconciliationViewMode, setReconciliationViewMode] =
    useState<ReconciliationViewMode>('DETAILED');
  const [focusedPreviewItemId, setFocusedPreviewItemId] = useState<string | null>(null);
  const [reconciliationMobilePanel, setReconciliationMobilePanel] =
    useState<ReconciliationMobilePanel>('FILE');
  const commitInFlightItemIdsRef = useRef<Set<string>>(new Set());
  const batchCommitInFlightRef = useRef(false);
  const targetInvoiceDetailRequestIdRef = useRef(0);
  const sessionRequestIdRef = useRef(0);
  const selectedTargetInvoiceKeyRef = useRef(selectedTargetInvoiceKey);
  const fileReadRequestIdRef = useRef(0);
  const previewRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const comparisonItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const systemTransactionRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const comparisonStatusRef = useRef<HTMLDivElement | null>(null);

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
  const targetInvoiceTransactionRows = useMemo<SystemInvoiceTransactionRow[]>(
    () => {
      const keyOccurrences = new Map<string, number>();

      return targetInvoiceTransactions.map((transaction) => {
        const transactionKey = getSystemInvoiceTransactionKey(transaction);
        const keyOccurrence = (keyOccurrences.get(transactionKey) || 0) + 1;
        keyOccurrences.set(transactionKey, keyOccurrence);

        return {
          rowId:
            keyOccurrence === 1
              ? transactionKey
              : `${transactionKey}:duplicate:${keyOccurrence}`,
          transactionKey,
          aliases: getSystemInvoiceTransactionAliases(transaction),
          transaction
        };
      });
    },
    [targetInvoiceTransactions]
  );
  const targetInvoiceTransactionsByKey = useMemo(() => {
    const transactionsByKey = new Map<string, ReconciliationInvoiceSystemTransaction>();
    const duplicateKeys = new Set<string>();

    targetInvoiceTransactions.forEach((transaction) => {
      const transactionKey = getSystemInvoiceTransactionKey(transaction);

      if (transactionsByKey.has(transactionKey)) {
        transactionsByKey.delete(transactionKey);
        duplicateKeys.add(transactionKey);
        return;
      }

      if (!duplicateKeys.has(transactionKey)) {
        transactionsByKey.set(transactionKey, transaction);
      }
    });

    return transactionsByKey;
  }, [targetInvoiceTransactions]);
  const targetInvoiceRowIdsByIdentityKey = useMemo(() => {
    const rowIdsByIdentityKey = new Map<string, Set<string>>();

    targetInvoiceTransactionRows.forEach((row) => {
      new Set([row.transactionKey, ...row.aliases]).forEach((identityKey) => {
        const rowIds = rowIdsByIdentityKey.get(identityKey) || new Set<string>();
        rowIds.add(row.rowId);
        rowIdsByIdentityKey.set(identityKey, rowIds);
      });
    });

    return rowIdsByIdentityKey;
  }, [targetInvoiceTransactionRows]);
  const identityCollisionRowIds = useMemo(() => {
    const collisionRowIds = new Set<string>();

    targetInvoiceRowIdsByIdentityKey.forEach((rowIds) => {
      if (rowIds.size > 1) {
        rowIds.forEach((rowId) => collisionRowIds.add(rowId));
      }
    });

    return collisionRowIds;
  }, [targetInvoiceRowIdsByIdentityKey]);
  const previewMatchedTransactionKeys = useMemo(() => {
    if (!preview) {
      return new Set<string>();
    }

    return preview.items.reduce((keys, item) => {
      item.matchedTransactions.forEach((transaction) => {
        getMatchedTransactionSystemAliases(transaction).forEach((alias) => keys.add(alias));
      });
      return keys;
    }, new Set<string>());
  }, [preview]);
  const resolvedSystemTransactionIds = useMemo(() => {
    if (!preview) {
      return new Set<number>();
    }

    return preview.items.reduce((transactionIds, item) => {
      if (getItemResolution(item) !== 'PENDING') {
        item.progress?.transactionIds?.forEach((transactionId) =>
          transactionIds.add(transactionId)
        );
      }

      return transactionIds;
    }, new Set<number>());
  }, [preview]);

  const previewItemSystemMatchResolutions = useMemo(() => {
    const resolutions = new Map<string, PreviewItemSystemMatchResolution>();

    if (!preview) {
      return resolutions;
    }

    preview.items.forEach((item) => {
      resolutions.set(
        item.id,
        resolvePreviewItemSystemMatches({
          item,
          localSelectionKey: localSystemSelections[item.id],
          rowIdsByIdentityKey: targetInvoiceRowIdsByIdentityKey,
          targetInvoiceReference: selectedTargetInvoice
            ? formatReference(
                selectedTargetInvoice.referenceMonth,
                selectedTargetInvoice.referenceYear
              )
            : null
        })
      );
    });

    return resolutions;
  }, [
    localSystemSelections,
    preview,
    selectedTargetInvoice,
    targetInvoiceRowIdsByIdentityKey
  ]);

  const focusedMatchResolution = useMemo<PreviewItemSystemMatchResolution>(() => {
    if (focusedPreviewItemId) {
      const resolution = previewItemSystemMatchResolutions.get(focusedPreviewItemId);
      if (resolution) {
        return resolution;
      }
    }

    return {
      rowIds: new Set<string>(),
      outsideTargetCount: 0,
      unresolvedCount: 0,
      hasIdentityCollision: false
    };
  }, [focusedPreviewItemId, previewItemSystemMatchResolutions]);

  const filteredItems = useMemo(() => {
    if (!preview) {
      return [];
    }

    if (statusFilter === 'ALL') {
      return preview.items;
    }

    return preview.items.filter((item) => item.status === statusFilter);
  }, [preview, statusFilter]);

  const filteredItemIds = useMemo(
    () => new Set(filteredItems.map((item) => item.id)),
    [filteredItems]
  );

  const sideBySideItems = useMemo(() => {
    if (!preview) {
      return [];
    }

    return preview.items.filter(
      (item) => filteredItemIds.has(item.id) || item.id === focusedPreviewItemId
    );
  }, [filteredItemIds, focusedPreviewItemId, preview]);

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
  const displayedSessionProgress = useMemo(
    () => sessionProgress || buildProgressFromPreview(preview),
    [preview, sessionProgress]
  );
  const sessionCompleted = session?.status === 'COMPLETED';
  const hasPendingSingleCommit = committingItemIds.length > 0;
  const hasDecisionInFlight = decisionItemIds.length > 0;
  const selectedSessionTargetKey = selectedTargetInvoice
    ? `${accountId}:${selectedTargetInvoice.key}`
    : '';
  const sessionTargetReady = Boolean(
    selectedTargetInvoice &&
      !sessionLoading &&
      sessionReadyTargetKey === selectedSessionTargetKey
  );
  const fileSelectionDisabled =
    invoicesLoading ||
    !selectedTargetInvoice ||
    previewLoading ||
    commitLoading ||
    hasPendingSingleCommit ||
    hasDecisionInFlight ||
    sessionLoading ||
    !sessionTargetReady ||
    sessionActionLoading !== null ||
    sessionCompleted;

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
        transitionToTargetInvoice('');
      }
      return;
    }

    if (selectedTargetInvoiceKey && targetInvoiceOptions.some((option) => option.key === selectedTargetInvoiceKey)) {
      return;
    }

    transitionToTargetInvoice(targetInvoiceOptions[0]!.key);
  }, [selectedTargetInvoiceKey, targetInvoiceOptions]);

  useEffect(() => {
    selectedTargetInvoiceKeyRef.current = selectedTargetInvoiceKey;
  }, [selectedTargetInvoiceKey]);

  useEffect(() => {
    if (!router.isReady || Number.isNaN(accountId) || !selectedTargetInvoice) {
      targetInvoiceDetailRequestIdRef.current += 1;
      setTargetInvoiceDetail(null);
      setTargetInvoiceDetailLoading(false);
      setTargetInvoiceDetailError(null);
      return;
    }

    void fetchTargetInvoiceDetail(selectedTargetInvoice);
  }, [accountId, router.isReady, selectedTargetInvoice]);

  useEffect(() => {
    if (!router.isReady || Number.isNaN(accountId) || !selectedTargetInvoice) {
      sessionRequestIdRef.current += 1;
      fileReadRequestIdRef.current += 1;
      setSession(null);
      setSessionProgress(null);
      setSessionLoading(false);
      setSessionReadyTargetKey('');
      setFileName(null);
      setFileBase64('');
      setPreview(null);
      setCommitResult(null);
      return;
    }

    void fetchReconciliationSession(selectedTargetInvoice);
  }, [accountId, router.isReady, selectedTargetInvoiceKey]);

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

  useEffect(() => {
    if (
      focusedPreviewItemId &&
      !preview?.items.some((item) => item.id === focusedPreviewItemId)
    ) {
      setFocusedPreviewItemId(null);
    }
  }, [focusedPreviewItemId, preview]);

  useEffect(() => {
    if (reconciliationViewMode !== 'SIDE_BY_SIDE' || !focusedPreviewItemId) {
      return;
    }

    const firstHighlightedRowId = targetInvoiceTransactionRows.find((row) =>
      focusedMatchResolution.rowIds.has(row.rowId)
    )?.rowId;

    const scrollTimer = window.setTimeout(() => {
      comparisonItemRefs.current[focusedPreviewItemId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });

      if (firstHighlightedRowId) {
        systemTransactionRefs.current[firstHighlightedRowId]?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }

      const isMobileComparison =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(max-width: 1023px)').matches;

      if (isMobileComparison && reconciliationMobilePanel === 'ZENIT') {
        const focusTarget = firstHighlightedRowId
          ? systemTransactionRefs.current[firstHighlightedRowId]
          : comparisonStatusRef.current;
        focusTarget?.focus({ preventScroll: true });
      }
    }, 0);

    return () => window.clearTimeout(scrollTimer);
  }, [
    focusedMatchResolution,
    focusedPreviewItemId,
    reconciliationMobilePanel,
    reconciliationViewMode,
    targetInvoiceTransactionRows
  ]);

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

  async function fetchInvoices(options: { preserveCurrentOnError?: boolean } = {}) {
    setInvoicesLoading(true);

    try {
      const response = await api.get(`/financial/credit-cards/${accountId}/invoices`);
      setInvoices(response.data || []);
    } catch (error: any) {
      if (!options.preserveCurrentOnError) {
        setInvoices([]);
      }
      addToast(error.response?.data?.error || 'Erro ao carregar referencias de fatura', 'error');
    } finally {
      setInvoicesLoading(false);
    }
  }

  async function fetchTargetInvoiceDetail(invoice: TargetInvoiceOption) {
    if (selectedTargetInvoiceKeyRef.current !== invoice.key) {
      return;
    }

    const requestId = targetInvoiceDetailRequestIdRef.current + 1;
    targetInvoiceDetailRequestIdRef.current = requestId;
    const canLoadProjected = invoice.isProjected && Boolean(invoice.projectionKey);
    const canLoadReal = invoice.invoiceId !== null;

    if (!canLoadProjected && !canLoadReal) {
      if (targetInvoiceDetailRequestIdRef.current === requestId) {
        setTargetInvoiceDetail(null);
        setTargetInvoiceDetailLoading(false);
        setTargetInvoiceDetailError(null);
      }
      return;
    }

    setTargetInvoiceDetailError(null);
    setTargetInvoiceDetailLoading(true);

    try {
      const response = canLoadProjected
        ? await api.get(
            `/financial/credit-cards/${accountId}/invoices/projected/${invoice.projectionKey}`
          )
        : await api.get(`/financial/credit-card-invoices/${invoice.invoiceId}`);
      if (
        targetInvoiceDetailRequestIdRef.current === requestId &&
        selectedTargetInvoiceKeyRef.current === invoice.key
      ) {
        setTargetInvoiceDetail(response.data);
      }
    } catch (error: any) {
      if (
        targetInvoiceDetailRequestIdRef.current === requestId &&
        selectedTargetInvoiceKeyRef.current === invoice.key
      ) {
        setTargetInvoiceDetail(null);
        const message =
          error.response?.data?.error || 'Erro ao carregar itens da fatura selecionada';
        setTargetInvoiceDetailError(message);
        addToast(
          message,
          'error'
        );
      }
    } finally {
      if (
        targetInvoiceDetailRequestIdRef.current === requestId &&
        selectedTargetInvoiceKeyRef.current === invoice.key
      ) {
        setTargetInvoiceDetailLoading(false);
      }
    }
  }

  function applyDefaultSelection(nextPreview: ReconciliationPreview) {
    setSelectedItemIds(
      nextPreview.items
        .filter(
          (item) =>
            item.status === 'PENDING' &&
            item.canImport &&
            getItemResolution(item) === 'PENDING'
        )
        .map((item) => item.id)
    );
    setItemDrafts(buildItemDrafts(nextPreview.items));
  }

  function applyWorkspace(
    workspace: ReconciliationWorkspace,
    options: { resetTransient?: boolean } = {}
  ) {
    const nextPreview = workspace.preview;

    sessionRequestIdRef.current += 1;
    fileReadRequestIdRef.current += 1;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSessionLoading(false);
    setSession(workspace.session);
    setSessionProgress(workspace.progress);
    setPreview(nextPreview);
    setCommitResult(workspace.commitResult || null);
    setFileName(workspace.session?.fileName || nextPreview?.statement.fileName || null);
    setFileBase64('');

    if (!nextPreview) {
      setItemDrafts({});
      setSelectedItemIds([]);
      setFocusedPreviewItemId(null);
      return;
    }

    if (options.resetTransient) {
      setStatusFilter('ALL');
      setFocusedPreviewItemId(null);
      setReconciliationMobilePanel('FILE');
      applyDefaultSelection(nextPreview);
      return;
    }

    const nextItemsById = new Map(nextPreview.items.map((item) => [item.id, item]));
    setItemDrafts((current) => ({
      ...buildItemDrafts(nextPreview.items),
      ...Object.fromEntries(
        Object.entries(current).filter(([itemId]) => nextItemsById.has(itemId))
      )
    }));
    setSelectedItemIds((current) =>
      current.filter((itemId) => {
        const item = nextItemsById.get(itemId);
        return Boolean(item && isManuallyImportable(item));
      })
    );
  }

  function clearWorkspace() {
    sessionRequestIdRef.current += 1;
    fileReadRequestIdRef.current += 1;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSessionLoading(false);
    setSession(null);
    setSessionProgress(null);
    setPreview(null);
    setCommitResult(null);
    setFileName(null);
    setFileBase64('');
    setItemDrafts({});
    setSelectedItemIds([]);
    setFocusedPreviewItemId(null);
    setLocalSystemSelections({});
  }

  async function fetchReconciliationSession(invoice: TargetInvoiceOption) {
    const requestId = sessionRequestIdRef.current + 1;
    sessionRequestIdRef.current = requestId;
    setSessionLoading(true);
    setSessionReadyTargetKey('');

    try {
      const response = await api.get(
        `/financial/credit-cards/${accountId}/reconciliation/sessions/${invoice.referenceYear}/${invoice.referenceMonth}`
      );

      if (
        sessionRequestIdRef.current !== requestId ||
        selectedTargetInvoiceKeyRef.current !== invoice.key
      ) {
        return;
      }

      const workspace = response.data as ReconciliationWorkspace;
      if (!workspace?.session || !workspace.preview) {
        clearWorkspace();
        setSessionReadyTargetKey(`${accountId}:${invoice.key}`);
        return;
      }

      applyWorkspace(workspace, { resetTransient: true });
      setSessionReadyTargetKey(`${accountId}:${invoice.key}`);
    } catch (error: any) {
      if (
        sessionRequestIdRef.current !== requestId ||
        selectedTargetInvoiceKeyRef.current !== invoice.key
      ) {
        return;
      }

      clearWorkspace();
      if (error.response?.status !== 404 && error.response) {
        addToast(
          error.response?.data?.error || 'Erro ao carregar o andamento da conciliacao',
          'error'
        );
      }
      setSessionReadyTargetKey(`${accountId}:${invoice.key}`);
    } finally {
      if (sessionRequestIdRef.current === requestId) {
        setSessionLoading(false);
      }
    }
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

    if (!sessionTargetReady) {
      addToast('Aguarde o carregamento do andamento desta referencia', 'error');
      return;
    }

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    const targetInvoiceKey = selectedTargetInvoice.key;
    setPreviewLoading(true);
    setSessionActionLoading('START');

    try {
      const start = (
        replace = false,
        expectedSessionId?: number,
        expectedRevision?: number
      ) =>
        api.post(`/financial/credit-cards/${accountId}/reconciliation/sessions`, {
          sourceType: reconciliationSourceType,
          targetReferenceYear: selectedTargetInvoice.referenceYear,
          targetReferenceMonth: selectedTargetInvoice.referenceMonth,
          fileBase64,
          fileName,
          ...(replace ? { replace: true, expectedSessionId, expectedRevision } : {})
        });

      let response;
      try {
        response = await start();
      } catch (error: any) {
        if (error.response?.data?.code !== 'SESSION_FILE_CONFLICT') {
          throw error;
        }

        const replace = window.confirm(
          'Ja existe uma conciliacao em andamento para esta referencia com outro arquivo. Deseja substituir o arquivo e reiniciar a conferencia?'
        );
        if (!replace) {
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
          setFileName(session?.fileName || null);
          setFileBase64('');
          return;
        }

        const expectedSessionId =
          error.response?.data?.currentSessionId ?? session?.id;
        const expectedRevision =
          error.response?.data?.currentRevision ?? session?.revision;
        if (!expectedSessionId || expectedRevision === undefined) {
          await fetchReconciliationSession(selectedTargetInvoice);
          throw new Error('A conciliacao mudou. Atualize a tela e tente novamente.');
        }

        response = await start(true, expectedSessionId, expectedRevision);
      }

      if (
        previewRequestIdRef.current !== requestId ||
        selectedTargetInvoiceKeyRef.current !== targetInvoiceKey
      ) {
        return;
      }

      applyWorkspace(response.data as ReconciliationWorkspace, { resetTransient: true });
      await fetchTargetInvoiceDetail(selectedTargetInvoice);
    } catch (error: any) {
      if (
        previewRequestIdRef.current === requestId &&
        selectedTargetInvoiceKeyRef.current === targetInvoiceKey
      ) {
        addToast(error.response?.data?.error || 'Erro ao analisar fatura', 'error');
        if (error.response?.data?.code === 'REVISION_CONFLICT') {
          await fetchReconciliationSession(selectedTargetInvoice);
        }
      }
    } finally {
      if (previewRequestIdRef.current === requestId) {
        setPreviewLoading(false);
        setSessionActionLoading(null);
      }
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) {
      return;
    }

    const isValidFile = reconciliationSourceType === 'CAIXA_PDF'
      ? isPdfOrTxtStatementFile(nextFile)
      : isCsvStatementFile(nextFile);
    if (!isValidFile) {
      addToast(sourceConfig?.invalidFileMessage || 'Selecione um arquivo suportado', 'error');
      event.target.value = '';
      return;
    }

    const fileReadRequestId = fileReadRequestIdRef.current + 1;
    fileReadRequestIdRef.current = fileReadRequestId;
    previewRequestIdRef.current += 1;
    setPreviewLoading(false);
    setFileName(nextFile.name);
    setFileBase64('');
    setCommitResult(null);
    if (!session) {
      setPreview(null);
      setItemDrafts({});
      setSelectedItemIds([]);
      setFocusedPreviewItemId(null);
      setReconciliationMobilePanel('FILE');
    }

    try {
      const nextFileBase64 = await readFileAsDataUrl(nextFile);

      if (fileReadRequestIdRef.current !== fileReadRequestId) {
        return;
      }

      setFileBase64(nextFileBase64);
    } catch (error: any) {
      if (fileReadRequestIdRef.current === fileReadRequestId) {
        setFileName(session?.fileName || null);
        setFileBase64('');
        addToast(error.message || 'Erro ao ler arquivo', 'error');
      }
    }
  }

  function transitionToTargetInvoice(nextTargetInvoiceKey: string) {
    if (nextTargetInvoiceKey === selectedTargetInvoiceKey) {
      return;
    }

    selectedTargetInvoiceKeyRef.current = nextTargetInvoiceKey;
    previewRequestIdRef.current += 1;
    sessionRequestIdRef.current += 1;
    targetInvoiceDetailRequestIdRef.current += 1;
    fileReadRequestIdRef.current += 1;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setPreviewLoading(false);
    setSessionLoading(false);
    setSessionReadyTargetKey('');
    setSelectedTargetInvoiceKey(nextTargetInvoiceKey);
    setTargetInvoiceDetail(null);
    setTargetInvoiceDetailLoading(false);
    setTargetInvoiceDetailError(null);
    setSession(null);
    setSessionProgress(null);
    setFileName(null);
    setFileBase64('');
    setPreview(null);
    setCommitResult(null);
    setItemDrafts({});
    setSelectedItemIds([]);
    setFocusedPreviewItemId(null);
    setLocalSystemSelections({});
    setReconciliationMobilePanel('FILE');
  }

  function handleTargetInvoiceChange(nextTargetInvoiceKey: string) {
    transitionToTargetInvoice(nextTargetInvoiceKey);
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

  function handlePreviewItemFocus(itemId: string) {
    if (focusedPreviewItemId === itemId) {
      setFocusedPreviewItemId(null);
      return;
    }

    setFocusedPreviewItemId(itemId);

    const matchResolution = previewItemSystemMatchResolutions.get(itemId);
    const hasPossibleMatch = Boolean(
      matchResolution &&
        (matchResolution.rowIds.size > 0 ||
          matchResolution.outsideTargetCount > 0 ||
          matchResolution.unresolvedCount > 0)
    );
    setReconciliationMobilePanel(hasPossibleMatch ? 'ZENIT' : 'FILE');
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
        .filter((item) => item.status === 'PENDING' && isManuallyImportable(item))
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

  async function commitItems(
    itemIds: string[],
    action: ReconciliationCommitAction = 'IMPORT'
  ) {
    if (!preview || !session || !selectedTargetInvoice) {
      addToast('Analise a fatura antes de processar os itens', 'error');
      return;
    }

    if (!sessionTargetReady) {
      addToast('Aguarde o carregamento do andamento desta referencia', 'error');
      return;
    }

    if (session.status === 'COMPLETED') {
      addToast('Reabra a conciliacao antes de alterar os itens', 'error');
      return;
    }

    if (sessionActionLoading !== null) {
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
        `/financial/credit-cards/${accountId}/reconciliation/sessions/${session.id}/commit`,
        {
          expectedRevision: session.revision,
          selectedItems
        }
      );

      const workspace = response.data as ReconciliationWorkspace;
      const nextCommitResult = workspace.commitResult;
      applyWorkspace(workspace);

      if (!nextCommitResult) {
        addToast(
          'O processamento terminou sem o resultado detalhado. Atualize a conciliacao antes de continuar.',
          'error'
        );
      } else if (isSingleItemCommit) {
        const itemResult = nextCommitResult.results.find(
          (result) => result.itemId === itemIds[0]
        );

        if (!itemResult) {
          addToast('O backend nao informou o resultado deste item', 'error');
        } else {
          addToast(
            itemResult.message,
            isSuccessfulCommitResult(itemResult, workspace.preview) ? 'success' : 'error'
          );
        }
      } else {
        const unresolvedDuplicateCount = nextCommitResult.results.filter(
          (result) =>
            result.status === 'SKIPPED_DUPLICATE' &&
            !isSuccessfulCommitResult(result, workspace.preview)
        ).length;
        const idempotentFixedCount = nextCommitResult.results.filter(
          (result) =>
            result.status === 'SKIPPED_DUPLICATE' &&
            isSuccessfulCommitResult(result, workspace.preview)
        ).length;

        if (nextCommitResult.summary.failedCount > 0 || unresolvedDuplicateCount > 0) {
          addToast(
            `Processamento concluido com ${nextCommitResult.summary.failedCount} falha(s) e ${unresolvedDuplicateCount} duplicidade(s) pendente(s). Revise o resultado por item.`,
            'error'
          );
        } else {
          addToast(
            `${nextCommitResult.summary.createdCount} lancamento(s) criado(s) e ${nextCommitResult.summary.linkedFixedCount + idempotentFixedCount} vinculo(s) com fixa salvo(s).`,
            'success'
          );
        }
      }
      await fetchInvoices({ preserveCurrentOnError: true });
    } catch (error: any) {
      addToast(
        error.response?.data?.error ||
          (action === 'LINK_FIXED'
            ? 'Erro ao vincular item a fixa recorrente'
          : 'Erro ao importar lancamentos'),
        'error'
      );
      if (error.response?.data?.code === 'REVISION_CONFLICT') {
        await fetchReconciliationSession(selectedTargetInvoice);
      }
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

  async function updateItemDecision(
    itemId: string,
    decision: 'CONFIRM_EXISTING' | 'IGNORE' | 'RESTORE',
    transactionIds?: number[]
  ) {
    if (!session || !selectedTargetInvoice) {
      addToast('Carregue uma conciliacao antes de salvar a decisao', 'error');
      return;
    }

    if (!sessionTargetReady) {
      addToast('Aguarde o carregamento do andamento desta referencia', 'error');
      return;
    }

    if (session.status === 'COMPLETED') {
      addToast('Reabra a conciliacao antes de alterar os itens', 'error');
      return;
    }

    if (decision === 'CONFIRM_EXISTING' && !transactionIds?.length) {
      addToast('Selecione um lancamento existente do Zenit para confirmar', 'error');
      return;
    }

    if (
      decisionItemIds.length > 0 ||
      commitLoading ||
      hasPendingSingleCommit ||
      sessionActionLoading !== null
    ) {
      return;
    }

    setDecisionItemIds((current) => Array.from(new Set([...current, itemId])));
    try {
      const response = await api.post(
        `/financial/credit-cards/${accountId}/reconciliation/sessions/${session.id}/items/${encodeURIComponent(itemId)}/decision`,
        {
          expectedRevision: session.revision,
          decision,
          ...(transactionIds?.length ? { transactionIds } : {})
        }
      );
      applyWorkspace(response.data as ReconciliationWorkspace);

      if (decision === 'CONFIRM_EXISTING') {
        addToast('Correspondencia existente confirmada e andamento salvo', 'success');
      } else if (decision === 'IGNORE') {
        addToast('Item ignorado e andamento salvo', 'success');
      } else {
        addToast('Item voltou para conferencia', 'success');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar a decisao do item', 'error');
      if (error.response?.data?.code === 'REVISION_CONFLICT') {
        await fetchReconciliationSession(selectedTargetInvoice);
      }
    } finally {
      setDecisionItemIds((current) => current.filter((currentId) => currentId !== itemId));
    }
  }

  async function updateSessionStatus(status: ReconciliationSessionStatus) {
    if (!session || !selectedTargetInvoice) {
      return;
    }

    if (!sessionTargetReady) {
      addToast('Aguarde o carregamento do andamento desta referencia', 'error');
      return;
    }

    setSessionActionLoading('STATUS');
    try {
      const response = await api.post(
        `/financial/credit-cards/${accountId}/reconciliation/sessions/${session.id}/status`,
        { expectedRevision: session.revision, status }
      );
      applyWorkspace(response.data as ReconciliationWorkspace);
      addToast(
        status === 'COMPLETED'
          ? 'Conciliacao concluida com sucesso'
          : 'Conciliacao reaberta para ajustes',
        'success'
      );
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao atualizar a conciliacao', 'error');
      if (error.response?.data?.code === 'REVISION_CONFLICT') {
        await fetchReconciliationSession(selectedTargetInvoice);
      }
    } finally {
      setSessionActionLoading(null);
    }
  }

  async function resetSession() {
    if (!session || !selectedTargetInvoice) {
      return;
    }

    if (!sessionTargetReady) {
      addToast('Aguarde o carregamento do andamento desta referencia', 'error');
      return;
    }

    const confirmed = window.confirm(
      'Reiniciar esta conciliacao? O arquivo salvo e os checkpoints de andamento serao removidos. Os lancamentos financeiros ja criados e os vinculos a transacoes fixas ja efetivados serao preservados.'
    );
    if (!confirmed) {
      return;
    }

    setSessionActionLoading('RESET');
    try {
      await api.post(
        `/financial/credit-cards/${accountId}/reconciliation/sessions/${session.id}/reset`,
        { expectedRevision: session.revision, confirmed: true }
      );
      clearWorkspace();
      addToast('Conciliacao reiniciada', 'success');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao reiniciar a conciliacao', 'error');
      if (error.response?.data?.code === 'REVISION_CONFLICT') {
        await fetchReconciliationSession(selectedTargetInvoice);
      }
    } finally {
      setSessionActionLoading(null);
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
                    <label
                      className={`inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors ${
                        fileSelectionDisabled
                          ? 'cursor-not-allowed opacity-60'
                          : 'cursor-pointer hover:bg-accent-hover'
                      }`}
                    >
                      <Upload size={14} />
                      Escolher arquivo
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={sourceConfig.accept}
                        onChange={handleFileChange}
                        disabled={fileSelectionDisabled}
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
                      disabled={
                        invoicesLoading ||
                        sessionLoading ||
                        previewLoading ||
                        commitLoading ||
                        hasPendingSingleCommit ||
                        hasDecisionInFlight ||
                        sessionActionLoading !== null ||
                        targetInvoiceOptions.length === 0
                      }
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
                      !sessionTargetReady ||
                      previewLoading ||
                      commitLoading ||
                      hasPendingSingleCommit ||
                      hasDecisionInFlight ||
                      sessionLoading ||
                      sessionCompleted ||
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

          {sessionLoading && selectedTargetInvoice && (
            <Card>
              <div className="flex items-center gap-3 text-sm text-gray-300">
                <RefreshCw size={16} className="animate-spin text-accent" />
                Carregando o andamento salvo desta referencia...
              </div>
            </Card>
          )}

          {session && displayedSessionProgress && (
            <Card>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                        session.status === 'COMPLETED'
                          ? 'border-green-500/40 bg-green-500/10 text-green-200'
                          : 'border-blue-500/40 bg-blue-500/10 text-blue-200'
                      }`}
                    >
                      {session.status === 'COMPLETED' ? 'Concluida' : 'Em andamento'}
                    </span>
                    <span className="text-sm text-gray-400">
                      Arquivo salvo: <span className="text-gray-200">{session.fileName}</span>
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 xl:grid-cols-6">
                    <div>
                      <span className="block text-gray-500">Resolvidos</span>
                      <span className="font-semibold text-white">
                        {displayedSessionProgress.resolvedCount}/{displayedSessionProgress.totalCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Pendentes</span>
                      <span className="font-semibold text-blue-200">
                        {displayedSessionProgress.pendingCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Importados</span>
                      <span className="font-semibold text-green-200">
                        {displayedSessionProgress.importedCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Fixas</span>
                      <span className="font-semibold text-sky-200">
                        {displayedSessionProgress.linkedFixedCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Existentes</span>
                      <span className="font-semibold text-green-200">
                        {displayedSessionProgress.confirmedExistingCount}
                      </span>
                    </div>
                    <div>
                      <span className="block text-gray-500">Ignorados</span>
                      <span className="font-semibold text-gray-300">
                        {displayedSessionProgress.ignoredCount}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {session.status === 'COMPLETED' ? (
                    <Button
                      variant="outline"
                      onClick={() => void updateSessionStatus('OPEN')}
                      disabled={sessionActionLoading !== null || !sessionTargetReady}
                    >
                      {sessionActionLoading === 'STATUS' ? 'Reabrindo...' : 'Reabrir'}
                    </Button>
                  ) : (
                    <Button
                      variant="accent"
                      onClick={() => void updateSessionStatus('COMPLETED')}
                      disabled={
                        sessionActionLoading !== null ||
                        !sessionTargetReady ||
                        commitLoading ||
                        hasPendingSingleCommit ||
                        hasDecisionInFlight ||
                        displayedSessionProgress.pendingCount > 0
                      }
                    >
                      {sessionActionLoading === 'STATUS' ? 'Concluindo...' : 'Concluir'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => void resetSession()}
                    disabled={
                      session.status === 'COMPLETED' ||
                      !sessionTargetReady ||
                      sessionActionLoading !== null ||
                      commitLoading ||
                      hasPendingSingleCommit ||
                      hasDecisionInFlight
                    }
                  >
                    {sessionActionLoading === 'RESET' ? 'Reiniciando...' : 'Reiniciar'}
                  </Button>
                </div>
              </div>
              {session.status === 'OPEN' && displayedSessionProgress.pendingCount > 0 && (
                <p className="mt-3 text-sm text-gray-400">
                  Resolva ou ignore os itens pendentes antes de concluir a conciliacao.
                </p>
              )}
            </Card>
          )}

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
                    Correspondencias encontradas
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
                    <div
                      role="group"
                      aria-label="Modo de visualização da conciliação"
                      className="flex rounded-lg border border-gray-700 bg-[#11161d] p-1"
                    >
                      <button
                        type="button"
                        aria-label="Visualização detalhada"
                        aria-pressed={reconciliationViewMode === 'DETAILED'}
                        onClick={() => setReconciliationViewMode('DETAILED')}
                        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          reconciliationViewMode === 'DETAILED'
                            ? 'bg-accent text-white'
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Rows3 size={16} />
                        Detalhada
                      </button>
                      <button
                        type="button"
                        aria-label="Visualização lado a lado"
                        aria-pressed={reconciliationViewMode === 'SIDE_BY_SIDE'}
                        onClick={() => setReconciliationViewMode('SIDE_BY_SIDE')}
                        className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                          reconciliationViewMode === 'SIDE_BY_SIDE'
                            ? 'bg-accent text-white'
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Columns2 size={16} />
                        Lado a lado
                      </button>
                    </div>
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
                      disabled={commitLoading || hasDecisionInFlight || sessionCompleted}
                    >
                      Selecionar pendentes
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSelectVisibleImportable}
                      disabled={commitLoading || hasDecisionInFlight || sessionCompleted}
                    >
                      Selecionar visiveis
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedItemIds([])}
                      disabled={commitLoading || hasDecisionInFlight || sessionCompleted}
                    >
                      Limpar selecao
                    </Button>
                    <Button
                      variant="accent"
                      onClick={() => void commitItems(selectedItemIds)}
                      disabled={
                        !sessionTargetReady ||
                        commitLoading ||
                        hasPendingSingleCommit ||
                        hasDecisionInFlight ||
                        sessionActionLoading !== null ||
                        sessionCompleted ||
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

              {reconciliationViewMode === 'SIDE_BY_SIDE' ? (
                <CreditCardReconciliationSideBySide
                  preview={preview}
                  rows={targetInvoiceTransactionRows}
                  identityCollisionRowIds={identityCollisionRowIds}
                  items={sideBySideItems}
                  filteredItemIds={filteredItemIds}
                  selectedItemSet={selectedItemSet}
                  focusedPreviewItemId={focusedPreviewItemId}
                  highlightedSystemTransactionRowIds={focusedMatchResolution.rowIds}
                  resolvedSystemTransactionIds={resolvedSystemTransactionIds}
                  focusedMatchOutsideTargetCount={focusedMatchResolution.outsideTargetCount}
                  focusedMatchUnresolvedCount={focusedMatchResolution.unresolvedCount}
                  focusedMatchHasIdentityCollision={focusedMatchResolution.hasIdentityCollision}
                  focusedSelectedSystemTransactionKey={
                    focusedPreviewItemId
                      ? localSystemSelections[focusedPreviewItemId] || ''
                      : ''
                  }
                  sessionStatus={session?.status || 'OPEN'}
                  targetInvoiceDetailLoading={targetInvoiceDetailLoading}
                  targetInvoiceDetailAvailable={Boolean(targetInvoiceDetail)}
                  targetInvoiceDetailError={targetInvoiceDetailError}
                  selectedTargetInvoice={selectedTargetInvoice}
                  commitLoading={commitLoading}
                  committingItemIds={committingItemIds}
                  decisionItemIds={decisionItemIds}
                  sessionActionLoading={sessionActionLoading !== null}
                  sessionTargetReady={sessionTargetReady}
                  mobilePanel={reconciliationMobilePanel}
                  itemRefs={comparisonItemRefs}
                  systemTransactionRefs={systemTransactionRefs}
                  comparisonStatusRef={comparisonStatusRef}
                  onMobilePanelChange={setReconciliationMobilePanel}
                  onSelectPreviewItem={handlePreviewItemFocus}
                  onSelectSystemTransaction={handleLocalSystemSelectionChange}
                  onToggleImportSelection={handleToggleSelection}
                  onConfirmExisting={(itemId, transactionId) =>
                    void updateItemDecision(itemId, 'CONFIRM_EXISTING', [transactionId])
                  }
                  onIgnore={(itemId) => void updateItemDecision(itemId, 'IGNORE')}
                  onRestore={(itemId) => void updateItemDecision(itemId, 'RESTORE')}
                  onRetryTargetInvoiceDetail={() => {
                    if (selectedTargetInvoice) {
                      void fetchTargetInvoiceDetail(selectedTargetInvoice);
                    }
                  }}
                />
              ) : (
              <div className="space-y-4">
                {filteredItems.map((item) => {
                  const selectable = isManuallyImportable(item);
                  const linkableToFixed = canLinkToFixed(item);
                  const resolution = getItemResolution(item);
                  const draft = getItemDraft(item);
                  const suggestionSourceLabel = getSuggestionSourceLabel(
                    item.categorySuggestion.source
                  );
                  const itemCommitLoading = committingItemIds.includes(item.id);
                  const itemDecisionLoading = decisionItemIds.includes(item.id);
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
                  const itemMatchedTransactionAliases = new Set(
                    item.matchedTransactions.flatMap(getMatchedTransactionSystemAliases)
                  );
                  const availableSystemTransactions = targetInvoiceTransactions.filter(
                    (transaction) => {
                          if (transaction.isExternalCreditCardSettlement) {
                            return false;
                          }

                          const transactionKey = getSystemInvoiceTransactionKey(transaction);

                          if (
                            transaction.id &&
                            resolvedSystemTransactionIds.has(transaction.id)
                          ) {
                            return false;
                          }

                          if (transactionKey === localSelectionKey) {
                            return true;
                          }

                          if (
                            getSystemInvoiceTransactionAliases(transaction).some((alias) =>
                              previewMatchedTransactionKeys.has(alias)
                            ) &&
                            !getSystemInvoiceTransactionAliases(transaction).some((alias) =>
                              itemMatchedTransactionAliases.has(alias)
                            )
                          ) {
                            return false;
                          }

                          return !otherLocalSelectionKeys.has(transactionKey);
                    }
                  );
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
                                disabled={
                                  !selectable ||
                                  commitLoading ||
                                  itemCommitLoading ||
                                  hasDecisionInFlight ||
                                  sessionCompleted
                                }
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
                                  {resolution !== 'PENDING' && (
                                    <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200">
                                      {getResolutionLabel(resolution)}
                                    </span>
                                  )}
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
                                      !sessionTargetReady ||
                                      commitLoading ||
                                      hasPendingSingleCommit ||
                                      hasDecisionInFlight ||
                                      sessionActionLoading !== null ||
                                      sessionCompleted ||
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
                                      !sessionTargetReady ||
                                      commitLoading ||
                                      hasPendingSingleCommit ||
                                      hasDecisionInFlight ||
                                      sessionActionLoading !== null ||
                                      sessionCompleted ||
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
                                {canIgnoreItem(item) && (
                                  <Button
                                    variant="outline"
                                    onClick={() => void updateItemDecision(item.id, 'IGNORE')}
                                    disabled={
                                      !sessionTargetReady ||
                                      commitLoading ||
                                      hasPendingSingleCommit ||
                                      hasDecisionInFlight ||
                                      sessionActionLoading !== null ||
                                      sessionCompleted ||
                                      itemCommitLoading ||
                                      itemDecisionLoading
                                    }
                                    className="flex items-center gap-2 text-sm"
                                  >
                                    {itemDecisionLoading ? 'Salvando...' : 'Ignorar'}
                                  </Button>
                                )}
                                {resolution === 'IGNORED' && (
                                  <Button
                                    variant="outline"
                                    onClick={() => void updateItemDecision(item.id, 'RESTORE')}
                                    disabled={
                                      !sessionTargetReady ||
                                      commitLoading ||
                                      hasPendingSingleCommit ||
                                      hasDecisionInFlight ||
                                      sessionActionLoading !== null ||
                                      sessionCompleted ||
                                      itemDecisionLoading
                                    }
                                    className="flex items-center gap-2 text-sm"
                                  >
                                    {itemDecisionLoading ? 'Salvando...' : 'Voltar a conferir'}
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

                          {selectable && (
                            <div className="mt-4 border-t border-gray-700 pt-4">
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
                                      disabled={
                                        commitLoading ||
                                        categoriesLoading ||
                                        itemCommitLoading
                                      }
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

                            {resolution === 'PENDING' &&
                              item.status !== 'NOT_IMPORTABLE' && (
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
                                    !sessionTargetReady ||
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
                                {selectedSystemTransaction?.id && (
                                  <Button
                                    variant="accent"
                                    onClick={() =>
                                      void updateItemDecision(item.id, 'CONFIRM_EXISTING', [
                                        selectedSystemTransaction.id as number
                                      ])
                                    }
                                    disabled={
                                      !sessionTargetReady ||
                                      targetInvoiceDetailLoading ||
                                      commitLoading ||
                                      hasPendingSingleCommit ||
                                      hasDecisionInFlight ||
                                      sessionActionLoading !== null ||
                                      sessionCompleted ||
                                      itemDecisionLoading
                                    }
                                    className="mt-3"
                                  >
                                    {itemDecisionLoading
                                      ? 'Salvando...'
                                      : 'Confirmar correspondencia existente'}
                                  </Button>
                                )}
                                <div className="mt-2 text-sm text-gray-400">
                                  Selecione a contraparte correta e confirme para gravar este
                                  checkpoint no andamento da conciliacao.
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
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
              )}

              {commitResult && (
                <Card>
                  <div
                    role="region"
                    aria-label="Resultado do ultimo processamento"
                  >
                    <div className="flex items-center gap-2 text-lg font-semibold text-white">
                      <CheckCircle2 size={18} className="text-accent" />
                      Resultado do ultimo processamento
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                      {[
                        ['Selecionados', commitResult.summary.selectedCount],
                        ['Criados', commitResult.summary.createdCount],
                        ['Fixas vinculadas', commitResult.summary.linkedFixedCount],
                        ['Duplicidades', commitResult.summary.skippedDuplicateCount],
                        ['Nao importaveis', commitResult.summary.skippedNotImportableCount],
                        ['Falhas', commitResult.summary.failedCount]
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3"
                        >
                          <div className="text-xs uppercase tracking-[0.14em] text-gray-500">
                            {label}
                          </div>
                          <div className="mt-1 text-lg font-semibold text-white">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-2">
                      {commitResult.results.map((result) => {
                        const successful = isSuccessfulCommitResult(result, preview);

                        return (
                          <div
                            key={`${result.itemId}-${result.status}`}
                            className={`rounded-lg border px-4 py-3 text-sm ${
                              successful
                                ? 'border-green-500/30 bg-green-500/10 text-green-100'
                                : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{result.itemId}</span>
                              <span className="rounded-full border border-current/30 px-2 py-0.5 text-xs">
                                {result.status === 'SKIPPED_DUPLICATE' && successful
                                  ? 'Fixa ja vinculada'
                                  : getCommitResultStatusLabel(result.status)}
                              </span>
                            </div>
                            <div className="mt-1">{result.message}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
