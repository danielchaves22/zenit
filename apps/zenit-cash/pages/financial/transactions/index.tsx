import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  BookmarkPlus,
  CheckCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  CreditCard,
  Edit2,
  Filter,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
  X
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Modal } from '@/components/ui/Modal';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { orderCategoriesForSelect } from '@/components/financial/CategorySelect';
import TransactionSettlementModal from '@/components/financial/TransactionSettlementModal';
import api from '@/lib/api';
import {
  FILTER_PRESET_FEATURE_KEYS,
  createSavedFilterPreset,
  deleteSavedFilterPreset,
  listSavedFilterPresets,
  markLastUsedFilterPreset,
  type SavedFilterPreset
} from '@/lib/filter-presets';
import { formatAccountDisplayName } from '@/utils/accounts';
import { formatTransactionDescription } from '@/utils/transactions';
import { getInvoiceReferenceLabel } from '@/utils/creditCards';
import {
  compareCalendarDateValues,
  formatCalendarDate,
  getTodayDateValue,
  getTransactionDisplayStatus,
  getTransactionDisplayStatusClasses,
  getTransactionDisplayStatusLabel,
  type TransactionDisplayStatus
} from '@/utils/financialStatus';
import { buildTransactionUpsertPayload } from '@/utils/transactionPayload';
import {
  ALL_TRANSACTION_TYPES,
  applyTransactionsPresetPayload,
  buildTransactionsPresetPayload,
  countAdvancedTransactionFilters,
  getDefaultTransactionsFilterState,
  getPeriodRange,
  parseInputDate,
  resolveInitialTransactionsFilterState,
  type PeriodPreset,
  type PeriodRange,
  type TransactionDateFieldFilter,
  type TransactionFilters,
  type IgnoredTransactionState,
  type TransactionTypeFilter,
  type TransactionsPresetPayload
} from '@/utils/transactionFilterPresets';

type TransactionStatusFilter = 'PENDING' | 'COMPLETED' | 'CANCELED';

interface Transaction {
  id: number | null;
  description: string;
  amount: string;
  date: string;
  dueDate?: string;
  effectiveDate?: string;
  type: TransactionTypeFilter;
  entryKind?: 'NORMAL' | 'BALANCE_ADJUSTMENT';
  status: TransactionStatusFilter;
  notes?: string;
  repeatTimes?: number | null;
  fromAccount?: { id: number; name: string; type?: string };
  toAccount?: { id: number; name: string; type?: string };
  category?: {
    id: number;
    name: string;
    color: string;
    icon?: string;
  };
  tags: { id: number; name: string }[];
  createdByUser: { id: number; name: string };
  createdAt: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  purchaseGroupId?: string | null;
  creditCardInvoice?: {
    id?: number;
    referenceYear: number;
    referenceMonth: number;
    dueDate?: string;
    status: string;
  } | null;
  isVirtual?: boolean;
  virtualKey?: string;
  fixedTemplateId?: number | null;
  isFixed?: boolean;
  isProjected?: boolean;
  archivedAt?: string | null;
  archivedBy?: number | null;
  isArchived?: boolean;
  hasProjectedTransactions?: boolean;
  isCreditCardInvoiceSummary?: boolean;
  isCreditCardInvoicePayment?: boolean;
  invoiceNavigation?: {
    accountId: number;
    invoiceKey: string;
  };
  itemsSubtotal?: string;
  fixedSubtotal?: string;
}

interface TransactionSummary {
  incomeTotal: string;
  expenseTotal: string;
}

interface Account {
  id: number;
  name: string;
  type: string;
  isActive?: boolean;
}

interface Category {
  id: number;
  name: string;
  color: string;
  type: string;
  icon?: string;
  isDefault?: boolean;
  parentId?: number | null;
}

interface ActiveFilterBadge {
  key: string;
  label: string;
  value: string;
}

interface ApplyTransactionsFilterStateOptions {
  selectedPresetId?: string;
}

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'INCOME', label: 'Receita' },
  { value: 'EXPENSE', label: 'Despesa' },
  { value: 'TRANSFER', label: 'Transferência' }
];

const TRANSACTION_DATE_FIELD_OPTIONS: Array<{
  value: TransactionDateFieldFilter;
  label: string;
}> = [
  { value: 'dueDate', label: 'Vencimento' },
  { value: 'date', label: 'Data da transação' },
  { value: 'effectiveDate', label: 'Data de liquidação' },
  { value: 'createdAt', label: 'Data de criação' }
];

const TRANSACTION_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Em aberto / vencida' },
  { value: 'COMPLETED', label: 'Concluida' },
  { value: 'CANCELED', label: 'Cancelada' }
];

function formatPeriodSummary(startDate: string, endDate: string): string {
  return `${parseInputDate(startDate).toLocaleDateString('pt-BR')} a ${parseInputDate(endDate).toLocaleDateString('pt-BR')}`;
}

function formatMonthPeriodLabel(startDate: string): string {
  return parseInputDate(startDate)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(' de ', '/');
}

function getPeriodSelectLabel(preset: PeriodPreset, range: PeriodRange): string {
  if (preset === 'CURRENT_WEEK') {
    return `Semana: ${formatPeriodSummary(range.startDate, range.endDate)}`;
  }

  if (preset === 'CUSTOM') {
    return 'Personalizado';
  }

  return `Mês: ${formatMonthPeriodLabel(range.startDate)}`;
}

function getPeriodOptionLabel(
  optionPreset: PeriodPreset,
  activePreset: PeriodPreset,
  activeRange: PeriodRange
): string {
  if (optionPreset === activePreset) {
    return getPeriodSelectLabel(activePreset, activeRange);
  }

  if (optionPreset === 'CURRENT_WEEK') {
    return 'Semana atual';
  }

  if (optionPreset === 'CUSTOM') {
    return 'Personalizado';
  }

  return 'Mês atual';
}

function getDateFieldOptionLabel(value: TransactionDateFieldFilter): string {
  switch (value) {
    case 'dueDate':
      return 'Vencimento';
    case 'date':
      return 'Transacao';
    case 'effectiveDate':
      return 'Liquidacao';
    case 'createdAt':
      return 'Criacao';
    default:
      return value;
  }
}

function buildInvoiceKeyFromReference(referenceYear: number, referenceMonth: number): string {
  return `projection:${referenceYear}-${String(referenceMonth).padStart(2, '0')}`;
}

function getTransactionInvoiceHref(
  transaction: Pick<Transaction, 'fromAccount' | 'creditCardInvoice' | 'invoiceNavigation'>
): string | null {
  if (transaction.invoiceNavigation) {
    return `/financial/credit-cards/${transaction.invoiceNavigation.accountId}/invoices?invoiceKey=${encodeURIComponent(transaction.invoiceNavigation.invoiceKey)}`;
  }

  if (!transaction.creditCardInvoice || !transaction.fromAccount?.id) {
    return null;
  }

  const invoiceKey = transaction.creditCardInvoice.id
    ? `invoice:${transaction.creditCardInvoice.id}`
    : buildInvoiceKeyFromReference(
        transaction.creditCardInvoice.referenceYear,
        transaction.creditCardInvoice.referenceMonth
      );

  return `/financial/credit-cards/${transaction.fromAccount.id}/invoices?invoiceKey=${encodeURIComponent(invoiceKey)}`;
}

function getTransactionAccountDisplay(transaction: Pick<Transaction, 'fromAccount' | 'toAccount'>) {
  const accountLabel = formatAccountDisplayName(transaction.fromAccount || transaction.toAccount);
  return accountLabel === '-' ? 'A definir' : accountLabel;
}

