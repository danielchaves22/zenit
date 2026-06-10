import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  RefreshCw,
  Upload
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import CategorySelect, { type CategoryOption } from '@/components/financial/CategorySelect';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import {
  type CreditCardReconciliationSourceType,
  FinancialBank,
  getCreditCardReconciliationSourceType
} from '@/utils/banks';
import { formatCalendarDate } from '@/utils/financialStatus';

type ReconciliationItemStatus = 'OK' | 'SIMILAR' | 'PENDING' | 'NOT_IMPORTABLE';
type ReconciliationReason =
  | 'EXACT'
  | 'AMBIGUOUS_EXACT'
  | 'DATE_DIVERGENCE'
  | 'INSTALLMENT_DIVERGENCE'
  | 'NON_IMPORTABLE'
  | 'NO_MATCH';
type ReconciliationFilter = 'ALL' | ReconciliationItemStatus;
type ReconciliationSuggestionSource = 'RULE' | 'HISTORY' | 'AI';

interface CreditCardAccount {
  id: number;
  name: string;
  bankName?: string | null;
  bankCode?: string | null;
  bank?: FinancialBank | null;
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
    skippedDuplicateCount: number;
    skippedNotImportableCount: number;
    failedCount: number;
  };
  results: Array<{
    itemId: string;
    status: 'CREATED' | 'SKIPPED_DUPLICATE' | 'SKIPPED_NOT_IMPORTABLE' | 'FAILED';
    message: string;
    createdTransactionIds: number[];
  }>;
}

