export type TransactionTypeFilter = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type TransactionDateFieldFilter = 'dueDate' | 'date' | 'effectiveDate' | 'createdAt';
export type PeriodPreset = 'CURRENT_MONTH' | 'CURRENT_WEEK' | 'CUSTOM';
export type IgnoredTransactionState = 'ACTIVE' | 'IGNORED' | 'ALL';

export interface PeriodRange {
  startDate: string;
  endDate: string;
}

export interface TransactionFilters {
  types: TransactionTypeFilter[];
  status: string;
  ignoredState: IgnoredTransactionState;
  accountId: string;
  categoryIds: string[];
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
  ignoredState: IgnoredTransactionState;
  accountId: string;
  categoryId: string;
  categoryIds?: string[];
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
export const DEFAULT_IGNORED_TRANSACTION_STATE: IgnoredTransactionState = 'ACTIVE';

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
      ignoredState: DEFAULT_IGNORED_TRANSACTION_STATE,
      accountId: '',
      categoryIds: [],
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

function isIgnoredTransactionState(value: unknown): value is IgnoredTransactionState {
  return value === 'ACTIVE' || value === 'IGNORED' || value === 'ALL';
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

function normalizeLookupValues(value: unknown, validIds?: Set<string> | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedValues = value
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .map((item) => normalizeLookupValue(item, validIds))
    .filter(Boolean);

  return Array.from(new Set(normalizedValues));
}

function isInputDateValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function parseBooleanQueryValue(value: string): boolean | undefined {
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  return undefined;
}

function hasQueryKey(
  query: Record<string, string | string[] | undefined>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(query, key);
}

function parseIntegerQueryValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function buildTransactionsPresetPayload(
  state: TransactionsFilterState
): TransactionsPresetPayload {
  const singleCategoryId =
    state.filters.categoryIds.length === 1 ? state.filters.categoryIds[0] : '';
  const payload: TransactionsPresetPayload = {
    version: 1,
    dateField: state.dateField,
    periodPreset: state.periodPreset,
    types: [...state.filters.types],
    status: state.filters.status,
    ignoredState: state.filters.ignoredState,
    accountId: state.filters.accountId,
    categoryId: singleCategoryId,
    categoryIds: [...state.filters.categoryIds],
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
  const normalizedCategoryIds = normalizeLookupValues(data.categoryIds, options.validCategoryIds);
  const legacyCategoryId = normalizeLookupValue(data.categoryId, options.validCategoryIds);

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
      ignoredState: isIgnoredTransactionState(data.ignoredState)
        ? data.ignoredState
        : defaults.filters.ignoredState,
      accountId: normalizeLookupValue(data.accountId, options.validAccountIds),
      categoryIds:
        normalizedCategoryIds.length > 0
          ? normalizedCategoryIds
          : legacyCategoryId
            ? [legacyCategoryId]
            : [],
      search: typeof data.search === 'string' ? data.search : ''
    },
    showOnlyMaterialized:
      typeof data.showOnlyMaterialized === 'boolean'
        ? data.showOnlyMaterialized
        : defaults.showOnlyMaterialized
  };
}

export function countAdvancedTransactionFilters(
  filters: Pick<TransactionFilters, 'types' | 'ignoredState' | 'accountId' | 'categoryIds'>,
  options: { showOnlyMaterialized?: boolean } = {}
): number {
  let count = 0;

  if (
    filters.types.length !== ALL_TRANSACTION_TYPES.length ||
    ALL_TRANSACTION_TYPES.some((type) => !filters.types.includes(type))
  ) {
    count += 1;
  }
  if (options.showOnlyMaterialized) count += 1;
  if (filters.ignoredState !== DEFAULT_IGNORED_TRANSACTION_STATE) count += 1;
  if (filters.accountId) count += 1;
  if (filters.categoryIds.length > 0) count += 1;

  return count;
}

export function getSingleQueryValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }

  return value || '';
}

export function getMultiQueryValues(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean);
}