function canSettleTransaction(transaction: Transaction) {
  if (!transaction.id) {
    return false;
  }

  if (transaction.archivedAt) {
    return false;
  }

  if (transaction.type === 'TRANSFER') {
    return false;
  }

  if (transaction.status !== 'PENDING' || transaction.effectiveDate) {
    return false;
  }

  if (transaction.isVirtual || transaction.isProjected) {
    return false;
  }

  if (
    transaction.purchaseGroupId ||
    transaction.creditCardInvoice ||
    transaction.isCreditCardInvoiceSummary ||
    transaction.isCreditCardInvoicePayment
  ) {
    return false;
  }

  return true;
}

function isCreditCardRelatedTransaction(transaction: Transaction) {
  return Boolean(
    transaction.purchaseGroupId ||
    transaction.creditCardInvoice ||
    transaction.isCreditCardInvoiceSummary ||
    transaction.isCreditCardInvoicePayment
  );
}

function canArchiveTransaction(transaction: Transaction) {
  if (transaction.archivedAt) {
    return false;
  }

  if (transaction.status !== 'PENDING' || transaction.type === 'TRANSFER') {
    return false;
  }

  if (isCreditCardRelatedTransaction(transaction)) {
    return false;
  }

  if (transaction.isVirtual || transaction.isProjected) {
    return Boolean(transaction.fixedTemplateId);
  }

  return Boolean(transaction.id);
}

function canUnarchiveTransaction(transaction: Transaction) {
  return (
    Boolean(transaction.id) &&
    Boolean(transaction.archivedAt) &&
    transaction.status === 'PENDING' &&
    transaction.type !== 'TRANSFER' &&
    !isCreditCardRelatedTransaction(transaction)
  );
}

function isBalanceAdjustmentTransaction(
  transaction?: Pick<Transaction, 'entryKind'> | null
) {
  return transaction?.entryKind === 'BALANCE_ADJUSTMENT';
}

