export function getAccountTypeLabel(type?: string | null): string {
  const labels: Record<string, string> = {
    CHECKING: 'Conta Corrente',
    SAVINGS: 'Poupança',
    CREDIT_CARD: 'Cartão de Crédito',
    INVESTMENT: 'Investimento',
    CASH: 'Dinheiro'
  };

  if (!type) {
    return 'Conta';
  }

  return labels[type] || type;
}

export function formatAccountDisplayName(account?: {
  name?: string | null;
  type?: string | null;
} | null): string {
  if (!account?.name) {
    return '-';
  }

  return `${account.name} (${getAccountTypeLabel(account.type)})`;
}
