import { resolveMonthlyProjectionCompetence } from '../../src/utils/monthly-projection-competence';

describe('Monthly projection competence', () => {
  it('assigns a non-card installment to its due month', () => {
    const competence = resolveMonthlyProjectionCompetence({
      kind: 'MATERIALIZED_NON_CARD',
      transactionDate: new Date('2026-08-12T12:00:00.000Z'),
      dueDate: new Date('2026-10-05T12:00:00.000Z'),
      installmentNumber: 2,
      totalInstallments: 6,
      installmentPlanId: 'plan-123'
    });

    expect(competence).toEqual({
      month: '2026-10',
      basis: 'TRANSACTION_DUE_DATE',
      installment: {
        kind: 'NON_CARD_INSTALLMENT',
        number: 2,
        total: 6,
        seriesId: 'plan-123'
      }
    });
  });

  it('assigns a credit-card installment to the invoice due month, not the purchase month', () => {
    const competence = resolveMonthlyProjectionCompetence({
      kind: 'MATERIALIZED_CREDIT_CARD',
      invoiceDueDate: new Date('2026-11-10T12:00:00.000Z'),
      installmentNumber: 3,
      totalInstallments: 10,
      purchaseGroupId: 'purchase-456'
    });

    expect(competence).toEqual({
      month: '2026-11',
      basis: 'CREDIT_CARD_INVOICE_DUE_DATE',
      installment: {
        kind: 'CREDIT_CARD_INSTALLMENT',
        number: 3,
        total: 10,
        seriesId: 'purchase-456'
      }
    });
  });

  it('keeps a finite repetition distinct from an installment purchase', () => {
    const competence = resolveMonthlyProjectionCompetence({
      kind: 'MATERIALIZED_NON_CARD',
      transactionDate: new Date('2026-12-15T12:00:00.000Z'),
      dueDate: null,
      installmentNumber: 2,
      totalInstallments: 3,
      installmentPlanId: null
    });

    expect(competence).toEqual({
      month: '2026-12',
      basis: 'TRANSACTION_DATE',
      installment: {
        kind: 'FINITE_SERIES',
        number: 2,
        total: 3,
        seriesId: null
      }
    });
  });

  it('uses the computed invoice due date for a projected fixed card occurrence', () => {
    const competence = resolveMonthlyProjectionCompetence({
      kind: 'PROJECTED_FIXED',
      occurrenceDate: new Date('2026-09-28T12:00:00.000Z'),
      creditCardInvoiceDueDate: new Date('2026-10-10T12:00:00.000Z')
    });

    expect(competence).toEqual({
      month: '2026-10',
      basis: 'CREDIT_CARD_INVOICE_DUE_DATE',
      installment: null
    });
  });
});
