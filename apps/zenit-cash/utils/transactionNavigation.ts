export interface ResolveTransactionListPathParams {
  explicitReturnTo?: string | null
  createFlow?: 'standard' | 'credit-card-purchase'
  defaultCreditCardId?: string | null
  defaultFinancialAccountId?: string | null
  fromAccountId?: string | null
  selectedFromAccountType?: string | null
  transactionFromAccountId?: number | null
  transactionFromAccountType?: string | null
}

function normalizeInternalReturnPath(path?: string | null): string | null {
  if (!path) {
    return null
  }

  const normalizedPath = path.trim()
  if (!normalizedPath.startsWith('/') || normalizedPath.startsWith('//')) {
    return null
  }

  return normalizedPath
}

export function resolveTransactionListPath(
  params: ResolveTransactionListPathParams
): string {
  const explicitReturnTo = normalizeInternalReturnPath(params.explicitReturnTo)
  if (explicitReturnTo) {
    return explicitReturnTo
  }

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
