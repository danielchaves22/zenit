import { CreditCardCreditKind, Prisma, TransactionType } from '@prisma/client';

type StoredTransactionAmount = Readonly<{
  amount: Prisma.Decimal | string | number;
  type: TransactionType;
}>;

type AccountTransactionAmount = StoredTransactionAmount & Readonly<{
  fromAccountId: number | null;
  toAccountId: number | null;
}>;

type CreditCardInvoiceAmount = Readonly<{
  amount: Prisma.Decimal | string | number;
  creditCardCreditKind?: CreditCardCreditKind | null;
}>;

function decimalAmount(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * Returns the net economic effect for the workspace: income is positive,
 * expense is negative and an internal transfer is neutral.
 */
export function getWorkspaceSignedTransactionAmount(
  transaction: StoredTransactionAmount
): Prisma.Decimal {
  const amount = decimalAmount(transaction.amount);

  if (transaction.type === TransactionType.INCOME) return amount;
  if (transaction.type === TransactionType.EXPENSE) return amount.negated();
  return new Prisma.Decimal(0);
}

/**
 * Returns the effect on one account. Transfers therefore have opposite signs
 * on their source and destination while remaining neutral for the workspace.
 */
export function getAccountSignedTransactionAmount(
  transaction: AccountTransactionAmount,
  accountId: number
): Prisma.Decimal {
  if (
    transaction.fromAccountId === accountId &&
    transaction.toAccountId === accountId
  ) {
    return new Prisma.Decimal(0);
  }

  const amount = decimalAmount(transaction.amount);
  if (
    transaction.fromAccountId === accountId &&
    (transaction.type === TransactionType.EXPENSE ||
      transaction.type === TransactionType.TRANSFER)
  ) {
    return amount.negated();
  }
  if (
    transaction.toAccountId === accountId &&
    (transaction.type === TransactionType.INCOME ||
      transaction.type === TransactionType.TRANSFER)
  ) {
    return amount;
  }

  return new Prisma.Decimal(0);
}

export function isCreditCardInvoiceCredit(transaction: {
  creditCardCreditKind?: CreditCardCreditKind | null;
}): boolean {
  return transaction.creditCardCreditKind !== null &&
    transaction.creditCardCreditKind !== undefined;
}

/**
 * Returns the effect on the card invoice obligation: charges increase the
 * invoice and explicit refund, cashback or adjustment credits reduce it.
 */
export function getCreditCardInvoiceSignedAmount(
  transaction: CreditCardInvoiceAmount
): Prisma.Decimal {
  const amount = decimalAmount(transaction.amount);
  return isCreditCardInvoiceCredit(transaction) ? amount.negated() : amount;
}
