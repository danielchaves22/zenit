import { describe, expect, it } from 'vitest'
import { resolveTransactionListPath } from '@/utils/transactionNavigation'

describe('resolveTransactionListPath', () => {
  it('prefers an explicit internal return path when provided', () => {
    expect(
      resolveTransactionListPath({
        explicitReturnTo: '/financial/accounts?type=CHECKING&isActive=true',
        createFlow: 'standard',
        fromAccountId: '2',
        selectedFromAccountType: 'CHECKING'
      })
    ).toBe('/financial/accounts?type=CHECKING&isActive=true')
  })

  it('ignores explicit external return paths', () => {
    expect(
      resolveTransactionListPath({
        explicitReturnTo: 'https://example.com/evil',
        createFlow: 'standard',
        fromAccountId: '2',
        selectedFromAccountType: 'CHECKING'
      })
    ).toBe('/financial/transactions')
  })

  it('returns the transaction list for non-card transactions', () => {
    expect(
      resolveTransactionListPath({
        createFlow: 'standard',
        fromAccountId: '2',
        selectedFromAccountType: 'CHECKING'
      })
    ).toBe('/financial/transactions')
  })

  it('returns the card invoices page for credit card transactions', () => {
    expect(
      resolveTransactionListPath({
        createFlow: 'standard',
        fromAccountId: '37',
        selectedFromAccountType: 'CREDIT_CARD'
      })
    ).toBe('/financial/credit-cards/37/invoices')
  })

  it('falls back to the cards hub when the card id is still unavailable', () => {
    expect(
      resolveTransactionListPath({
        createFlow: 'credit-card-purchase',
        defaultCreditCardId: null,
        fromAccountId: null,
        selectedFromAccountType: null
      })
    ).toBe('/financial/credit-cards')
  })
})
