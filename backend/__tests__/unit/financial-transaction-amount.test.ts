import {
  CreditCardCreditKind,
  TransactionType
} from '@prisma/client';
import {
  getAccountSignedTransactionAmount,
  getCreditCardInvoiceSignedAmount,
  getWorkspaceSignedTransactionAmount
} from '../../src/utils/financial-transaction-amount';

describe('Financial transaction signed amounts', () => {
  it.each([
    [TransactionType.INCOME, '125.45'],
    [TransactionType.EXPENSE, '-125.45'],
    [TransactionType.TRANSFER, '0.00']
  ])('represents the workspace effect of %s', (type, expected) => {
    expect(
      getWorkspaceSignedTransactionAmount({ amount: '125.45', type }).toFixed(2)
    ).toBe(expected);
  });

  it('represents income and expense from the affected account perspective', () => {
    const income = {
      amount: '80.00',
      type: TransactionType.INCOME,
      fromAccountId: null,
      toAccountId: 2
    };
    const expense = {
      amount: '30.00',
      type: TransactionType.EXPENSE,
      fromAccountId: 2,
      toAccountId: null
    };

    expect(getAccountSignedTransactionAmount(income, 2).toFixed(2)).toBe('80.00');
    expect(getAccountSignedTransactionAmount(expense, 2).toFixed(2)).toBe('-30.00');
    expect(getAccountSignedTransactionAmount(income, 3).toFixed(2)).toBe('0.00');
  });

  it('represents both transfer sides while keeping a same-account transfer neutral', () => {
    const transfer = {
      amount: '100.00',
      type: TransactionType.TRANSFER,
      fromAccountId: 1,
      toAccountId: 2
    };

    expect(getAccountSignedTransactionAmount(transfer, 1).toFixed(2)).toBe('-100.00');
    expect(getAccountSignedTransactionAmount(transfer, 2).toFixed(2)).toBe('100.00');
    expect(
      getAccountSignedTransactionAmount(
        { ...transfer, toAccountId: 1 },
        1
      ).toFixed(2)
    ).toBe('0.00');
  });

  it.each(Object.values(CreditCardCreditKind))(
    'reduces the invoice only for the explicit card credit kind %s',
    (creditCardCreditKind) => {
      expect(
        getCreditCardInvoiceSignedAmount({
          amount: '42.37',
          creditCardCreditKind
        }).toFixed(2)
      ).toBe('-42.37');
    }
  );

  it('keeps a regular card charge positive', () => {
    expect(
      getCreditCardInvoiceSignedAmount({
        amount: '42.37',
        creditCardCreditKind: null
      }).toFixed(2)
    ).toBe('42.37');
  });
});