export function hasExplicitTransactionFilterQuery(
  query: Record<string, string | string[] | undefined>
): boolean {
  return Boolean(
    getSingleQueryValue(query.accountId) ||
      hasQueryKey(query, 'types') ||
      getMultiQueryValues(query.categoryIds).length > 0 ||
      getSingleQueryValue(query.categoryId) ||
      getSingleQueryValue(query.status) ||
      getSingleQueryValue(query.ignoredState) ||
      getSingleQueryValue(query.search).trim() ||
      getSingleQueryValue(query.startDate) ||
      getSingleQueryValue(query.endDate) ||
      getSingleQueryValue(query.dateField) ||
      getSingleQueryValue(query.periodPreset) ||
      getSingleQueryValue(query.periodOffset) ||
      getSingleQueryValue(query.showOnlyMaterialized)
  );
}

export function resolveInitialTransactionsFilterState(
  options: ResolveInitialTransactionsFilterStateOptions
): ResolvedTransactionsInitialFilterState {
  const defaults = getDefaultTransactionsFilterState();

  if (hasExplicitTransactionFilterQuery(options.query)) {
    const explicitCategoryIds = normalizeLookupValues(
      getMultiQueryValues(options.query.categoryIds),
      options.validCategoryIds
    );
    const legacyCategoryId = normalizeLookupValue(
      getSingleQueryValue(options.query.categoryId),
      options.validCategoryIds
    );
    const startDate = getSingleQueryValue(options.query.startDate);
    const endDate = getSingleQueryValue(options.query.endDate);
    const hasExplicitCustomPeriod = isInputDateValue(startDate) && isInputDateValue(endDate);
    const explicitShowOnlyMaterialized = parseBooleanQueryValue(
      getSingleQueryValue(options.query.showOnlyMaterialized)
    );
    const explicitDateFieldCandidate = getSingleQueryValue(options.query.dateField);
    const explicitPeriodPresetCandidate = getSingleQueryValue(options.query.periodPreset);
    const explicitPeriodPreset = isPeriodPreset(explicitPeriodPresetCandidate)
      ? explicitPeriodPresetCandidate
      : null;
    const explicitPeriodOffset = parseIntegerQueryValue(
      getSingleQueryValue(options.query.periodOffset),
      defaults.periodOffset
    );
    const rawTypeFilters = getMultiQueryValues(options.query.types);
    const explicitTypeFilters = normalizeTransactionTypes(rawTypeFilters);
    const hasExplicitTypes = hasQueryKey(options.query, 'types');
    let resolvedPeriodPreset = defaults.periodPreset;
    let resolvedPeriodOffset = defaults.periodOffset;
    let resolvedCustomPeriod = defaults.customPeriod;

    if (explicitPeriodPreset === 'CUSTOM') {
      if (hasExplicitCustomPeriod) {
        resolvedPeriodPreset = 'CUSTOM';
        resolvedPeriodOffset = 0;
        resolvedCustomPeriod = { startDate, endDate };
      }
    } else if (explicitPeriodPreset) {
      resolvedPeriodPreset = explicitPeriodPreset;
      resolvedPeriodOffset = explicitPeriodOffset;
    } else if (hasExplicitCustomPeriod) {
      resolvedPeriodPreset = 'CUSTOM';
      resolvedPeriodOffset = 0;
      resolvedCustomPeriod = { startDate, endDate };
    }

    return {
      state: {
        ...defaults,
        dateField: isTransactionDateFieldFilter(explicitDateFieldCandidate)
          ? explicitDateFieldCandidate
          : defaults.dateField,
        periodPreset: resolvedPeriodPreset,
        periodOffset: resolvedPeriodOffset,
        customPeriod: resolvedCustomPeriod,
        filters: {
          ...defaults.filters,
          types: hasExplicitTypes
            ? rawTypeFilters.length > 0
              ? explicitTypeFilters.length > 0
                ? explicitTypeFilters
                : defaults.filters.types
              : []
            : defaults.filters.types,
          accountId: normalizeLookupValue(
            getSingleQueryValue(options.query.accountId),
            options.validAccountIds
          ),
          categoryIds:
            explicitCategoryIds.length > 0
              ? explicitCategoryIds
              : legacyCategoryId
                ? [legacyCategoryId]
                : [],
          search: getSingleQueryValue(options.query.search),
          status: getSingleQueryValue(options.query.status),
          ignoredState: isIgnoredTransactionState(getSingleQueryValue(options.query.ignoredState))
            ? (getSingleQueryValue(options.query.ignoredState) as IgnoredTransactionState)
            : defaults.filters.ignoredState
        },
        showOnlyMaterialized: explicitShowOnlyMaterialized ?? defaults.showOnlyMaterialized
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
