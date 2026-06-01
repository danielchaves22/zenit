import { describe, expect, it } from 'vitest'
import { getFixedTransactionAccountScope } from '@/pages/financial/fixed-transactions'

describe('getFixedTransactionAccountScope', () => {
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
})
