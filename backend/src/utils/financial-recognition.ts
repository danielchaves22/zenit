import {
  CreditCardInvoiceStatus,
  TransactionStatus
} from '@prisma/client';

export type FinancialEconomicState =
  | 'PROJECTED'
  | 'PENDING'
  | 'REALIZED'
  | 'CANCELED';

export type FinancialSettlementState =
  | 'PROJECTED'
  | 'UNSETTLED'
  | 'SETTLED'
  | 'CANCELED';

export type FinancialRecognition = {
  economicState: FinancialEconomicState;
  settlementState: FinancialSettlementState;
};

export function recognizeProjectedAmount(): FinancialRecognition {
  return {
    economicState: 'PROJECTED',
    settlementState: 'PROJECTED'
  };
}

export function recognizeNonCardTransaction(
  status: TransactionStatus
): FinancialRecognition {
  if (status === TransactionStatus.CANCELED) {
    return {
      economicState: 'CANCELED',
      settlementState: 'CANCELED'
    };
  }

  if (status === TransactionStatus.COMPLETED) {
    return {
      economicState: 'REALIZED',
      settlementState: 'SETTLED'
    };
  }

  return {
    economicState: 'PENDING',
    settlementState: 'UNSETTLED'
  };
}

export function recognizeCreditCardTransaction(
  status: TransactionStatus,
  invoiceStatus?: CreditCardInvoiceStatus | null
): FinancialRecognition {
  const transactionRecognition = recognizeNonCardTransaction(status);

  if (transactionRecognition.economicState !== 'REALIZED') {
    return transactionRecognition;
  }

  return {
    economicState: 'REALIZED',
    settlementState:
      invoiceStatus === CreditCardInvoiceStatus.PAID ? 'SETTLED' : 'UNSETTLED'
  };
}