interface ReconciliationItemDraft {
  description: string;
  categoryId: string;
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
    case 'AMBIGUOUS_EXACT':
      return hasProjectedFixedMatch
        ? 'Ha mais de uma correspondencia equivalente, incluindo fixas projetadas.'
        : 'Mais de um lancamento ja bate exatamente.';
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

function isManuallyImportable(item: ReconciliationPreviewItem) {
  return item.canImport && item.status !== 'OK';
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

  const reconciliationSourceType = useMemo(
    () => getCreditCardReconciliationSourceType(card?.bank, card?.bankCode, card?.bankName),
    [card]
  );
  const sourceConfig = reconciliationSourceType
    ? RECONCILIATION_SOURCE_CONFIG[reconciliationSourceType]
    : null;

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

  useEffect(() => {
    if (!router.isReady || Number.isNaN(accountId)) {
      return;
    }

    void fetchCard();
    void fetchCategories();
  }, [accountId, router.isReady]);

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

    setPreviewLoading(true);

    try {
      const response = await api.post(
        `/financial/credit-cards/${accountId}/reconciliation/preview`,
        {
          sourceType: reconciliationSourceType,
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
    if (!fileBase64 || !fileName || !reconciliationSourceType) {
      return;
    }

    const response = await api.post(
      `/financial/credit-cards/${accountId}/reconciliation/preview`,
      {
        sourceType: reconciliationSourceType,
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

  function buildCommitPayload(itemIds: string[]) {
    if (!preview) {
      return [];
    }

    return itemIds.map((itemId) => {
      const item = preview.items.find((entry) => entry.id === itemId);

      if (!item) {
        throw new Error('Item selecionado nao foi localizado na previa');
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
        description,
        categoryId: Number(draft.categoryId)
      };
    });
  }

  async function commitItems(itemIds: string[]) {
    if (!preview || !fileBase64 || !fileName || !reconciliationSourceType) {
      addToast('Analise a fatura antes de importar os lancamentos', 'error');
      return;
    }

    if (itemIds.length === 0) {
      addToast('Selecione ao menos um item para importar', 'error');
      return;
    }

    let selectedItems: Array<{ itemId: string; description: string; categoryId: number }> = [];
    try {
      selectedItems = buildCommitPayload(itemIds);
    } catch (error: any) {
      addToast(error.message || 'Revise os dados selecionados antes de importar', 'error');
      return;
    }

    setCommitLoading(true);

    try {
      const response = await api.post(
        `/financial/credit-cards/${accountId}/reconciliation/commit`,
        {
          sourceType: reconciliationSourceType,
          fileBase64,
          fileName,
          selectedItems
        }
      );

      setCommitResult(response.data);
      addToast(
        `${response.data.summary.createdCount} lancamento(s) criado(s) na conciliacao`,
        'success'
      );
      await refreshPreviewSilently();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao importar lancamentos', 'error');
    } finally {
      setCommitLoading(false);
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
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div>
                <div className="mb-3 text-sm font-medium text-white">Arquivo da fatura</div>
                <label className="flex cursor-pointer flex-col gap-3 rounded-xl border border-dashed border-gray-600 bg-[#11161d] p-5 transition-colors hover:border-accent">
                  <div className="flex items-center gap-3">
                    <Upload className="text-accent" size={18} />
                    <div>
                      <div className="text-sm font-medium text-white">
                        {sourceConfig.selectLabel}
                      </div>
                      <div className="text-xs text-gray-400">
                        {sourceConfig.helperText}
                      </div>
                    </div>
                  </div>
                  <input
                    type="file"
                    accept={sourceConfig.accept}
                    onChange={handleFileChange}
                    className="text-sm text-gray-300 file:mr-4 file:rounded file:border-0 file:bg-accent file:px-3 file:py-2 file:font-semibold file:text-white"
                  />
                </label>
              </div>

              <div className="rounded-xl border border-gray-700 bg-[#11161d] p-5">
                <div className="text-xs uppercase tracking-[0.18em] text-gray-400">
                  Cartao selecionado
                </div>
                <div className="mt-2 text-lg font-semibold text-white">{card.name}</div>
                <div className="mt-1 text-sm text-gray-400">
                  {card.bank?.name || card.bankName || 'Banco nao informado'}
                </div>
                <div className="mt-4 space-y-2 text-sm text-gray-300">
                  <div>Fonte: {sourceConfig.sourceLabel}</div>
                  <div>Arquivo: {fileName || `Nenhum ${sourceConfig.fileLabel} selecionado`}</div>
                </div>
                <div className="mt-5">
                  <Button
                    variant="accent"
                    onClick={() => void runPreview()}
                    disabled={!fileBase64 || previewLoading}
                    className="flex w-full items-center justify-center gap-2"
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
                  A selecao inicial marca apenas os pendentes; itens similares podem ser marcados manualmente.
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
                  const draft = getItemDraft(item);
                  const suggestionSourceLabel = getSuggestionSourceLabel(
                    item.categorySuggestion.source
                  );
                  const missingDescription = selectable && !draft.description.trim();
                  const missingCategory = selectable && !draft.categoryId;

                  return (
                    <Card key={item.id} className="p-0">
                      <div className="border-b border-gray-700 px-5 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedItemSet.has(item.id)}
                              disabled={!selectable || commitLoading}
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
                            {selectable && (
                              <Button
                                variant="outline"
                                onClick={() => void commitItems([item.id])}
                                disabled={
                                  commitLoading ||
                                  categoriesLoading ||
                                  missingDescription ||
                                  missingCategory
                                }
                                className="text-sm"
                              >
                                Importar este item
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 px-5 py-4 md:grid-cols-4">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                            Data da compra
                          </div>
                          <div className="mt-1 text-sm text-white">
                            {item.purchaseDate
                              ? formatCalendarDate(item.purchaseDate)
                              : `Referencia ${formatReference(
                                  preview.statement.referenceMonth,
                                  preview.statement.referenceYear
                                )}`}
                          </div>
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
                        <div className="border-t border-gray-700 bg-[#0f141b] px-5 py-4">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                            <div>
                              <div className="text-xs uppercase tracking-[0.18em] text-gray-500">
                                Descricao a lancar
                              </div>
                              <input
                                type="text"
                                value={draft.description}
                                onChange={(event) =>
                                  handleDraftDescriptionChange(item.id, event.target.value)
                                }
                                disabled={commitLoading}
                                className={`mt-2 w-full rounded border bg-background px-3 py-2 text-sm text-white focus:outline-none focus:ring ${
                                  missingDescription
                                    ? 'border-amber-500 focus:border-amber-400'
                                    : 'border-gray-700 focus:border-accent'
                                }`}
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
                                  disabled={commitLoading || categoriesLoading}
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

                      {item.matchedTransactions.length > 0 && (
                        <div className="border-t border-gray-700 bg-[#11161d] px-5 py-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                            <CheckCircle2 size={16} className="text-accent" />
                            Correspondencias encontradas no cartao
                          </div>
                          <div className="space-y-3">
                            {item.matchedTransactions.map((transaction) => (
                              <div
                                key={`${item.id}-${transaction.matchKey}`}
                                className="rounded-lg border border-gray-700 px-4 py-3"
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
                                    {transaction.matchSource === 'TRANSACTION' && transaction.id && (
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
                            ))}
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
                    Resultado da importacao
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
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
