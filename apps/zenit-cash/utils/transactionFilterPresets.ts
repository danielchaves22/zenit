export type TransactionTypeFilter = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TransactionDateFieldFilter = 'dueDate' | 'date' | 'effectiveDate' | 'createdAt';
export type PeriodPreset = 'CURRENT_MONTH' | 'CURRENT_WEEK' | 'CUSTOM';

export interface PeriodRange {
  startDate: string;
  endDate: string;
}

export interface TransactionFilters {
  types: TransactionTypeFilter[];
  status: string;
  accountId: string;
  categoryId: string;
  search: string;
}

export interface TransactionsFilterState {
  dateField: TransactionDateFieldFilter;
  periodPreset: PeriodPreset;
  periodOffset: number;
  customPeriod: PeriodRange;
  filters: TransactionFilters;
  showOnlyMaterialized: boolean;
}

export interface TransactionsPresetPayload {
  version: 1;
  dateField: TransactionDateFieldFilter;
  periodPreset: PeriodPreset;
  periodOffset?: number;
  customPeriod?: PeriodRange;
  types: TransactionTypeFilter[];
  status: string;
  accountId: string;
  categoryId: string;
  search: string;
  showOnlyMaterialized: boolean;
}

export interface TransactionPresetCandidate {
  id: number;
  payload: unknown;
}

interface ApplyTransactionsPresetPayloadOptions {
  validAccountIds?: Set<string> | null;
  validCategoryIds?: Set<string> | null;
}

interface ResolveInitialTransactionsFilterStateOptions {
  query: Record<string, string | string[] | undefined>;
  presets: TransactionPresetCandidate[];
  lastUsedPresetId?: number | null;
  validAccountIds?: Set<string> | null;
  validCategoryIds?: Set<string> | null;
}

export interface ResolvedTransactionsInitialFilterState {
  state: TransactionsFilterState;
  selectedPresetId: string;
}

export const ALL_TRANSACTION_TYPES: TransactionTypeFilter[] = ['INCOME', 'EXPENSE', 'TRANSFER'];
export const DEFAULT_TRANSACTION_DATE_FIELD: TransactionDateFieldFilter = 'dueDate';

export function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseInputDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(date: Date): Date {
  const normalized = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = normalized.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;

  normalized.setDate(normalized.getDate() + diff);
  normalized.setHours(0, 0, 0, 0);

  return normalized;
}

export function getPeriodRange(
  preset: Exclude<PeriodPreset, 'CUSTOM'>,
  offset: number
): PeriodRange {
  const today = new Date();

  if (preset === 'CURRENT_WEEK') {
    const start = startOfWeek(today);
    start.setDate(start.getDate() + offset * 7);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    return {
      startDate: formatDateForInput(start),
      endDate: formatDateForInput(end)
    };
  }

  const start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);

  return {
    startDate: formatDateForInput(start),
    endDate: formatDateForInput(end)
  };
}

export function getDefaultTransactionsFilterState(): TransactionsFilterState {
  return {
    dateField: DEFAULT_TRANSACTION_DATE_FIELD,
    periodPreset: 'CURRENT_MONTH',
    periodOffset: 0,
    customPeriod: getPeriodRange('CURRENT_MONTH', 0),
    filters: {
      types: [...ALL_TRANSACTION_TYPES],
      status: '',
      accountId: '',
      categoryId: '',
      search: ''
    },
    showOnlyMaterialized: false
  };
}

function isTransactionDateFieldFilter(value: unknown): value is TransactionDateFieldFilter {
  return (
    value === 'dueDate' ||
    value === 'date' ||
    value === 'effectiveDate' ||
    value === 'createdAt'
  );
}

function isPeriodPreset(value: unknown): value is PeriodPreset {
  return value === 'CURRENT_MONTH' || value === 'CURRENT_WEEK' || value === 'CUSTOM';
}

function isPeriodRange(value: unknown): value is PeriodRange {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as PeriodRange).startDate === 'string' &&
      typeof (value as PeriodRange).endDate === 'string'
  );
}

function isTransactionTypeFilter(value: unknown): value is TransactionTypeFilter {
  return value === 'INCOME' || value === 'EXPENSE' || value === 'TRANSFER';
}

function normalizeTransactionTypes(value: unknown): TransactionTypeFilter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const types = value.filter(isTransactionTypeFilter);

  return types.length > 0 ? Array.from(new Set(types)) : [];
}

