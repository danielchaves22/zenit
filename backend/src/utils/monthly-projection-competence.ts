import { formatFinancialMonthKey } from './financial-calendar';

export type MonthlyProjectionCompetenceBasis =
  | 'TRANSACTION_DUE_DATE'
  | 'TRANSACTION_DATE'
  | 'CREDIT_CARD_INVOICE_DUE_DATE'
  | 'FIXED_OCCURRENCE_DATE';

export type MonthlyProjectionInstallmentKind =
  | 'NON_CARD_INSTALLMENT'
  | 'CREDIT_CARD_INSTALLMENT'
  | 'FINITE_SERIES';

export type MonthlyProjectionInstallment = Readonly<{
  kind: MonthlyProjectionInstallmentKind;
  number: number | null;
  total: number | null;
  seriesId: string | null;
}>;

export type MonthlyProjectionCompetence = Readonly<{
  month: string;
  basis: MonthlyProjectionCompetenceBasis;
  installment: MonthlyProjectionInstallment | null;
}>;

type InstallmentMetadata = {
  installmentNumber: number | null;
  totalInstallments: number | null;
};

type MonthlyProjectionCompetenceInput =
  | ({
      kind: 'MATERIALIZED_NON_CARD';
      transactionDate: Date;
      dueDate: Date | null;
      installmentPlanId: string | null;
    } & InstallmentMetadata)
  | ({
      kind: 'MATERIALIZED_CREDIT_CARD';
      invoiceDueDate: Date;
      purchaseGroupId: string | null;
    } & InstallmentMetadata)
  | {
      kind: 'PROJECTED_FIXED';
      occurrenceDate: Date;
      creditCardInvoiceDueDate?: Date | null;
    };

function hasMultipleInstallments(metadata: InstallmentMetadata): boolean {
  return (metadata.totalInstallments ?? 0) > 1;
}

function buildInstallment(
  kind: MonthlyProjectionInstallmentKind,
  metadata: InstallmentMetadata,
  seriesId: string | null
): MonthlyProjectionInstallment {
  return {
    kind,
    number: metadata.installmentNumber,
    total: metadata.totalInstallments,
    seriesId
  };
}

/**
 * Resolves the month in which one known projection fact participates.
 *
 * The purchase date never moves a credit-card installment out of the month in
 * which its invoice is due. For non-card commitments, due date is authoritative
 * and transaction date is kept only as a compatibility fallback for legacy rows.
 */
export function resolveMonthlyProjectionCompetence(
  input: MonthlyProjectionCompetenceInput
): MonthlyProjectionCompetence {
  if (input.kind === 'PROJECTED_FIXED') {
    const isCreditCardOccurrence = Boolean(input.creditCardInvoiceDueDate);
    const competenceDate = input.creditCardInvoiceDueDate ?? input.occurrenceDate;

    return {
      month: formatFinancialMonthKey(competenceDate),
      basis: isCreditCardOccurrence
        ? 'CREDIT_CARD_INVOICE_DUE_DATE'
        : 'FIXED_OCCURRENCE_DATE',
      installment: null
    };
  }

  if (input.kind === 'MATERIALIZED_CREDIT_CARD') {
    return {
      month: formatFinancialMonthKey(input.invoiceDueDate),
      basis: 'CREDIT_CARD_INVOICE_DUE_DATE',
      installment: hasMultipleInstallments(input)
        ? buildInstallment('CREDIT_CARD_INSTALLMENT', input, input.purchaseGroupId)
        : null
    };
  }

  const competenceDate = input.dueDate ?? input.transactionDate;
  let installment: MonthlyProjectionInstallment | null = null;

  if (input.installmentPlanId) {
    installment = buildInstallment('NON_CARD_INSTALLMENT', input, input.installmentPlanId);
  } else if (hasMultipleInstallments(input)) {
    installment = buildInstallment('FINITE_SERIES', input, null);
  }

  return {
    month: formatFinancialMonthKey(competenceDate),
    basis: input.dueDate ? 'TRANSACTION_DUE_DATE' : 'TRANSACTION_DATE',
    installment
  };
}
