export interface ResolveTransactionListPathParams {
  createFlow?: 'standard' | 'credit-card-purchase'
  defaultCreditCardId?: string | null
  fromAccountId?: string | null
  selectedFromAccountType?: string | null
  transactionFromAccountId?: number | null
  transactionFromAccountType?: string | null
}

export function resolveTransactionListPath(
  params: ResolveTransactionListPathParams
): string {
  const isCreditCardContext =
    params.createFlow === 'credit-card-purchase' ||
    params.selectedFromAccountType === 'CREDIT_CARD' ||
    params.transactionFromAccountType === 'CREDIT_CARD' ||
    Boolean(params.defaultCreditCardId)

  if (!isCreditCardContext) {
    return '/financial/transactions'
  }

  const accountId =
    params.fromAccountId ||
    (params.transactionFromAccountId ? String(params.transactionFromAccountId) : '') ||
    params.defaultCreditCardId ||
    ''

  return accountId ? `/financial/credit-cards/${accountId}/invoices` : '/financial/credit-cards'
}
