import {
  CreditCardInvoiceStatus,
  TransactionStatus
} from '@prisma/client';
import { buildFinancialRecognitionWhere } from '../../src/utils/financial-transaction-query';

describe('Financial transaction recognition queries', () => {
  it('keeps every active materialized transaction in the materialized perspective', () => {
    expect(buildFinancialRecognitionWhere('MATERIALIZED')).toEqual({
      status: {
        not: TransactionStatus.CANCELED
      }
    });
  });

  it('uses completed transactions for the economic perspective', () => {
    expect(buildFinancialRecognitionWhere('ECONOMIC')).toEqual({
      status: TransactionStatus.COMPLETED
    });
  });

  it('settles non-card transactions directly and card transactions only with a paid invoice', () => {
    expect(buildFinancialRecognitionWhere('SETTLEMENT')).toEqual({
      status: TransactionStatus.COMPLETED,
      OR: [
        { creditCardInvoiceId: null },
        {
          creditCardInvoice: {
            is: {
              status: CreditCardInvoiceStatus.PAID
            }
          }
        }
      ]
    });
  });
});
