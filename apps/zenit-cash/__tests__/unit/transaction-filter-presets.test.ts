import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_TRANSACTION_TYPES,
  applyTransactionsPresetPayload,
  buildTransactionsPresetPayload,
  getDefaultTransactionsFilterState,
  getPeriodRange,
  hasExplicitTransactionFilterQuery,
  resolveInitialTransactionsFilterState,
  type TransactionsFilterState,
  type TransactionsPresetPayload
} from '@/utils/transactionFilterPresets'

describe('transaction filter presets', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 18, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serializes relative periods with offset and without custom dates', () => {
    const state: TransactionsFilterState = {
      ...getDefaultTransactionsFilterState(),
      dateField: 'effectiveDate',
      periodPreset: 'CURRENT_WEEK',
      periodOffset: -2,
      filters: {
        types: ['EXPENSE'],
        status: 'PENDING',
        accountId: '10',
        categoryIds: ['20'],
        search: 'fornecedor'
      },
      showOnlyMaterialized: true
    }

    expect(buildTransactionsPresetPayload(state)).toEqual({
      version: 1,
      dateField: 'effectiveDate',
      periodPreset: 'CURRENT_WEEK',
      periodOffset: -2,
      types: ['EXPENSE'],
      status: 'PENDING',
      accountId: '10',
      categoryId: '20',
      categoryIds: ['20'],
      search: 'fornecedor',
      showOnlyMaterialized: true
    })
  })

  it('serializes custom periods with absolute dates', () => {
    const state: TransactionsFilterState = {
      ...getDefaultTransactionsFilterState(),
      periodPreset: 'CUSTOM',
      periodOffset: 4,
      customPeriod: {
        startDate: '2026-01-10',
        endDate: '2026-02-15'
      }
    }

    expect(buildTransactionsPresetPayload(state)).toEqual({
      version: 1,
      dateField: 'dueDate',
      periodPreset: 'CUSTOM',
      customPeriod: {
        startDate: '2026-01-10',
        endDate: '2026-02-15'
      },
      types: ALL_TRANSACTION_TYPES,
      status: '',
      accountId: '',
      categoryIds: [],
      categoryId: '',
      search: '',
      showOnlyMaterialized: false
    })
  })

  it('restores a full preset payload into filter state', () => {
    const payload: TransactionsPresetPayload = {
      version: 1,
      dateField: 'createdAt',
      periodPreset: 'CUSTOM',
      customPeriod: {
        startDate: '2026-03-01',
        endDate: '2026-03-31'
      },
      types: ['INCOME', 'TRANSFER'],
      status: 'COMPLETED',
      accountId: '55',
      categoryId: '77',
      categoryIds: ['77'],
      search: 'cliente',
      showOnlyMaterialized: true
    }

    expect(
      applyTransactionsPresetPayload(payload, {
        validAccountIds: new Set(['55']),
        validCategoryIds: new Set(['77'])
      })
    ).toEqual({
      dateField: 'createdAt',
      periodPreset: 'CUSTOM',
      periodOffset: 0,
      customPeriod: {
        startDate: '2026-03-01',
        endDate: '2026-03-31'
      },
      filters: {
        types: ['INCOME', 'TRANSFER'],
        status: 'COMPLETED',
        accountId: '55',
        categoryIds: ['77'],
        search: 'cliente'
      },
      showOnlyMaterialized: true
    })
  })

  it('clears invalid account and category ids while preserving the rest of the preset', () => {
    const payload: TransactionsPresetPayload = {
      version: 1,
      dateField: 'dueDate',
      periodPreset: 'CURRENT_MONTH',
      periodOffset: 1,
      types: ['EXPENSE'],
      status: 'PENDING',
      accountId: '999',
      categoryId: '888',
      categoryIds: ['888'],
      search: 'aluguel',
      showOnlyMaterialized: false
    }

    expect(
      applyTransactionsPresetPayload(payload, {
        validAccountIds: new Set(['10']),
        validCategoryIds: new Set(['20'])
      })
    ).toMatchObject({
      periodPreset: 'CURRENT_MONTH',
      periodOffset: 1,
      filters: {
        types: ['EXPENSE'],
        status: 'PENDING',
        accountId: '',
        categoryIds: [],
        search: 'aluguel'
      }
    })
  })

  it('auto-applies the last used preset when there is no explicit query', () => {
    const payload: TransactionsPresetPayload = {
      version: 1,
      dateField: 'effectiveDate',
      periodPreset: 'CURRENT_WEEK',
      periodOffset: -1,
      types: ['EXPENSE'],
      status: 'PENDING',
      accountId: '2',
      categoryId: '7',
      categoryIds: ['7'],
      search: 'fornecedor',
      showOnlyMaterialized: true
    }

    const resolved = resolveInitialTransactionsFilterState({
      query: {},
      presets: [{ id: 42, payload }],
      lastUsedPresetId: 42,
      validAccountIds: new Set(['2']),
      validCategoryIds: new Set(['7'])
    })

    expect(resolved.selectedPresetId).toBe('42')
    expect(resolved.state).toMatchObject({
      dateField: 'effectiveDate',
      periodPreset: 'CURRENT_WEEK',
      periodOffset: -1,
      filters: {
        types: ['EXPENSE'],
        status: 'PENDING',
        accountId: '2',
        categoryIds: ['7'],
        search: 'fornecedor'
      },
      showOnlyMaterialized: true
    })
    expect(getPeriodRange('CURRENT_WEEK', resolved.state.periodOffset)).toEqual({
      startDate: '2026-06-08',
      endDate: '2026-06-14'
    })
  })

  it('respects explicit query filters and ignores the last used preset', () => {
    const resolved = resolveInitialTransactionsFilterState({
      query: {
        accountId: '99',
        search: 'energia',
        status: 'COMPLETED'
      },
      presets: [
        {
          id: 42,
          payload: {
            version: 1,
            dateField: 'dueDate',
            periodPreset: 'CURRENT_MONTH',
            periodOffset: 3,
            types: ['TRANSFER'],
            status: 'PENDING',
            accountId: '2',
            categoryId: '7',
            categoryIds: ['7'],
            search: 'preset',
            showOnlyMaterialized: true
          }
        }
      ],
      lastUsedPresetId: 42,
      validAccountIds: new Set(['2', '99']),
      validCategoryIds: new Set(['7'])
    })

    expect(resolved.selectedPresetId).toBe('')
    expect(resolved.state).toEqual({
      ...getDefaultTransactionsFilterState(),
      filters: {
        ...getDefaultTransactionsFilterState().filters,
        accountId: '99',
        categoryIds: [],
        search: 'energia',
        status: 'COMPLETED'
      }
    })
  })

  it('restores explicit multi-category and period query filters from the url', () => {
    const resolved = resolveInitialTransactionsFilterState({
      query: {
        categoryIds: ['4', '7'],
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        dateField: 'dueDate',
        showOnlyMaterialized: 'true'
      },
      presets: [],
      validCategoryIds: new Set(['4', '7'])
    })

    expect(resolved.selectedPresetId).toBe('')
    expect(resolved.state).toEqual({
      ...getDefaultTransactionsFilterState(),
      dateField: 'dueDate',
      periodPreset: 'CUSTOM',
      periodOffset: 0,
      customPeriod: {
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      },
      filters: {
        ...getDefaultTransactionsFilterState().filters,
        categoryIds: ['4', '7']
      },
      showOnlyMaterialized: true
    })
  })

  it('detects only the supported explicit query keys', () => {
    expect(hasExplicitTransactionFilterQuery({ accountId: '1' })).toBe(true)
    expect(hasExplicitTransactionFilterQuery({ categoryId: '4' })).toBe(true)
    expect(hasExplicitTransactionFilterQuery({ categoryIds: ['4', '8'] })).toBe(true)
    expect(hasExplicitTransactionFilterQuery({ status: 'PENDING' })).toBe(true)
    expect(hasExplicitTransactionFilterQuery({ search: '  energia  ' })).toBe(true)
    expect(hasExplicitTransactionFilterQuery({ startDate: '2026-06-01' })).toBe(true)
    expect(hasExplicitTransactionFilterQuery({ page: '2' })).toBe(false)
    expect(hasExplicitTransactionFilterQuery({})).toBe(false)
  })
})
