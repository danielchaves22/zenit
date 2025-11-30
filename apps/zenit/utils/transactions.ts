export function formatTransactionDescription(
  description: string,
  installmentNumber?: number | null,
  totalInstallments?: number | null
): string {
  if (
    totalInstallments !== null &&
    totalInstallments !== undefined &&
    totalInstallments > 1 &&
    installmentNumber !== null &&
    installmentNumber !== undefined
  ) {
    return `${description} (${installmentNumber} de ${totalInstallments})`;
  }

  return description;
}
