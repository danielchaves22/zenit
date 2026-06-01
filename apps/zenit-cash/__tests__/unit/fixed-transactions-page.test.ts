import { describe, expect, it } from 'vitest'
import {
  getFixedTransactionAccountScope,
  sortFixedTransactions
} from '@/pages/financial/fixed-transactions'

describe('fixed transactions page helpers', () => {
  it('classifies credit card fixed expenses as card entries', () => {
    expect(
      getFixedTransactionAccountScope({
        type: 'EXPENSE',
        fromAccount: { id: 1, name: 'Nubank', type: 'CREDIT_CARD' },
        toAccount: null
      })
    ).toBe('CREDIT_CARD')
  })

  it('classifies non-card and unlinked fixed entries as liquidity entries', () => {
    expect(
      getFixedTransactionAccountScope({
        type: 'INCOME',
        fromAccount: null,
        toAccount: { id: 2, name: 'Conta Principal', type: 'CHECKING' }
      })
    ).toBe('LIQUID')

    expect(
      getFixedTransactionAccountScope({
        type: 'EXPENSE',
        fromAccount: null,
        toAccount: null
      })
    ).toBe('LIQUID')
  })

  it('sorts fixed transactions by description', () => {
    const items = [
      {
        id: 3,
        description: 'Zebra',
        amount: '35.90',
        nextDueDate: '2026-06-20T00:00:00.000Z'
      },
      {
        id: 1,
        description: 'Alpha',
        amount: '12.50',
        nextDueDate: '2026-06-15T00:00:00.000Z'
      },
      {
        id: 2,
        description: 'beta',
        amount: '9.90',
        nextDueDate: '2026-06-10T00:00:00.000Z'
      }
    ] as any

    expect(
      sortFixedTransactions(items, 'description', 'asc').map((item) => item.id)
    ).toEqual([1, 2, 3])

    expect(
      sortFixedTransactions(items, 'description', 'desc').map((item) => item.id)
    ).toEqual([3, 2, 1])
  })

  it('sorts fixed transactions by next due date', () => {
    const items = [
      {
        id: 1,
        description: 'Conta de Luz',
        amount: '120.00',
        nextDueDate: '2026-06-20T00:00:00.000Z'
      },
      {
        id: 2,
        description: 'Internet',
        amount: '89.90',
        nextDueDate: '2026-06-05T00:00:00.000Z'
      },
      {
        id: 3,
        description: 'Agua',
        amount: '65.40',
        nextDueDate: '2026-06-12T00:00:00.000Z'
      }
    ] as any

    expect(
      sortFixedTransactions(items, 'nextDueDate', 'asc').map((item) => item.id)
    ).toEqual([2, 3, 1])

    expect(
      sortFixedTransactions(items, 'nextDueDate', 'desc').map((item) => item.id)
    ).toEqual([1, 3, 2])
  })

  it('sorts fixed transactions by amount', () => {
    const items = [
      {
        id: 1,
        description: 'Conta de Luz',
        amount: '120.00',
        nextDueDate: '2026-06-20T00:00:00.000Z'
      },
      {
        id: 2,
        description: 'Internet',
        amount: '9.90',
        nextDueDate: '2026-06-05T00:00:00.000Z'
      },
      {
        id: 3,
        description: 'Agua',
        amount: '65.40',
        nextDueDate: '2026-06-12T00:00:00.000Z'
      }
    ] as any

    expect(
      sortFixedTransactions(items, 'amount', 'asc').map((item) => item.id)
    ).toEqual([2, 3, 1])

    expect(
      sortFixedTransactions(items, 'amount', 'desc').map((item) => item.id)
    ).toEqual([1, 3, 2])
  })
})
