import {
  CreditCardInvoiceStatus,
  TransactionStatus
} from '@prisma/client';
import {
  recognizeCreditCardTransaction,
  recognizeNonCardTransaction,
  recognizeProjectedAmount
} from '../../src/utils/financial-recognition';

describe('Financial recognition', () => {
  it('keeps a projected amount separate from materialized transactions', () => {
    expect(recognizeProjectedAmount()).toEqual({
      economicState: 'PROJECTED',
      settlementState: 'PROJECTED'
    });
  });

  it('recognizes non-card transactions from their own status', () => {
    expect(recognizeNonCardTransaction(TransactionStatus.PENDING)).toEqual({
      economicState: 'PENDING',
      settlementState: 'UNSETTLED'
    });
    expect(recognizeNonCardTransaction(TransactionStatus.COMPLETED)).toEqual({
      economicState: 'REALIZED',
      settlementState: 'SETTLED'
    });
    expect(recognizeNonCardTransaction(TransactionStatus.CANCELED)).toEqual({
      economicState: 'CANCELED',
      settlementState: 'CANCELED'
    });
  });

  it.each([
    CreditCardInvoiceStatus.OPEN,
    CreditCardInvoiceStatus.CLOSED
  ])(
    'recognizes a completed card purchase as economically realized but unsettled while its invoice is %s',
    (invoiceStatus) => {
      expect(
        recognizeCreditCardTransaction(TransactionStatus.COMPLETED, invoiceStatus)
      ).toEqual({
        economicState: 'REALIZED',
        settlementState: 'UNSETTLED'
      });
    }
  );

  it('settles a completed card transaction only after the invoice is paid', () => {
    expect(
      recognizeCreditCardTransaction(
        TransactionStatus.COMPLETED,
        CreditCardInvoiceStatus.PAID
      )
    ).toEqual({
      economicState: 'REALIZED',
      settlementState: 'SETTLED'
    });
  });

  it('does not settle a pending transaction even if the invoice is marked as paid', () => {
    expect(
      recognizeCreditCardTransaction(
        TransactionStatus.PENDING,
        CreditCardInvoiceStatus.PAID
      )
    ).toEqual({
      economicState: 'PENDING',
      settlementState: 'UNSETTLED'
    });
  });
});
