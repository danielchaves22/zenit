import { Prisma } from '@prisma/client';
import type { FinancialRecognitionPerspective } from './financial-transaction-query';

export function buildHistoricalNonCardDateWhere(params: {
  perspective: FinancialRecognitionPerspective;
  startDate: Date;
  endDate: Date;
}): Prisma.FinancialTransactionWhereInput {
  const range = {
    gte: params.startDate,
    lte: params.endDate
  };

  if (params.perspective === 'MATERIALIZED') {
    return { OR: [{ dueDate: range }, { dueDate: null, date: range }] };
  }

  if (params.perspective === 'ECONOMIC') {
    return {
      date: range
    };
  }

  return {
    OR: [
      { effectiveDate: range },
      {
        effectiveDate: null,
        date: range
      }
    ]
  };
}

export function buildHistoricalCardDateWhere(params: {
  perspective: FinancialRecognitionPerspective;
  startDate: Date;
  endDate: Date;
}): Prisma.FinancialTransactionWhereInput {
  const range = {
    gte: params.startDate,
    lte: params.endDate
  };

  if (params.perspective === 'ECONOMIC') {
    return {
      date: range
    };
  }

  if (params.perspective === 'SETTLEMENT') {
    return {
      creditCardInvoice: {
        is: {
          OR: [
            { settledAt: range },
            {
              settledAt: null,
              dueDate: range
            }
          ]
        }
      }
    };
  }

  return {
    creditCardInvoice: {
      is: {
        dueDate: range
      }
    }
  };
}