function normalizeLookupValue(value: unknown, validIds?: Set<string> | null): string {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  if (validIds === null || validIds === undefined) {
    return value;
  }

  return validIds.has(value) ? value : '';
}

export function buildTransactionsPresetPayload(
  state: TransactionsFilterState
): TransactionsPresetPayload {
  const payload: TransactionsPresetPayload = {
    version: 1,
    dateField: state.dateField,
    periodPreset: state.periodPreset,
    types: [...state.filters.types],
    status: state.filters.status,
    accountId: state.filters.accountId,
    categoryId: state.filters.categoryId,
    search: state.filters.search,
    showOnlyMaterialized: state.showOnlyMaterialized
  };

  if (state.periodPreset === 'CUSTOM') {
    payload.customPeriod = {
      startDate: state.customPeriod.startDate,
      endDate: state.customPeriod.endDate
    };
  } else {
    payload.periodOffset = state.periodOffset;
  }

  return payload;
}

export function applyTransactionsPresetPayload(
  payload: unknown,
  options: ApplyTransactionsPresetPayloadOptions = {}
): TransactionsFilterState {
  const defaults = getDefaultTransactionsFilterState();

  if (!payload || typeof payload !== 'object') {
    return defaults;
  }

  const data = payload as Record<string, unknown>;
  const periodPreset = isPeriodPreset(data.periodPreset) ? data.periodPreset : defaults.periodPreset;
  const periodOffset =
    periodPreset === 'CUSTOM'
      ? 0
      : typeof data.periodOffset === 'number' && Number.isInteger(data.periodOffset)
        ? data.periodOffset
        : 0;

  return {
    dateField: isTransactionDateFieldFilter(data.dateField)
      ? data.dateField
      : defaults.dateField,
    periodPreset,
    periodOffset,
    customPeriod:
      periodPreset === 'CUSTOM' && isPeriodRange(data.customPeriod)
        ? {
            startDate: data.customPeriod.startDate,
            endDate: data.customPeriod.endDate
          }
        : defaults.customPeriod,
    filters: {
      types: normalizeTransactionTypes(data.types).length
        ? normalizeTransactionTypes(data.types)
        : [...ALL_TRANSACTION_TYPES],
      status: typeof data.status === 'string' ? data.status : '',
      accountId: normalizeLookupValue(data.accountId, options.validAccountIds),
      categoryId: normalizeLookupValue(data.categoryId, options.validCategoryIds),
      search: typeof data.search === 'string' ? data.search : ''
    },
    showOnlyMaterialized:
      typeof data.showOnlyMaterialized === 'boolean'
        ? data.showOnlyMaterialized
        : defaults.showOnlyMaterialized
  };
}

export function countAdvancedTransactionFilters(filters: Pick<TransactionFilters, 'search' | 'status' | 'accountId' | 'categoryId'>): number {
  let count = 0;

  if (filters.search.trim()) count += 1;
  if (filters.status) count += 1;
  if (filters.accountId) count += 1;
  if (filters.categoryId) count += 1;

  return count;
}

export function getSingleQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return value || '';
}

export function hasExplicitTransactionFilterQuery(
  query: Record<string, string | string[] | undefined>
): boolean {
  return Boolean(
    getSingleQueryValue(query.accountId) ||
      getSingleQueryValue(query.categoryId) ||
      getSingleQueryValue(query.status) ||
      getSingleQueryValue(query.search).trim()
  );
}

export function resolveInitialTransactionsFilterState(
  options: ResolveInitialTransactionsFilterStateOptions
): ResolvedTransactionsInitialFilterState {
  const defaults = getDefaultTransactionsFilterState();

  if (hasExplicitTransactionFilterQuery(options.query)) {
    return {
      state: {
        ...defaults,
        filters: {
          ...defaults.filters,
          accountId: getSingleQueryValue(options.query.accountId),
          categoryId: getSingleQueryValue(options.query.categoryId),
          search: getSingleQueryValue(options.query.search),
          status: getSingleQueryValue(options.query.status)
        }
      },
      selectedPresetId: ''
    };
  }

  const lastUsedPreset = options.lastUsedPresetId
    ? options.presets.find((preset) => preset.id === options.lastUsedPresetId) || null
    : null;

  if (!lastUsedPreset) {
    return {
      state: defaults,
      selectedPresetId: ''
    };
  }

  return {
    state: applyTransactionsPresetPayload(lastUsedPreset.payload, {
      validAccountIds: options.validAccountIds,
      validCategoryIds: options.validCategoryIds
    }),
    selectedPresetId: lastUsedPreset.id.toString()
  };
}