export default function TransactionsListPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  const defaultTransactionsState = getDefaultTransactionsFilterState();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterPresets, setFilterPresets] = useState<SavedFilterPreset<TransactionsPresetPayload>[]>([]);
  const [lastUsedPresetId, setLastUsedPresetId] = useState<number | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [summary, setSummary] = useState<TransactionSummary>({
    incomeTotal: '0',
    expenseTotal: '0'
  });
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showOnlyMaterialized, setShowOnlyMaterialized] = useState(false);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [accountsResolved, setAccountsResolved] = useState(false);
  const [categoriesResolved, setCategoriesResolved] = useState(false);
  const [presetsResolved, setPresetsResolved] = useState(false);
  const [accountsAvailableForValidation, setAccountsAvailableForValidation] = useState(false);
  const [categoriesAvailableForValidation, setCategoriesAvailableForValidation] = useState(false);
  const [materializingVirtualKey, setMaterializingVirtualKey] = useState<string | null>(null);
  const [dateField, setDateField] = useState<TransactionDateFieldFilter>(
    defaultTransactionsState.dateField
  );
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>(
    defaultTransactionsState.periodPreset
  );
  const [periodOffset, setPeriodOffset] = useState(defaultTransactionsState.periodOffset);
  const [customPeriod, setCustomPeriod] = useState<PeriodRange>(
    defaultTransactionsState.customPeriod
  );
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetActionLoading, setPresetActionLoading] = useState<
    null | 'apply' | 'save' | 'delete'
  >(null);

  const [sortConfig, setSortConfig] = useState<{
    key: 'dueDate' | 'effectiveDate' | 'description';
    direction: 'asc' | 'desc';
  }>({ key: 'dueDate', direction: 'desc' });

  const [filters, setFilters] = useState<TransactionFilters>(defaultTransactionsState.filters);
  const [settlementTarget, setSettlementTarget] = useState<Transaction | null>(null);
  const [settlementLoading, setSettlementLoading] = useState(false);
  const [settlementAccountId, setSettlementAccountId] = useState('');
  const [settlementDate, setSettlementDate] = useState(getTodayDateValue());
  const [settlementNotes, setSettlementNotes] = useState('');

  const isCustomPeriod = periodPreset === 'CUSTOM';
  const activePeriod = useMemo(
    () =>
      periodPreset === 'CUSTOM'
        ? customPeriod
        : getPeriodRange(periodPreset, periodOffset),
    [customPeriod, periodOffset, periodPreset]
  );
  const customPeriodError = useMemo(() => {
    if (!isCustomPeriod) {
      return '';
    }

    if (!customPeriod.startDate || !customPeriod.endDate) {
      return 'Selecione a data inicial e final.';
    }

    if (customPeriod.startDate > customPeriod.endDate) {
      return 'Data inicial deve ser anterior ou igual a data final.';
    }

    return '';
  }, [customPeriod.endDate, customPeriod.startDate, isCustomPeriod]);

  const moreFiltersCount = useMemo(
    () => countAdvancedTransactionFilters(filters, { showOnlyMaterialized }),
    [filters, showOnlyMaterialized]
  );
  const validAccountIds = useMemo(
    () => (accountsAvailableForValidation ? new Set(accounts.map((account) => account.id.toString())) : null),
    [accounts, accountsAvailableForValidation]
  );
  const validCategoryIds = useMemo(
    () =>
      categoriesAvailableForValidation
        ? new Set(categories.map((category) => category.id.toString()))
        : null,
    [categories, categoriesAvailableForValidation]
  );
  const selectedPreset = useMemo(
    () => filterPresets.find((preset) => preset.id.toString() === selectedPresetId) || null,
    [filterPresets, selectedPresetId]
  );
  const categoryFilterOptions = useMemo(
    () =>
      orderCategoriesForSelect(
        categories.map((category) => ({
          id: category.id,
          name: category.name,
          color: category.color,
          icon: category.icon,
          isDefault: category.isDefault,
          parentId: category.parentId ?? null
        }))
      ).map((item) => ({
        value: item.category.id.toString(),
        label:
          item.lineage.length > 0
            ? `${item.lineage.join(' / ')} / ${item.category.name}`
            : item.category.name
      })),
    [categories]
  );
  const activeMoreFilterBadges = useMemo<ActiveFilterBadge[]>(() => {
    const badges: ActiveFilterBadge[] = [];

    if (
      filters.types.length !== ALL_TRANSACTION_TYPES.length ||
      ALL_TRANSACTION_TYPES.some((type) => !filters.types.includes(type))
    ) {
      const selectedTypeLabels = TRANSACTION_TYPE_OPTIONS
        .filter((option) => filters.types.includes(option.value as TransactionTypeFilter))
        .map((option) => option.label);

      badges.push({
        key: 'types',
        label: 'Tipo',
        value: selectedTypeLabels.length > 0 ? selectedTypeLabels.join(', ') : 'Nenhum'
      });
    }

    if (showOnlyMaterialized) {
      badges.push({
        key: 'showOnlyMaterialized',
        label: 'Exibicao',
        value: 'So materializadas'
      });
    }

    if (filters.accountId) {
      const account = accounts.find((item) => item.id.toString() === filters.accountId);
      badges.push({
        key: 'account',
        label: 'Conta',
        value: account ? formatAccountDisplayName(account) : `Conta #${filters.accountId}`
      });
    }

    if (filters.categoryIds.length > 0) {
      const selectedCategoryLabels = categoryFilterOptions
        .filter((option) => filters.categoryIds.includes(option.value))
        .map((option) => option.label);

      badges.push({
        key: 'category',
        label: filters.categoryIds.length === 1 ? 'Categoria' : 'Categorias',
        value:
          selectedCategoryLabels.length === 0
            ? filters.categoryIds
                .map((categoryId) => `Categoria #${categoryId}`)
                .join(', ')
            : selectedCategoryLabels.length <= 2
              ? selectedCategoryLabels.join(', ')
              : `${selectedCategoryLabels.slice(0, 2).join(', ')} +${
                  selectedCategoryLabels.length - 2
                }`
      });
    }

    if (filters.ignoredState !== 'ACTIVE') {
      const ignoredStateLabels: Record<IgnoredTransactionState, string> = {
        ACTIVE: 'Ativas',
        IGNORED: 'Ignoradas',
        ALL: 'Todas'
      };

      badges.push({
        key: 'ignoredState',
        label: 'Ignorados',
        value: ignoredStateLabels[filters.ignoredState]
      });
    }

    if (filters.search.trim()) {
      badges.push({
        key: 'search',
        label: 'Busca',
        value: filters.search.trim()
      });
    }

    return badges;
  }, [
    accounts,
    categoryFilterOptions,
    filters.accountId,
    filters.categoryIds,
    filters.ignoredState,
    filters.search,
    filters.types,
    showOnlyMaterialized
  ]);
  const projectedSavings = useMemo(
    () => Number(summary.incomeTotal || 0) - Number(summary.expenseTotal || 0),
    [summary]
  );
  const projectedSavingsCardClass = projectedSavings > 0
    ? 'border-emerald-900/60 bg-emerald-950/25'
    : projectedSavings < 0
      ? 'border-red-900/60 bg-red-950/25'
      : 'border-slate-700 bg-slate-900/40';
  const projectedSavingsTextClass = projectedSavings > 0
    ? 'text-emerald-300'
    : projectedSavings < 0
      ? 'text-red-300'
      : 'text-slate-200';
  const projectedSavingsLabelClass = projectedSavings > 0
    ? 'text-emerald-200/80'
    : projectedSavings < 0
      ? 'text-red-200/80'
      : 'text-slate-300/80';
  const settlementAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const isSelected = account.id.toString() === settlementAccountId;
      return account.type !== 'CREDIT_CARD' && (account.isActive !== false || isSelected);
    });
  }, [accounts, settlementAccountId]);

  useEffect(() => {
    void fetchAccounts();
    void fetchCategories();
    void fetchFilterPresets();
  }, []);

  useEffect(() => {
    if (
      !router.isReady ||
      !accountsResolved ||
      !categoriesResolved ||
      !presetsResolved ||
      filtersInitialized
    ) {
      return;
    }

    const resolvedInitialState = resolveInitialTransactionsFilterState({
      query: router.query,
      presets: filterPresets,
      lastUsedPresetId,
      validAccountIds,
      validCategoryIds
    });

    applyTransactionsFilterState(resolvedInitialState.state, {
      selectedPresetId: resolvedInitialState.selectedPresetId
    });
    setSelectedPresetId(resolvedInitialState.selectedPresetId);

    setFiltersInitialized(true);
  }, [
    accountsResolved,
    categoriesResolved,
    filterPresets,
    filtersInitialized,
    lastUsedPresetId,
    presetsResolved,
    router.query.accountId,
    router.query.categoryId,
    router.query.categoryIds,
    router.query.dateField,
    router.query.endDate,
    router.query.ignoredState,
    router.query.search,
    router.query.showOnlyMaterialized,
    router.query.startDate,
    router.query.status,
    router.isReady,
    validAccountIds,
    validCategoryIds
  ]);

  useEffect(() => {
    if (!router.isReady || !filtersInitialized) {
      return;
    }

    if (isCustomPeriod && customPeriodError) {
      return;
    }

    void fetchData();
  }, [
    activePeriod,
    currentPage,
    customPeriodError,
    dateField,
    filters,
    filtersInitialized,
    isCustomPeriod,
    router.isReady,
    showOnlyMaterialized
  ]);

  async function fetchData() {
    if (isCustomPeriod && customPeriodError) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: '20',
        startDate: activePeriod.startDate,
        endDate: activePeriod.endDate,
        dateField,
        includeVirtualFixed: (!showOnlyMaterialized).toString(),
        ignoredState: filters.ignoredState
      });

      if (filters.types.length === 0) {
        params.set('types', '');
      } else if (filters.types.length !== ALL_TRANSACTION_TYPES.length) {
        filters.types.forEach((type) => params.append('types', type));
      }

      if (filters.status) {
        params.set('status', filters.status);
      }

      if (filters.accountId) {
        params.set('accountId', filters.accountId);
      }

      if (filters.categoryIds.length > 0) {
        filters.categoryIds.forEach((categoryId) => {
          params.append('categoryIds', categoryId);
        });
      }

      if (filters.search.trim()) {
        params.set('search', filters.search.trim());
      }

      const response = await api.get(`/financial/transactions?${params.toString()}`);
      const apiIncomeTotal = Number(response.data.summary?.incomeTotal || 0);
      const apiExpenseTotal = Number(response.data.summary?.expenseTotal || 0);

      setTransactions(response.data.data || []);
      setTotalPages(response.data.pages || 1);
      setSummary({
        incomeTotal: apiIncomeTotal.toString(),
        expenseTotal: apiExpenseTotal.toString()
      });
    } catch (error: any) {
      const fallback = 'Erro ao carregar transacoes';
      const message = error.response?.data?.error || fallback;
      addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAccounts() {
    try {
      const response = await api.get('/financial/accounts');
      setAccounts(response.data || []);
      setAccountsAvailableForValidation(true);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
    } finally {
      setAccountsResolved(true);
    }
  }

  async function fetchCategories() {
    try {
      const response = await api.get('/financial/categories');
      setCategories(response.data || []);
      setCategoriesAvailableForValidation(true);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    } finally {
      setCategoriesResolved(true);
    }
  }

  async function fetchFilterPresets() {
    try {
      const response = await listSavedFilterPresets<TransactionsPresetPayload>(
        FILTER_PRESET_FEATURE_KEYS.financialTransactions
      );
      setFilterPresets(response.presets || []);
      setLastUsedPresetId(response.lastUsedPresetId ?? null);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar presets de filtro', 'error');
    } finally {
      setPresetsResolved(true);
    }
  }

  function applyTransactionsFilterState(
    state: ReturnType<typeof getDefaultTransactionsFilterState>,
    options: ApplyTransactionsFilterStateOptions = {}
  ) {
    setCurrentPage(1);
    setDateField(state.dateField);
    setPeriodPreset(state.periodPreset);
    setPeriodOffset(state.periodOffset);
    setCustomPeriod(state.customPeriod);
    setShowOnlyMaterialized(state.showOnlyMaterialized);
    setFilters(state.filters);
    setShowMoreFilters(
      countAdvancedTransactionFilters(state.filters, {
        showOnlyMaterialized: state.showOnlyMaterialized
      }) > 0 || Boolean(options.selectedPresetId)
    );
  }

  function getCurrentTransactionsFilterState(): ReturnType<typeof getDefaultTransactionsFilterState> {
    return {
      dateField,
      periodPreset,
      periodOffset,
      customPeriod,
      filters,
      showOnlyMaterialized
    };
  }

  function closeSavePresetModal() {
    if (presetActionLoading === 'save') {
      return;
    }

    setIsSavePresetModalOpen(false);
    setPresetName('');
  }

  function updateFilters(patch: Partial<TransactionFilters>) {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function resetFilters() {
    applyTransactionsFilterState(getDefaultTransactionsFilterState());
  }

  function shiftPeriod(direction: -1 | 1) {
    if (isCustomPeriod) {
      return;
    }

    setCurrentPage(1);
    setPeriodOffset((prev) => prev + direction);
  }

  function handlePeriodPresetChange(nextPreset: PeriodPreset) {
    setCurrentPage(1);

    if (nextPreset === 'CUSTOM') {
      setCustomPeriod(activePeriod);
      setPeriodPreset('CUSTOM');
      return;
    }

    setPeriodPreset(nextPreset);
    setPeriodOffset(0);
  }

  function handleCustomPeriodChange(field: keyof PeriodRange, value: string) {
    setCurrentPage(1);
    setCustomPeriod((prev) => ({
      ...prev,
      [field]: value
    }));
  }

  function handleDateFieldChange(nextField: TransactionDateFieldFilter) {
    setCurrentPage(1);
    setDateField(nextField);
  }

  async function handleApplySelectedPreset() {
    if (!selectedPreset) {
      return;
    }

    applyTransactionsFilterState(
      applyTransactionsPresetPayload(selectedPreset.payload, {
        validAccountIds,
        validCategoryIds
      }),
      { selectedPresetId: selectedPreset.id.toString() }
    );
    setSelectedPresetId(selectedPreset.id.toString());

    try {
      setPresetActionLoading('apply');
      const response = await markLastUsedFilterPreset(selectedPreset.id);
      setLastUsedPresetId(response.lastUsedPresetId ?? null);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao aplicar preset de filtro', 'error');
    } finally {
      setPresetActionLoading(null);
    }
  }

  async function handleSaveCurrentPreset() {
    const trimmedName = presetName.trim();

    if (!trimmedName) {
      addToast('Informe um nome para o preset', 'error');
      return;
    }

    try {
      setPresetActionLoading('save');
      const response = await createSavedFilterPreset<TransactionsPresetPayload>({
        featureKey: FILTER_PRESET_FEATURE_KEYS.financialTransactions,
        name: trimmedName,
        payload: buildTransactionsPresetPayload(getCurrentTransactionsFilterState())
      });

      setFilterPresets((prev) => [response.preset, ...prev.filter((preset) => preset.id !== response.preset.id)]);
      setLastUsedPresetId(response.lastUsedPresetId ?? response.preset.id);
      setSelectedPresetId(response.preset.id.toString());
      setIsSavePresetModalOpen(false);
      setPresetName('');
      addToast('Preset salvo com sucesso', 'success');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar preset de filtro', 'error');
    } finally {
      setPresetActionLoading(null);
    }
  }

  async function handleDeleteSelectedPreset() {
    if (!selectedPreset) {
      return;
    }

    confirmation.confirm(
      {
        title: 'Excluir Preset',
        message: `Deseja excluir o preset "${selectedPreset.name}"?`,
        confirmText: 'Excluir preset',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          setPresetActionLoading('delete');
          const response = await deleteSavedFilterPreset(selectedPreset.id);
          setFilterPresets((prev) => prev.filter((preset) => preset.id !== selectedPreset.id));
          setLastUsedPresetId(response.lastUsedPresetId ?? null);
          setSelectedPresetId('');
          addToast('Preset excluido com sucesso', 'success');
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir preset de filtro', 'error');
          throw error;
        } finally {
          setPresetActionLoading(null);
        }
      }
    );
  }

  async function handleDelete(transaction: Transaction) {
    if (!transaction.id) {
      return;
    }

    const deletePurchase = Boolean(transaction.purchaseGroupId);

    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir ${
          deletePurchase ? 'a compra inteira' : 'a transação'
        } "${formatTransactionDescription(
          transaction.description,
          transaction.installmentNumber,
          transaction.totalInstallments
        )}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/transactions/${transaction.id}`, {
            params: deletePurchase ? { scope: 'purchase' } : undefined
          });
          addToast('Transação excluída com sucesso', 'success');
          await fetchData();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir transação', 'error');
          throw error;
        }
      }
    );
  }

  async function handleArchive(transaction: Transaction) {
    if (!canArchiveTransaction(transaction)) {
      return;
    }

    const archiveTargetLabel = formatTransactionDescription(
      transaction.description,
      transaction.installmentNumber,
      transaction.totalInstallments
    );

    confirmation.confirm(
      {
        title: 'Ignorar Transacao',
        message: transaction.isVirtual || transaction.isProjected
          ? `Deseja ignorar a projecao "${archiveTargetLabel}"? Ela sera materializada e marcada como ignorada.`
          : `Deseja ignorar a transacao "${archiveTargetLabel}"? Ela deixara de entrar nos calculos e listagens operacionais.`,
        confirmText: 'Ignorar',
        cancelText: 'Cancelar',
        type: 'warning'
      },
      async () => {
        try {
          if (transaction.isVirtual || transaction.isProjected) {
            if (!transaction.fixedTemplateId) {
              throw new Error('Transacao projetada sem template associado');
            }

            const occurrenceDate = transaction.dueDate || transaction.date;
            if (!occurrenceDate) {
              throw new Error('Data da ocorrencia projetada nao encontrada');
            }

            await api.post(`/financial/fixed-transactions/${transaction.fixedTemplateId}/archive`, {
              occurrenceDate
            });
          } else if (transaction.id) {
            await api.patch(`/financial/transactions/${transaction.id}/archive`);
          }

          addToast('Transacao ignorada com sucesso', 'success');
          await fetchData();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao ignorar transacao', 'error');
          throw error;
        }
      }
    );
  }

  async function handleUnarchive(transaction: Transaction) {
    if (!transaction.id || !canUnarchiveTransaction(transaction)) {
      return;
    }

    confirmation.confirm(
      {
        title: 'Restaurar Transacao',
        message: `Deseja restaurar "${formatTransactionDescription(
          transaction.description,
          transaction.installmentNumber,
          transaction.totalInstallments
        )}"? Ela voltara a entrar nos calculos e listagens operacionais.`,
        confirmText: 'Restaurar',
        cancelText: 'Cancelar',
        type: 'info'
      },
      async () => {
        try {
          await api.patch(`/financial/transactions/${transaction.id}/unarchive`);
          addToast('Transacao restaurada com sucesso', 'success');
          await fetchData();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao restaurar transacao', 'error');
          throw error;
        }
      }
    );
  }

  async function handleMaterializeAndEdit(transaction: Transaction) {
    if (!transaction.fixedTemplateId) {
      addToast('Transação virtual sem template associado', 'error');
      return;
    }

    const occurrenceDate = transaction.dueDate || transaction.date;
    if (!occurrenceDate) {
      addToast('Data da ocorrencia virtual nao encontrada', 'error');
      return;
    }

    const key = transaction.virtualKey || `${transaction.fixedTemplateId}:${occurrenceDate}`;

    setMaterializingVirtualKey(key);

    try {
      const response = await api.post(
        `/financial/fixed-transactions/${transaction.fixedTemplateId}/materialize`,
        { occurrenceDate }
      );

      const materializedId = response.data?.transaction?.id;
      if (!materializedId) {
        addToast('Não foi possível materializar a transação virtual', 'error');
        return;
      }

      router.push(`/financial/transactions/${materializedId}`);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao materializar transação virtual', 'error');
    } finally {
      setMaterializingVirtualKey(null);
    }
  }

  async function handleOpenSettlement(transaction: Transaction) {
    if (!canSettleTransaction(transaction) || !transaction.id) {
      return;
    }

    setSettlementLoading(true);

    try {
      const response = await api.get(`/financial/transactions/${transaction.id}`);
      const detail = response.data as Transaction;
      const initialAccountId =
        detail.type === 'EXPENSE'
          ? detail.fromAccount?.id?.toString() || ''
          : detail.toAccount?.id?.toString() || '';

      setSettlementTarget(detail);
      setSettlementAccountId(initialAccountId);
      setSettlementDate(getTodayDateValue());
      setSettlementNotes(detail.notes || '');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar transacao para liquidacao', 'error');
    } finally {
      setSettlementLoading(false);
    }
  }

  function handleCloseSettlement(force = false) {
    if (settlementLoading && !force) {
      return;
    }

    setSettlementTarget(null);
    setSettlementAccountId('');
    setSettlementDate(getTodayDateValue());
    setSettlementNotes('');
  }

  async function handleConfirmSettlement() {
    if (!settlementTarget?.id) {
      return;
    }

    if (!settlementAccountId) {
      addToast(
        settlementTarget.type === 'EXPENSE'
          ? 'Selecione a conta do pagamento'
          : 'Selecione a conta do recebimento',
        'error'
      );
      return;
    }

    if (!settlementDate) {
      addToast(
        settlementTarget.type === 'EXPENSE'
          ? 'Informe a data do pagamento'
          : 'Informe a data do recebimento',
        'error'
      );
      return;
    }

    setSettlementLoading(true);

    try {
      const payload = buildTransactionUpsertPayload(settlementTarget, {
        status: 'COMPLETED',
        liquidationDate: settlementDate,
        notes: settlementNotes,
        fromAccountId:
          settlementTarget.type === 'EXPENSE'
            ? settlementAccountId
            : settlementTarget.fromAccount?.id,
        toAccountId:
          settlementTarget.type === 'INCOME'
            ? settlementAccountId
            : settlementTarget.toAccount?.id,
        repeatTimes: settlementTarget.repeatTimes ?? 0
      });

      await api.put(`/financial/transactions/${settlementTarget.id}`, payload);
      addToast(
        settlementTarget.type === 'EXPENSE'
          ? 'Despesa liquidada com sucesso'
          : 'Receita liquidada com sucesso',
        'success'
      );
      handleCloseSettlement(true);
      await fetchData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao liquidar transacao', 'error');
    } finally {
      setSettlementLoading(false);
    }
  }

  function handleSort(key: 'dueDate' | 'effectiveDate' | 'description') {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }

      return { key, direction: 'desc' };
    });
  }

  function formatCurrency(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;

    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(num || 0);
  }

  function formatDate(dateString?: string): string {
    if (!dateString) return '-';
    return formatCalendarDate(dateString);
  }

  function formatDateShort(dateString: string): string {
    return formatCalendarDate(dateString, {
      day: '2-digit',
      month: '2-digit'
    });
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'INCOME':
        return <TrendingUp size={16} className="text-green-400" />;
      case 'EXPENSE':
        return <TrendingDown size={16} className="text-red-400" />;
      case 'TRANSFER':
        return <ArrowUpDown size={16} className="text-blue-400" />;
      default:
        return <Receipt size={16} className="text-gray-400" />;
    }
  };

  const getAmountColor = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'text-green-400';
      case 'EXPENSE':
        return 'text-red-400';
      case 'TRANSFER':
        return 'text-blue-400';
      default:
        return 'text-gray-300';
    }
  };

  const getStatusIcon = (status: TransactionDisplayStatus) => {
    switch (status) {
      case 'SETTLED':
      case 'PAID':
        return <CheckCircle size={12} className="text-green-400" />;
      case 'OVERDUE':
        return <AlertTriangle size={12} className="text-red-400" />;
      case 'CANCELED':
        return <X size={12} className="text-gray-300" />;
      case 'ARCHIVED':
        return <Archive size={12} className="text-amber-300" />;
      case 'PROJECTED':
      case 'OPEN':
        return <Clock size={12} className="text-sky-300" />;
      default:
        return null;
    }
  };

  const sortedTransactions = useMemo(() => {
    const sorted = [...transactions];

    sorted.sort((a, b) => {
      const { key, direction } = sortConfig;
      const aValue = (a as any)[key];
      const bValue = (b as any)[key];

      if (!aValue && !bValue) return 0;
      if (!aValue) return direction === 'asc' ? -1 : 1;
      if (!bValue) return direction === 'asc' ? 1 : -1;

      if (key === 'description') {
        return direction === 'asc'
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue));
      }

      const comparison = compareCalendarDateValues(aValue, bValue);
      return direction === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [transactions, sortConfig]);
  const filterLabelClassName = 'mb-1 block text-sm font-medium text-gray-300';
  const filterControlClassName =
    'h-10 min-w-0 w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-sm text-white focus:border-accent focus:outline-none focus:ring';
  const compactCreateButtonClass =
    'flex h-9 items-center gap-1.5 whitespace-nowrap px-3 text-sm';
  const filterHeaderGridClass = isCustomPeriod
    ? 'grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,570px)_minmax(145px,160px)_auto] xl:items-end'
    : 'grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,520px)_minmax(145px,160px)_auto] xl:items-end';

  if (loading && transactions.length === 0) {
    return (
      <DashboardLayout title="Transações">
        <PageLoader message="Carregando transações..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Transações">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Financeiro' },
          { label: 'Transações' }
        ]}
      />

      <div className="mb-6 space-y-4">
        <h1 className="text-2xl font-semibold text-white">Transações Financeiras</h1>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
          <div className="flex flex-wrap gap-3 xl:justify-start">
          <div className="min-w-[150px] rounded-lg border border-red-900/60 bg-red-950/25 px-3 py-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-red-200/80">
              Despesas
            </div>
            <div className="mt-1 text-lg font-semibold text-red-300">
              {formatCurrency(summary.expenseTotal)}
            </div>
          </div>

          <div className="min-w-[150px] rounded-lg border border-green-900/60 bg-green-950/25 px-3 py-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-green-200/80">
              Receitas
            </div>
            <div className="mt-1 text-lg font-semibold text-green-300">
              {formatCurrency(summary.incomeTotal)}
            </div>
          </div>

          <div className={`min-w-[150px] rounded-lg border px-3 py-2 ${projectedSavingsCardClass}`}>
            <div className={`text-[11px] font-medium uppercase tracking-wide ${projectedSavingsLabelClass}`}>
              Economia projetada
            </div>
            <div className={`mt-1 text-lg font-semibold ${projectedSavingsTextClass}`}>
              {formatCurrency(projectedSavings)}
            </div>
          </div>
        </div>

          <div className="flex flex-wrap justify-end gap-2 xl:self-start">
          <Link href="/financial/transactions/new-credit-card-purchase">
            <Button
              variant="outline"
              className={`${compactCreateButtonClass} border-purple-600 text-purple-300 hover:border-purple-500 hover:bg-purple-950/40 hover:text-purple-200`}
            >
              <CreditCard size={15} />
              Nova Compra no Cartão
            </Button>
          </Link>

          <Link href="/financial/transactions/new?type=EXPENSE&locked=true">
            <Button
              variant="outline"
              className={`${compactCreateButtonClass} border-red-600 text-red-300 hover:border-red-500 hover:bg-red-950/40 hover:text-red-200`}
            >
              <TrendingDown size={15} />
              Nova Despesa
            </Button>
          </Link>

          <Link href="/financial/transactions/new?type=INCOME&locked=true">
            <Button
              variant="outline"
              className={`${compactCreateButtonClass} border-green-600 text-green-300 hover:border-green-500 hover:bg-green-950/40 hover:text-green-200`}
            >
              <TrendingUp size={15} />
              Nova Receita
            </Button>
          </Link>

          <Link href="/financial/transactions/new?type=TRANSFER&locked=true">
            <Button variant="outline" className={compactCreateButtonClass}>
              <ArrowUpDown size={15} />
              Nova Transferência
            </Button>
          </Link>
        </div>
      </div>

      </div>

      <Card className="mb-6">
        <div className={filterHeaderGridClass}>
          <div className="flex min-w-0 flex-col">
            <label className={filterLabelClassName}>Periodo de</label>
            {isCustomPeriod ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-[130px_128px_144px_144px]">
                <select
                  value={dateField}
                  onChange={(event) =>
                    handleDateFieldChange(event.target.value as TransactionDateFieldFilter)
                  }
                  aria-label="Campo de data"
                  className={filterControlClassName}
                >
                  {TRANSACTION_DATE_FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {getDateFieldOptionLabel(option.value)}
                    </option>
                  ))}
                </select>

                <select
                  value={periodPreset}
                  onChange={(event) =>
                    handlePeriodPresetChange(event.target.value as PeriodPreset)
                  }
                  className={filterControlClassName}
                >
                  <option value="CURRENT_MONTH">
                    {getPeriodOptionLabel('CURRENT_MONTH', periodPreset, activePeriod)}
                  </option>
                  <option value="CURRENT_WEEK">
                    {getPeriodOptionLabel('CURRENT_WEEK', periodPreset, activePeriod)}
                  </option>
                  <option value="CUSTOM">
                    {getPeriodOptionLabel('CUSTOM', periodPreset, activePeriod)}
                  </option>
                </select>

                <input
                  type="date"
                  value={customPeriod.startDate}
                  onChange={(event) =>
                    handleCustomPeriodChange('startDate', event.target.value)
                  }
                  aria-label="Data inicial"
                  className={filterControlClassName}
                />

                <input
                  type="date"
                  value={customPeriod.endDate}
                  onChange={(event) =>
                    handleCustomPeriodChange('endDate', event.target.value)
                  }
                  aria-label="Data final"
                  className={filterControlClassName}
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[130px_auto_minmax(150px,1fr)_auto]">
                <select
                  value={dateField}
                  onChange={(event) =>
                    handleDateFieldChange(event.target.value as TransactionDateFieldFilter)
                  }
                  aria-label="Campo de data"
                  className={filterControlClassName}
                >
                  {TRANSACTION_DATE_FIELD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {getDateFieldOptionLabel(option.value)}
                    </option>
                  ))}
                </select>

                <Button
                  variant="outline"
                  onClick={() => shiftPeriod(-1)}
                  className="flex h-10 items-center justify-center px-2.5"
                >
                  <ChevronLeft size={16} />
                </Button>

                <select
                  value={periodPreset}
                  onChange={(event) =>
                    handlePeriodPresetChange(event.target.value as PeriodPreset)
                  }
                  className={filterControlClassName}
                >
                  <option value="CURRENT_MONTH">
                    {getPeriodOptionLabel('CURRENT_MONTH', periodPreset, activePeriod)}
                  </option>
                  <option value="CURRENT_WEEK">
                    {getPeriodOptionLabel('CURRENT_WEEK', periodPreset, activePeriod)}
                  </option>
                  <option value="CUSTOM">
                    {getPeriodOptionLabel('CUSTOM', periodPreset, activePeriod)}
                  </option>
                </select>

                <Button
                  variant="outline"
                  onClick={() => shiftPeriod(1)}
                  className="flex h-10 items-center justify-center px-2.5"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col">
            <label className={filterLabelClassName}>Status</label>
            <select
              value={filters.status}
              onChange={(event) => updateFilters({ status: event.target.value })}
              className={filterControlClassName}
            >
              {TRANSACTION_STATUS_FILTER_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 flex-col">
            <span className={`${filterLabelClassName} select-none text-transparent`}>
              Ações
            </span>
            <Button
              variant="outline"
              onClick={() => setShowMoreFilters((prev) => !prev)}
              className="flex h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap px-2 text-xs xl:w-auto"
            >
              <Filter size={14} />
              {moreFiltersCount > 0 ? `Mais filtros (${moreFiltersCount})` : 'Mais filtros'}
              {showMoreFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </Button>
          </div>
        </div>

        {isCustomPeriod && customPeriodError && (
          <p className="mt-2 text-xs text-red-400">{customPeriodError}</p>
        )}

        {activeMoreFilterBadges.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Filtros ativos
            </span>
            {activeMoreFilterBadges.map((badge) => (
              <span
                key={badge.key}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-200"
              >
                <span className="text-slate-400">{badge.label}:</span>
                <span className="max-w-[220px] truncate sm:max-w-[320px]">{badge.value}</span>
              </span>
            ))}
          </div>
        )}

        {showMoreFilters && (
          <div className="mt-4 border-t border-gray-700 pt-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
              <Input
                label="Buscar"
                value={filters.search}
                onChange={(event) => updateFilters({ search: event.target.value })}
                placeholder="Descrição, observações..."
                className="mb-0 xl:col-span-2"
              />

              <div className="xl:col-span-2">
                <MultiSelect
                  label="Tipo"
                  options={TRANSACTION_TYPE_OPTIONS}
                  values={filters.types}
                  onChange={(values) =>
                    updateFilters({ types: values as TransactionTypeFilter[] })
                  }
                  placeholder="Selecione os tipos"
                  className="mb-0"
                  triggerClassName="h-10"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Exibicao</label>
                <Button
                  variant={showOnlyMaterialized ? 'accent' : 'outline'}
                  onClick={() => {
                    setCurrentPage(1);
                    setShowOnlyMaterialized((prev) => !prev);
                  }}
                  className="flex h-10 w-full items-center justify-center whitespace-nowrap px-3"
                >
                  {showOnlyMaterialized ? 'So materializadas' : 'Com projetadas'}
                </Button>
              </div>

              <div className="hidden">
                <label className="mb-1 block text-sm font-medium text-gray-300">Status</label>
                <select
                  value={filters.status}
                  onChange={(event) => updateFilters({ status: event.target.value })}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:outline-none focus:ring focus:border-accent"
                >
                  <option value="">Todos</option>
                  <option value="PENDING">Em aberto / vencida</option>
                  <option value="COMPLETED">Concluída</option>
                  <option value="CANCELED">Cancelada</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Conta</label>
                <select
                  value={filters.accountId}
                  onChange={(event) => updateFilters({ accountId: event.target.value })}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:outline-none focus:ring focus:border-accent"
                >
                  <option value="">Todas</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatAccountDisplayName(account)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <MultiSelect
                  label="Categorias"
                  options={categoryFilterOptions}
                  values={filters.categoryIds}
                  onChange={(categoryIds) => updateFilters({ categoryIds })}
                  placeholder="Todas"
                  className="mb-0"
                  triggerClassName="h-10"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Ignorados</label>
                <select
                  value={filters.ignoredState}
                  onChange={(event) =>
                    updateFilters({ ignoredState: event.target.value as IgnoredTransactionState })
                  }
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:outline-none focus:ring focus:border-accent"
                >
                  <option value="ACTIVE">Apenas ativas</option>
                  <option value="IGNORED">Apenas ignoradas</option>
                  <option value="ALL">Todas</option>
                </select>
              </div>

              <div className="xl:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-300">Presets</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-2">
                  <select
                    value={selectedPresetId}
                    onChange={(event) => setSelectedPresetId(event.target.value)}
                    className={filterControlClassName}
                    aria-label="Preset de filtros"
                  >
                    <option value="">Selecione um preset</option>
                    {filterPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name}
                        {preset.id === lastUsedPresetId ? ' (ultimo usado)' : ''}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="outline"
                    onClick={() => void handleApplySelectedPreset()}
                    disabled={!selectedPreset || presetActionLoading !== null}
                    className="flex h-10 items-center justify-center gap-1.5 px-3"
                    title="Aplicar preset selecionado"
                  >
                    <Check size={15} />
                    <span className="hidden sm:inline">Aplicar</span>
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setIsSavePresetModalOpen(true)}
                    disabled={presetActionLoading !== null}
                    className="flex h-10 items-center justify-center px-3"
                    title="Salvar filtros atuais como preset"
                  >
                    <BookmarkPlus size={15} />
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => void handleDeleteSelectedPreset()}
                    disabled={!selectedPreset || presetActionLoading !== null}
                    className="flex h-10 items-center justify-center px-3 text-red-300 hover:border-red-500 hover:text-red-200"
                    title="Excluir preset selecionado"
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={resetFilters}>
                Limpar filtros
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        {sortedTransactions.length === 0 ? (
          <div className="py-10 text-center">
            <Receipt size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="mb-4 text-gray-400">
              Nenhuma transação encontrada para o período selecionado
            </p>
            <div className="flex justify-center gap-3">
              <Link href="/financial/transactions/new-credit-card-purchase">
                <Button variant="outline" className="inline-flex items-center gap-2">
                  <CreditCard size={16} />
                  Nova Compra no Cartão
                </Button>
              </Link>
              <Link href="/financial/transactions/new">
                <Button variant="accent" className="inline-flex items-center gap-2">
                  <Plus size={16} />
                  Criar Primeira Transação
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1380px]">
                <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                  <tr>
                    <th className="w-24 px-4 py-3 text-center">Ações</th>
                    <th
                      className="w-[124px] cursor-pointer px-2 py-3 text-left whitespace-nowrap"
                      onClick={() => handleSort('dueDate')}
                    >
                      Vencimento
                      {sortConfig.key === 'dueDate' && (
                        sortConfig.direction === 'asc'
                          ? <ChevronUp size={12} className="ml-1 inline" />
                          : <ChevronDown size={12} className="ml-1 inline" />
                      )}
                    </th>
                    <th className="w-[116px] px-2 py-3 text-left">Tipo</th>
                    <th
                      className="min-w-[240px] cursor-pointer px-4 py-3 text-left"
                      onClick={() => handleSort('description')}
                    >
                      Descrição
                      {sortConfig.key === 'description' && (
                        sortConfig.direction === 'asc'
                          ? <ChevronUp size={12} className="ml-1 inline" />
                          : <ChevronDown size={12} className="ml-1 inline" />
                      )}
                    </th>
                    <th className="w-[220px] px-3 py-3 text-left">Detalhes</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Conta</th>
                    <th className="px-4 py-3 text-left">Categoria</th>
                    <th
                      className="w-[112px] cursor-pointer px-2 py-3 text-center whitespace-nowrap text-[0px]"
                      onClick={() => handleSort('effectiveDate')}
                    >
                      <span className="text-xs uppercase text-gray-400">Liquidacao</span>
                      Data de Liquidação
                      {sortConfig.key === 'effectiveDate' && (
                        sortConfig.direction === 'asc'
                          ? <ChevronUp size={12} className="ml-1 inline" />
                          : <ChevronDown size={12} className="ml-1 inline" />
                      )}
                    </th>
                  </tr>
                </thead>
	                <tbody>
	                  {sortedTransactions.map((transaction) => {
	                    const isMaterializing = materializingVirtualKey === (transaction.virtualKey || '');
	                    const isProjectedLike = Boolean(transaction.isVirtual || transaction.isProjected);
	                    const displayStatus = getTransactionDisplayStatus(transaction);
	                    const invoiceHref = getTransactionInvoiceHref(transaction);
	                    const invoiceActionHref =
	                      invoiceHref &&
	                      (transaction.isCreditCardInvoiceSummary || transaction.isCreditCardInvoicePayment)
	                        ? invoiceHref
	                        : null;
	                    const rowKey =
	                      transaction.virtualKey ||
	                      transaction.invoiceNavigation?.invoiceKey ||
	                      transaction.id ||
	                      `${transaction.description}-${transaction.date}`;
	                    const characteristicBadges = [] as React.ReactNode[];

	                    if (transaction.isCreditCardInvoiceSummary) {
	                      characteristicBadges.push(
	                        <span
	                          key="invoice-summary"
	                          className="rounded-full bg-blue-900 px-2 py-0.5 text-[10px] uppercase text-blue-200"
	                        >
	                          Fatura
	                        </span>
	                      );
	                    }

	                    if (transaction.isFixed) {
	                      characteristicBadges.push(
	                        <span
	                          key="fixed"
	                          className="rounded-full bg-indigo-900 px-2 py-0.5 text-[10px] uppercase text-indigo-200"
	                        >
	                          Fixa
	                        </span>
	                      );
	                    }

	                    if (transaction.archivedAt) {
	                      characteristicBadges.push(
	                        <span
	                          key="archived"
	                          className="rounded-full bg-amber-900 px-2 py-0.5 text-[10px] uppercase text-amber-200"
	                        >
	                          Ignorada
	                        </span>
	                      );
	                    }

	                    if (isBalanceAdjustmentTransaction(transaction)) {
	                      characteristicBadges.push(
	                        <span
	                          key="conciliation"
	                          className="rounded-full bg-amber-900 px-2 py-0.5 text-[10px] uppercase text-amber-200"
	                        >
	                          Conciliação
	                        </span>
	                      );
	                    }

	                    if (
	                      transaction.purchaseGroupId ||
	                      transaction.creditCardInvoice ||
	                      transaction.isCreditCardInvoiceSummary ||
	                      transaction.isCreditCardInvoicePayment
	                    ) {
	                      characteristicBadges.push(
	                        <span
	                          key="card"
	                          className="rounded-full bg-purple-900 px-2 py-0.5 text-[10px] uppercase text-purple-200"
	                        >
	                          Cartao
	                        </span>
	                      );
	                    }

	                    if (transaction.hasProjectedTransactions && !transaction.isProjected) {
	                      characteristicBadges.push(
	                        <span
	                          key="fixed-projection"
	                          className="rounded-full bg-sky-900 px-2 py-0.5 text-[10px] uppercase text-sky-200"
	                        >
	                          Com fixas
	                        </span>
	                      );
	                    }

	                    if (
	                      transaction.creditCardInvoice &&
	                      transaction.fromAccount?.id &&
	                      !transaction.isCreditCardInvoiceSummary &&
	                      invoiceHref
	                    ) {
	                      characteristicBadges.push(
	                        <Link
	                          key="invoice-link"
	                          href={invoiceHref}
	                          className="rounded-full bg-blue-900 px-2 py-0.5 text-[10px] uppercase text-blue-200 hover:bg-blue-800"
	                        >
	                          {`Fatura ${getInvoiceReferenceLabel(
	                            transaction.creditCardInvoice.referenceYear,
	                            transaction.creditCardInvoice.referenceMonth
	                          )}`}
	                        </Link>
	                      );
	                    }
	
	                    return (
	                      <tr
	                        key={rowKey}
	                        className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${
                            transaction.archivedAt
                              ? 'bg-amber-950/15'
                              : isProjectedLike
                                ? 'bg-sky-950/20'
                                : ''
                          }`}
	                      >
	                        <td className="px-4 py-3">
	                          <div className="flex items-center justify-center gap-1">
	                            {invoiceActionHref ? (
	                              <Link href={invoiceActionHref}>
	                                <button
	                                  className="p-1 text-gray-300 transition-colors hover:text-accent"
	                                  title="Abrir fatura"
	                                >
	                                  <CreditCard size={14} />
	                                </button>
	                              </Link>
	                            ) : transaction.isVirtual ? (
                                <>
	                                <button
	                                  onClick={() => handleMaterializeAndEdit(transaction)}
	                                  className="p-1 text-gray-300 transition-colors hover:text-accent"
                                  title="Materializar e editar"
                                  disabled={isMaterializing}
                                >
                                  {isMaterializing ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Edit2 size={14} />
                                  )}
                                </button>
                                {canArchiveTransaction(transaction) && (
                                  <button
                                    onClick={() => void handleArchive(transaction)}
                                    className="p-1 text-gray-300 transition-colors hover:text-amber-300"
                                    title="Ignorar projeção"
                                  >
                                    <Archive size={14} />
                                  </button>
                                )}
                              </>
	                            ) : (
	                              <>
	                                {canUnarchiveTransaction(transaction) ? (
                                  <button
                                    onClick={() => void handleUnarchive(transaction)}
                                    className="p-1 text-gray-300 transition-colors hover:text-emerald-300"
                                    title="Restaurar"
                                  >
                                    <ArchiveRestore size={14} />
                                  </button>
                                ) : canSettleTransaction(transaction) && (
	                                  <button
	                                    onClick={() => handleOpenSettlement(transaction)}
	                                    className="p-1 text-gray-300 transition-colors hover:text-green-400"
                                    title={transaction.type === 'EXPENSE' ? 'Liquidar despesa' : 'Liquidar receita'}
                                  >
                                    <CheckCircle size={14} />
                                  </button>
                                )}
	                                {transaction.id && !transaction.archivedAt && (
	                                  <Link href={`/financial/transactions/${transaction.id}`}>
	                                    <button
	                                      className="p-1 text-gray-300 transition-colors hover:text-accent"
                                      title="Editar"
                                    >
                                      <Edit2 size={14} />
	                                    </button>
	                                  </Link>
	                                )}
                                  {canArchiveTransaction(transaction) && (
                                    <button
                                      onClick={() => void handleArchive(transaction)}
                                      className="p-1 text-gray-300 transition-colors hover:text-amber-300"
                                      title="Ignorar"
                                    >
                                      <Archive size={14} />
                                    </button>
                                  )}
	                                {transaction.id &&
                                    !transaction.archivedAt &&
                                    (transaction.status !== 'COMPLETED' || transaction.purchaseGroupId) && (
	                                  <button
	                                    onClick={() => handleDelete(transaction)}
	                                    className="p-1 text-gray-300 transition-colors hover:text-red-400"
                                    title="Excluir"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>

                        <td className="px-2 py-3 text-gray-300 whitespace-nowrap">
                          {formatDate(transaction.dueDate)}
                        </td>

                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(transaction.type)}
                            <span className="text-sm text-gray-300">
                              {transaction.type === 'INCOME'
                                ? 'Receita'
                                : transaction.type === 'EXPENSE'
                                  ? 'Despesa'
                                  : 'Transferência'}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div>
                            <div className="flex items-center gap-2 font-medium text-white">
	                              {formatTransactionDescription(
	                                transaction.description,
	                                transaction.installmentNumber,
	                                transaction.totalInstallments
	                              )}
	                              {transaction.isCreditCardInvoiceSummary && (
	                                <span className="hidden rounded-full bg-blue-900 px-2 py-0.5 text-[10px] uppercase text-blue-200">
	                                  Fatura
	                                </span>
	                              )}
	                              {transaction.isFixed && (
                                <span className="hidden rounded-full bg-indigo-900 px-2 py-0.5 text-[10px] uppercase text-indigo-200">
                                  Fixa
                                </span>
                              )}
	                              {(transaction.purchaseGroupId || transaction.creditCardInvoice || transaction.isCreditCardInvoiceSummary || transaction.isCreditCardInvoicePayment) && (
                                <span className="hidden rounded-full bg-purple-900 px-2 py-0.5 text-[10px] uppercase text-purple-200">
                                  Cartão
                                </span>
	                              )}
	                              {transaction.hasProjectedTransactions && !transaction.isProjected && (
	                                <span className="hidden rounded-full bg-sky-900 px-2 py-0.5 text-[10px] uppercase text-sky-200">
	                                  Com fixas
	                                </span>
	                              )}
	                              {transaction.creditCardInvoice && transaction.fromAccount?.id && !transaction.isCreditCardInvoiceSummary && (
	                                invoiceHref ? (
	                                  <Link
	                                    href={invoiceHref}
	                                    className="hidden rounded-full bg-blue-900 px-2 py-0.5 text-[10px] uppercase text-blue-200 hover:bg-blue-800"
	                                  >
                                    {`Fatura ${getInvoiceReferenceLabel(
                                      transaction.creditCardInvoice.referenceYear,
                                      transaction.creditCardInvoice.referenceMonth
                                    )}`}
                                  </Link>
	                                ) : null
	                              )}
                            </div>
                            {transaction.purchaseGroupId && transaction.id && (
                              <div className="mt-1">
                                <Link
                                  href={`/financial/transactions/${transaction.id}`}
                                  className="text-xs text-accent hover:text-accent-hover"
                                >
                                  Abrir compra agrupada
                                </Link>
                              </div>
                            )}
                            {transaction.notes && (
                              <div className="mt-1 text-xs text-gray-400">{transaction.notes}</div>
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          {characteristicBadges.length > 0 ? (
                            <div className="flex max-w-[220px] flex-wrap gap-1.5">
                              {characteristicBadges}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${getAmountColor(transaction.type)}`}>
                            {formatCurrency(transaction.amount)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {getStatusIcon(displayStatus.status)}
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${getTransactionDisplayStatusClasses(displayStatus.status)}`}>
                              {getTransactionDisplayStatusLabel(displayStatus.status)}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-gray-300">
                          {getTransactionAccountDisplay(transaction)}
                        </td>

                        <td className="px-4 py-3">
                          {transaction.category ? (
                            <div className="flex items-center gap-2">
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: transaction.category.color }}
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-300">
                                  {transaction.category.name}
                                </span>
                                {isBalanceAdjustmentTransaction(transaction) && (
                                  <span className="rounded-full bg-amber-900/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                                    Conciliação
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>

                        <td className="px-2 py-3 text-center">
                          <div className="space-y-1 text-xs">
                            {transaction.effectiveDate && (
                              <div className="flex items-center justify-center gap-1 text-green-400">
                                <CheckCircle size={10} />
                                <span>{formatDateShort(transaction.effectiveDate)}</span>
                              </div>
                            )}
                            {!transaction.effectiveDate && <span className="text-gray-500">-</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between border-t border-gray-700 pt-6">
                <div className="text-sm text-gray-400">
                  Página {currentPage} de {totalPages}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {settlementTarget && (settlementTarget.type === 'EXPENSE' || settlementTarget.type === 'INCOME') && (
        <TransactionSettlementModal
          isOpen={Boolean(settlementTarget)}
          kind={settlementTarget.type}
          accounts={settlementAccounts}
          accountId={settlementAccountId}
          settlementDate={settlementDate}
          notes={settlementNotes}
          loading={settlementLoading}
          confirmLabel={settlementTarget.type === 'EXPENSE' ? 'Liquidar despesa' : 'Liquidar receita'}
          onClose={() => handleCloseSettlement()}
          onConfirm={handleConfirmSettlement}
          onAccountIdChange={setSettlementAccountId}
          onSettlementDateChange={setSettlementDate}
          onNotesChange={setSettlementNotes}
        />
      )}

      <Modal
        isOpen={isSavePresetModalOpen}
        onClose={closeSavePresetModal}
        title="Salvar preset"
        loading={presetActionLoading === 'save'}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={closeSavePresetModal}
              disabled={presetActionLoading === 'save'}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => void handleSaveCurrentPreset()}
              disabled={presetActionLoading === 'save' || !presetName.trim()}
              className="flex items-center gap-2"
            >
              {presetActionLoading === 'save' && <Loader2 size={16} className="animate-spin" />}
              Salvar
            </Button>
          </div>
        }
      >
        <Input
          id="transaction-preset-name"
          label="Nome do preset"
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
          placeholder="Ex.: Contas da empresa"
          autoFocus
          maxLength={80}
          className="mb-0"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleSaveCurrentPreset();
            }
          }}
        />
      </Modal>

      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={confirmation.handleClose}
        onConfirm={confirmation.handleConfirm}
        title={confirmation.options.title}
        message={confirmation.options.message}
        confirmText={confirmation.options.confirmText}
        cancelText={confirmation.options.cancelText}
        type={confirmation.options.type}
        loading={confirmation.loading}
      />
    </DashboardLayout>
  );
}
