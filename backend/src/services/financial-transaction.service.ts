import { PrismaClient, FinancialTransaction, TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { parseDecimal } from '../utils/money';
import cacheService from './cache.service';
import FixedTransactionService, { buildOccurrenceKeyValue } from './fixed-transaction.service';
import {
  CreditCardInvoiceStatus,
  CreditCardInvoiceSettlementType
} from '@prisma/client';
import {
  addMonthsClamped,
  CreditCardInvoiceReference,
  resolveCreditCardInvoiceReference,
  resolveCreditCardInvoiceStatus
} from '../utils/credit-card';

import { randomUUID } from 'crypto';
import {
  AccountType
} from '@prisma/client';

const prisma = new PrismaClient();
type PurchaseScope = 'SINGLE' | 'PURCHASE';
type TransactionListDateField = 'dueDate' | 'date' | 'effectiveDate' | 'createdAt';
type CreditCardInvoiceReferenceInput = CreditCardInvoiceReference & {
  accountId: number;
  allowExternalSettlement?: boolean;
};
type CreditCardInvoiceSummaryDateField = Extract<TransactionListDateField, 'dueDate' | 'date'>;

type CreditCardInvoiceSummaryRow = {
  id: number | null;
  description: string;
  amount: string;
  date: Date;
  dueDate: Date;
  effectiveDate: Date | null;
  type: TransactionType;
  status: TransactionStatus;
  notes: null;
  fromAccount: {
    id: number;
    name: string;
    type: string;
  };
  toAccount: null;
  category: null;
  tags: [];
  createdByUser: {
    id: number;
    name: string;
  };
  createdAt: Date;
  installmentNumber: null;
  totalInstallments: null;
  purchaseGroupId: null;
  creditCardInvoice: {
    id?: number;
    referenceYear: number;
    referenceMonth: number;
    dueDate: Date;
    status: string;
  };
  isVirtual: false;
  virtualKey?: undefined;
  fixedTemplateId: null;
  isFixed: false;
  isProjected: boolean;
  hasProjectedTransactions: boolean;
  isCreditCardInvoiceSummary: true;
  invoiceNavigation: {
    accountId: number;
    invoiceKey: string;
  };
  itemsSubtotal: string;
  fixedSubtotal: string;
};

type CreditCardProjectedInvoiceSummaryGroup = {
  account: {
    id: number;
    name: string;
    type: string;
  };
  referenceYear: number;
  referenceMonth: number;
  closingDate: Date;
  dueDate: Date;
  invoiceStatus: CreditCardInvoiceStatus;
  fixedSubtotal: Prisma.Decimal;
  hasProjectedTransactions: boolean;
};

type TransactionListSummary = {
  incomeTotal: string;
  expenseTotal: string;
};

// ============================================
// CRITICAL: FINANCIAL DATA INTEGRITY CLASS
// ============================================

export default class FinancialTransactionService {
  /**
   * Cria transaÃ§Ãµes financeiras considerando repetiÃ§Ãµes
   */
  static async createTransaction(data: {
    description: string;
    amount: number | string;
    date: Date;
    dueDate?: Date | null;
    effectiveDate?: Date | null;
    type: TransactionType;
    status?: TransactionStatus;
    notes?: string;
    fromAccountId?: number | null;
    toAccountId?: number | null;
    categoryId?: number | null;
    companyId: number;
    createdBy: number;
    tags?: string[];
    repeatTimes?: number;
    installmentCount?: number;
    recurringTransactionId?: number | null;
    occurrenceKey?: string | null;
    allowMissingAccount?: boolean;
  }): Promise<FinancialTransaction | FinancialTransaction[]> {
    const installmentCount = data.installmentCount && data.installmentCount > 0
      ? data.installmentCount
      : 1;

    if ((data.repeatTimes && data.repeatTimes > 0) && installmentCount > 1) {
      throw new Error('Não é possível usar repetição e parcelamento ao mesmo tempo');
    }

    const fromAccount = data.fromAccountId
      ? await prisma.financialAccount.findUnique({
          where: { id: data.fromAccountId }
        })
      : null;

    const isCreditCardPurchase =
      data.type === TransactionType.EXPENSE &&
      fromAccount?.type === AccountType.CREDIT_CARD;

    if (installmentCount > 1 && !isCreditCardPurchase) {
      throw new Error('Parcelamento está disponível apenas para despesas em cartão de crédito');
    }

    if (isCreditCardPurchase) {
      if (!fromAccount) {
        throw new Error('Conta de origem nao encontrada');
      }

      if (fromAccount.companyId !== data.companyId) {
        throw new Error('Conta de origem nao pertence a empresa informada');
      }

      if (!fromAccount.statementClosingDay || !fromAccount.statementDueDay) {
        throw new Error('Cartão de crédito sem fechamento e vencimento configurados');
      }

      return this.createCreditCardExpenseInstallments(data, fromAccount, installmentCount);
    }

    const repeatTimes = data.repeatTimes && data.repeatTimes > 0 ? data.repeatTimes : 1;
    const baseData = { ...data } as any;
    const baseDescription = data.description;
    const baseDate = baseData.date;
    const baseDueDate = baseData.dueDate || null;
    const baseEffectiveDate = baseData.effectiveDate || null;
    delete baseData.repeatTimes;
    delete baseData.installmentCount;

    const transactions: FinancialTransaction[] = [];

    for (let i = 0; i < repeatTimes; i++) {
      const currentStatus = i === 0 ? data.status : TransactionStatus.PENDING;

      baseData.description = baseDescription;
      baseData.status = currentStatus;
      baseData.date = this.addMonths(baseDate, i);
      baseData.dueDate = baseDueDate ? this.addMonths(baseDueDate, i) : null;
      baseData.effectiveDate =
        i === 0 && currentStatus !== TransactionStatus.PENDING
          ? baseEffectiveDate
          : null;
      baseData.installmentNumber = i + 1;
      baseData.totalInstallments = repeatTimes;

      const tx = await this.createSingleTransaction({ ...baseData });
      transactions.push(tx);
    }

    return repeatTimes === 1 ? transactions[0] : transactions;
  }

  private static addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  private static async createCreditCardExpenseInstallments(
    data: {
      description: string;
      amount: number | string;
      date: Date;
      dueDate?: Date | null;
      effectiveDate?: Date | null;
      type: TransactionType;
      status?: TransactionStatus;
      notes?: string;
      fromAccountId?: number | null;
      toAccountId?: number | null;
      categoryId?: number | null;
      companyId: number;
      createdBy: number;
      tags?: string[];
      recurringTransactionId?: number | null;
      occurrenceKey?: string | null;
      allowMissingAccount?: boolean;
    },
    cardAccount: {
      id: number;
      statementClosingDay: number | null;
      statementDueDay: number | null;
    },
    installmentCount: number
  ): Promise<FinancialTransaction | FinancialTransaction[]> {
    const purchaseGroupId = randomUUID();
    const purchaseDate = new Date(data.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const transactions: FinancialTransaction[] = [];

    for (let i = 0; i < installmentCount; i++) {
      const scheduledDate = addMonthsClamped(purchaseDate, i);
      const invoiceReference = resolveCreditCardInvoiceReference(
        scheduledDate,
        cardAccount.statementClosingDay as number,
        cardAccount.statementDueDay as number
      );

      const transaction = await this.createSingleTransaction({
        ...data,
        date: purchaseDate,
        dueDate: invoiceReference.dueDate,
        effectiveDate: purchaseDate,
        status: TransactionStatus.COMPLETED,
        installmentNumber: i + 1,
        totalInstallments: installmentCount,
        purchaseGroupId,
        scheduledDate,
        recurringTransactionId: data.recurringTransactionId ?? null,
        occurrenceKey: data.occurrenceKey ?? null,
        allowMissingAccount: data.allowMissingAccount ?? false,
        creditCardInvoiceReference: {
          ...invoiceReference,
          accountId: cardAccount.id,
          allowExternalSettlement: invoiceReference.dueDate.getTime() < today.getTime()
        }
      });

      transactions.push(transaction);
    }

    return installmentCount === 1 ? transactions[0] : transactions;
  }

  /**
   * CRITICAL: Creates financial transaction with ACID guarantees
   * Netflix-level reliability for financial operations
   */
  private static async createSingleTransaction(data: {
    description: string;
    amount: number | string;
    date: Date;
    dueDate?: Date | null;
    effectiveDate?: Date | null;
    type: TransactionType;
    status?: TransactionStatus;
    notes?: string;
    fromAccountId?: number | null;
    toAccountId?: number | null;
    categoryId?: number | null;
    companyId: number;
    createdBy: number;
    tags?: string[];
    installmentNumber?: number | null;
    totalInstallments?: number | null;
    purchaseGroupId?: string | null;
    scheduledDate?: Date | null;
    recurringTransactionId?: number | null;
    occurrenceKey?: string | null;
    allowMissingAccount?: boolean;
    creditCardInvoiceReference?: CreditCardInvoiceReferenceInput | null;
  }): Promise<FinancialTransaction> {

    const startTime = Date.now();
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    logger.info('Financial transaction creation started', {
      transactionId,
      type: data.type,
      amount: data.amount,
      fromAccountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      companyId: data.companyId
    });

    // âœ… CRITICAL: Input validation BEFORE any DB operation
    this.validateTransactionData(
      data.type,
      data.fromAccountId,
      data.toAccountId,
      data.allowMissingAccount ?? false
    );
    const parsedAmount = parseDecimal(data.amount);

    if (parsedAmount.lte(0)) {
      throw new Error('Transaction amount must be positive');
    }

    // âœ… CRITICAL: Maximum 3 retry attempts for deadlocks
    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        return await this.executeTransactionWithFullLocking(data, parsedAmount, transactionId, startTime);
      } catch (error: any) {
        // âœ… CRITICAL: Retry only on deadlock/serialization failures
        if ((error.code === 'P2034' || error.message.includes('deadlock') || error.message.includes('serialization')) && retryCount < maxRetries - 1) {
          retryCount++;
          const backoffMs = Math.min(100 * Math.pow(2, retryCount), 1000); // Exponential backoff

          logger.warn('Transaction deadlock detected, retrying', {
            transactionId,
            retryCount,
            backoffMs,
            error: error.message
          });

          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        // âœ… CRITICAL: Log all financial transaction failures
        logger.error('CRITICAL: Financial transaction failed', {
          transactionId,
          error: error.message,
          stack: error.stack,
          retryCount,
          data: { ...data, amount: parsedAmount.toString() }
        });

        throw error;
      }
    }

    throw new Error('Transaction failed after maximum retries');
  }

  /**
   * CRITICAL: Execute transaction with SERIALIZABLE isolation and full locking
   * @private
   */
  private static async executeTransactionWithFullLocking(
    data: any,
    parsedAmount: any,
    transactionId: string,
    startTime: number
  ): Promise<FinancialTransaction> {
    
    return await prisma.$transaction(async (tx) => {
      
      // âœ… CRITICAL: Acquire locks in DETERMINISTIC ORDER to prevent deadlocks
      const accountsToLock = [];
      if (data.fromAccountId) accountsToLock.push(data.fromAccountId);
      if (data.toAccountId && data.toAccountId !== data.fromAccountId) {
        accountsToLock.push(data.toAccountId);
      }
      
      // Sort to ensure consistent locking order
      accountsToLock.sort((a, b) => a - b);
      
      const lockedAccounts: any[] = [];
      
      // âœ… CRITICAL: Acquire ALL locks BEFORE any business logic
      for (const accountId of accountsToLock) {
        try {
          const result = await tx.$queryRaw`
            SELECT id, name, balance, type, "isActive", "companyId", "allowNegativeBalance"
            FROM "FinancialAccount"
            WHERE id = ${accountId}
            FOR UPDATE NOWAIT
          `;
          
          if (!result || (result as any[]).length === 0) {
            throw new Error(`Account ID ${accountId} not found`);
          }
          
          const account = (result as any[])[0];
          
          // âœ… CRITICAL: Verify account belongs to company
          if (account.companyId !== data.companyId) {
            throw new Error(`Account ${accountId} does not belong to company ${data.companyId}`);
          }
          
          // âœ… CRITICAL: Verify account is active
          if (!account.isActive) {
            throw new Error(`Account ${accountId} is inactive`);
          }
          
          lockedAccounts.push(account);
          
        } catch (error: any) {
          if (error.message.includes('could not obtain lock')) {
            throw new Error('Another transaction is using one of these accounts. Please try again.');
          }
          throw error;
        }
      }
      
      // âœ… CRITICAL: Business logic validation AFTER locks acquired
      if (data.status === 'COMPLETED') {
        await this.validateBusinessRules(data, parsedAmount, lockedAccounts);
      }

      let creditCardInvoiceId: number | null = null;
      let isExternalCreditCardSettlement = false;
      if (data.creditCardInvoiceReference) {
        const ensuredInvoice = await this.ensureCreditCardInvoiceTx(
          tx,
          data.creditCardInvoiceReference
        );
        creditCardInvoiceId = ensuredInvoice.invoiceId;
        isExternalCreditCardSettlement = ensuredInvoice.isExternalSettlement;
      }
      
      // âœ… CRITICAL: Create transaction record FIRST (for audit trail)
      const transaction = await tx.financialTransaction.create({
        data: {
          description: data.description,
          amount: parsedAmount,
          date: data.date,
          dueDate: data.dueDate || null,
          effectiveDate: data.effectiveDate || null,
          type: data.type,
          status: data.status || 'PENDING',
          notes: data.notes,
          installmentNumber: data.installmentNumber ?? null,
          totalInstallments: data.totalInstallments ?? null,
          purchaseGroupId: data.purchaseGroupId ?? null,
          scheduledDate: data.scheduledDate ?? null,
          fromAccount: data.fromAccountId ? { connect: { id: data.fromAccountId } } : undefined,
          toAccount: data.toAccountId ? { connect: { id: data.toAccountId } } : undefined,
          category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
          recurringTransaction: data.recurringTransactionId
            ? { connect: { id: data.recurringTransactionId } }
            : undefined,
          occurrenceKey: data.occurrenceKey ?? null,
          creditCardInvoice: creditCardInvoiceId
            ? { connect: { id: creditCardInvoiceId } }
            : undefined,
          isExternalCreditCardSettlement,
          company: { connect: { id: data.companyId } },
          createdByUser: { connect: { id: data.createdBy } },
          tags: data.tags && data.tags.length > 0 ? {
            connectOrCreate: data.tags.map((tagName: string) => ({
              where: { name_companyId: { name: tagName, companyId: data.companyId } },
              create: { name: tagName, company: { connect: { id: data.companyId } } }
            }))
          } : undefined
        }
      });
      
      // âœ… CRITICAL: Update account balances ATOMICALLY
      if (data.status === 'COMPLETED' && !isExternalCreditCardSettlement) {
        await this.updateAccountBalancesAtomic(tx, {
          transactionId: transaction.id,
          type: data.type,
          amount: parsedAmount,
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId
        });
        
        // âœ… CRITICAL: Verify balance integrity AFTER update
        await this.verifyBalanceIntegrity(tx, accountsToLock);
      }

      if (creditCardInvoiceId) {
        await this.syncCreditCardInvoiceTx(tx, creditCardInvoiceId);
      }
      
      // âœ… CRITICAL: Success audit log
      logger.info('Financial transaction completed successfully', {
        transactionId,
        dbTransactionId: transaction.id,
        type: data.type,
        amount: parsedAmount.toString(),
        duration: Date.now() - startTime,
        accountsAffected: accountsToLock.length
      });

      // âœ… CRITICAL: Invalidate relevant caches
      const affectedAccountIds = accountsToLock;
      await this.invalidateFinancialCaches(data.companyId, affectedAccountIds);
      
      return transaction;
      
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000, // 30 seconds timeout
      maxWait: 10000   // 10 seconds max wait for transaction slot
    });
  }

  /**
   * CRITICAL: Validate business rules with locked accounts
   * @private
   */
  private static async validateBusinessRules(
    data: any,
    amount: any,
    lockedAccounts: any[]
  ): Promise<void> {
    
    if (data.type === 'EXPENSE' && data.fromAccountId) {
      const fromAccount = lockedAccounts.find(acc => acc.id === data.fromAccountId);
      if (!fromAccount) {
        throw new Error('Source account not found in locked accounts');
      }
      
      const currentBalance = parseDecimal(fromAccount.balance);
      const transactionAmount = parseDecimal(amount);
      
      // âœ… VERIFICAR SE PERMITE SALDO NEGATIVO
      if (!fromAccount.allowNegativeBalance) {
        // âœ… VALIDAÃ‡ÃƒO TRADICIONAL - nÃ£o permite negativo
        if (currentBalance.lt(transactionAmount)) {
          throw new Error(
            `Insufficient balance. Available: ${currentBalance.toFixed(2)}, Required: ${transactionAmount.toFixed(2)}`
          );
        }
      } else {
        // âœ… PERMITE NEGATIVO - mas ainda logamos para auditoria
        const newBalance = currentBalance.minus(transactionAmount);
        if (newBalance.lt(0)) {
          logger.warn('Transaction creating negative balance', {
            accountId: fromAccount.id,
            accountName: fromAccount.name,
            currentBalance: currentBalance.toFixed(2),
            transactionAmount: transactionAmount.toFixed(2),
            newBalance: newBalance.toFixed(2),
            allowNegativeBalance: fromAccount.allowNegativeBalance
          });
        }
      }
    }
    
    if (data.type === 'TRANSFER') {
      const fromAccount = lockedAccounts.find(acc => acc.id === data.fromAccountId);
      if (!fromAccount) {
        throw new Error('Source account not found for transfer');
      }
      
      const currentBalance = parseDecimal(fromAccount.balance);
      const transferAmount = parseDecimal(amount);
      
      // âœ… VERIFICAR SE PERMITE SALDO NEGATIVO PARA TRANSFERÃŠNCIAS
      if (!fromAccount.allowNegativeBalance) {
        if (currentBalance.lt(transferAmount)) {
          throw new Error(
            `Insufficient balance for transfer. Available: ${currentBalance.toFixed(2)}, Required: ${transferAmount.toFixed(2)}`
          );
        }
      } else {
        // âœ… PERMITE NEGATIVO - mas ainda logamos para auditoria
        const newBalance = currentBalance.minus(transferAmount);
        if (newBalance.lt(0)) {
          logger.warn('Transfer creating negative balance', {
            accountId: fromAccount.id,
            accountName: fromAccount.name,
            currentBalance: currentBalance.toFixed(2),
            transferAmount: transferAmount.toFixed(2),
            newBalance: newBalance.toFixed(2),
            allowNegativeBalance: fromAccount.allowNegativeBalance
          });
        }
      }
    }
  }

  /**
   * CRITICAL: Update account balances atomically
   * @private
   */
  private static async updateAccountBalancesAtomic(
    tx: Prisma.TransactionClient,
    data: {
      transactionId: number;
      type: TransactionType;
      amount: any;
      fromAccountId: number | null;
      toAccountId: number | null;
    }
  ): Promise<void> {
    
    const { type, amount, fromAccountId, toAccountId } = data;
    const amountDecimal = parseDecimal(amount);

    if (type === 'INCOME' && toAccountId) {
      await tx.$executeRaw`
        UPDATE "FinancialAccount" 
        SET balance = balance + ${amountDecimal}, "updatedAt" = NOW()
        WHERE id = ${toAccountId}
      `;
    } 
    else if (type === 'EXPENSE' && fromAccountId) {
      await tx.$executeRaw`
        UPDATE "FinancialAccount" 
        SET balance = balance - ${amountDecimal}, "updatedAt" = NOW()
        WHERE id = ${fromAccountId}
      `;
    } 
    else if (type === 'TRANSFER' && fromAccountId && toAccountId) {
      // âœ… CRITICAL: BOTH updates in same atomic operation
      await tx.$executeRaw`
        UPDATE "FinancialAccount" 
        SET balance = balance - ${amountDecimal}, "updatedAt" = NOW()
        WHERE id = ${fromAccountId}
      `;
      
      await tx.$executeRaw`
        UPDATE "FinancialAccount" 
        SET balance = balance + ${amountDecimal}, "updatedAt" = NOW()
        WHERE id = ${toAccountId}
      `;
    }
  }

  /**
   * CRITICAL: Verify balance integrity after operations
   * @private
   */
  private static async verifyBalanceIntegrity(
    tx: Prisma.TransactionClient,
    accountIds: number[]
  ): Promise<void> {
    
    for (const accountId of accountIds) {
      const result = await tx.$queryRaw`
        SELECT balance, "allowNegativeBalance", type, name 
        FROM "FinancialAccount" 
        WHERE id = ${accountId}
      ` as any[];
      
      if (!result || result.length === 0) {
        throw new Error(`Balance verification failed: Account ${accountId} not found`);
      }
      
      const account = result[0];
      const balance = parseDecimal(account.balance);
      
      // âœ… SÃ“ VERIFICAR NEGATIVOS SE A CONTA NÃƒO PERMITE
      if (!account.allowNegativeBalance && balance.lt(0)) {
        throw new Error(
          `CRITICAL: Account ${accountId} (${account.name}) has negative balance: ${balance.toFixed(2)} but allowNegativeBalance is false`
        );
      }
      
      // âœ… LOG PARA AUDITORIA DE SALDOS NEGATIVOS PERMITIDOS
      if (account.allowNegativeBalance && balance.lt(0)) {
        logger.info('Account with authorized negative balance', {
          accountId,
          accountName: account.name,
          accountType: account.type,
          balance: balance.toFixed(2),
          allowNegativeBalance: account.allowNegativeBalance
        });
      }
    }
  }

  private static isCreditCardInvoicePaid(invoice?: {
    status: CreditCardInvoiceStatus;
    settlementType?: CreditCardInvoiceSettlementType | null;
    paymentTransaction?: {
      status: TransactionStatus;
      effectiveDate?: Date | null;
      date?: Date | null;
    } | null;
  } | null): boolean {
    if (!invoice) {
      return false;
    }

    return (
      invoice.status === CreditCardInvoiceStatus.PAID ||
      invoice.paymentTransaction?.status === TransactionStatus.COMPLETED ||
      invoice.settlementType === CreditCardInvoiceSettlementType.EXTERNAL
    );
  }

  private static resolveCreditCardTransferSettledAt(invoice: {
    dueDate: Date;
    settledAt?: Date | null;
    paymentTransaction?: {
      effectiveDate?: Date | null;
      date?: Date | null;
    } | null;
  }): Date {
    return (
      invoice.paymentTransaction?.effectiveDate ||
      invoice.paymentTransaction?.date ||
      invoice.settledAt ||
      invoice.dueDate
    );
  }

  private static async ensureCreditCardInvoiceTx(
    tx: Prisma.TransactionClient,
    reference: CreditCardInvoiceReferenceInput
  ): Promise<{ invoiceId: number; isExternalSettlement: boolean }> {
    const existingInvoice = await tx.creditCardInvoice.findUnique({
      where: {
        unique_credit_card_invoice_reference: {
          accountId: reference.accountId,
          referenceYear: reference.referenceYear,
          referenceMonth: reference.referenceMonth
        }
      },
      include: {
        paymentTransaction: {
          select: {
            id: true,
            status: true,
            effectiveDate: true,
            date: true
          }
        }
      }
    });

    const invoiceStatus = resolveCreditCardInvoiceStatus(reference.closingDate, false);
    const invoiceIsPaid = this.isCreditCardInvoicePaid(existingInvoice);
    const isExternalSettlement =
      invoiceIsPaid || (!existingInvoice && Boolean(reference.allowExternalSettlement));

    if (existingInvoice) {
      const hasCompletedPayment =
        existingInvoice.paymentTransaction?.status === TransactionStatus.COMPLETED;
      const settlementType = hasCompletedPayment
        ? CreditCardInvoiceSettlementType.TRANSFER
        : existingInvoice.settlementType === CreditCardInvoiceSettlementType.EXTERNAL ||
            existingInvoice.status === CreditCardInvoiceStatus.PAID
          ? CreditCardInvoiceSettlementType.EXTERNAL
          : null;
      const settledAt = hasCompletedPayment
        ? this.resolveCreditCardTransferSettledAt(existingInvoice)
        : settlementType === CreditCardInvoiceSettlementType.EXTERNAL
          ? existingInvoice.settledAt || reference.dueDate
          : null;
      const updated = await tx.creditCardInvoice.update({
        where: { id: existingInvoice.id },
        data: {
          closingDate: reference.closingDate,
          dueDate: reference.dueDate,
          status: invoiceIsPaid ? CreditCardInvoiceStatus.PAID : invoiceStatus,
          settlementType,
          settledAt
        }
      });

      return {
        invoiceId: updated.id,
        isExternalSettlement
      };
    }

    const created = await tx.creditCardInvoice.create({
      data: {
        accountId: reference.accountId,
        referenceYear: reference.referenceYear,
        referenceMonth: reference.referenceMonth,
        closingDate: reference.closingDate,
        dueDate: reference.dueDate,
        status: isExternalSettlement ? CreditCardInvoiceStatus.PAID : invoiceStatus,
        settlementType: isExternalSettlement
          ? CreditCardInvoiceSettlementType.EXTERNAL
          : null,
        settledAt: isExternalSettlement ? reference.dueDate : null
      }
    });

    return {
      invoiceId: created.id,
      isExternalSettlement
    };
  }

  private static async syncCreditCardInvoiceTx(
    tx: Prisma.TransactionClient,
    invoiceId: number
  ): Promise<void> {
    const invoice = await tx.creditCardInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        paymentTransaction: {
          select: {
            id: true,
            status: true,
            effectiveDate: true,
            date: true
          }
        }
      }
    });

    if (!invoice) {
      return;
    }

    const [aggregate, externalSettlementCount] = await Promise.all([
      tx.financialTransaction.aggregate({
        where: {
          creditCardInvoiceId: invoiceId,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED
        },
        _sum: {
          amount: true
        }
      }),
      tx.financialTransaction.count({
        where: {
          creditCardInvoiceId: invoiceId,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED,
          isExternalCreditCardSettlement: true
        }
      })
    ]);

    const totalAmount = aggregate._sum.amount ?? new Prisma.Decimal(0);
    const hasCompletedPayment = invoice.paymentTransaction?.status === TransactionStatus.COMPLETED;
    const paymentTransactionId = hasCompletedPayment ? invoice.paymentTransactionId : null;
    const hasExternalSettlements = externalSettlementCount > 0;

    if (totalAmount.eq(0) && !paymentTransactionId && !hasExternalSettlements) {
      await tx.creditCardInvoice.delete({
        where: { id: invoiceId }
      });
      return;
    }

    const settlementType = hasCompletedPayment
      ? CreditCardInvoiceSettlementType.TRANSFER
      : hasExternalSettlements
        ? CreditCardInvoiceSettlementType.EXTERNAL
        : null;
    const settledAt = hasCompletedPayment
      ? this.resolveCreditCardTransferSettledAt(invoice)
      : settlementType === CreditCardInvoiceSettlementType.EXTERNAL
        ? invoice.settledAt || invoice.dueDate
        : null;

    await tx.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        totalAmount,
        paymentTransactionId,
        status: settlementType
          ? CreditCardInvoiceStatus.PAID
          : resolveCreditCardInvoiceStatus(invoice.closingDate, false),
        settlementType,
        settledAt
      }
    });
  }

  private static async syncCreditCardInvoicesTx(
    tx: Prisma.TransactionClient,
    invoiceIds: Array<number | null | undefined>
  ): Promise<void> {
    const uniqueInvoiceIds = Array.from(
      new Set(invoiceIds.filter((invoiceId): invoiceId is number => typeof invoiceId === 'number'))
    );

    for (const invoiceId of uniqueInvoiceIds) {
      await this.syncCreditCardInvoiceTx(tx, invoiceId);
    }
  }

  private static async syncCreditCardInvoicesByPaymentTransactionTx(
    tx: Prisma.TransactionClient,
    transactionId: number
  ): Promise<void> {
    const invoices = await tx.creditCardInvoice.findMany({
      where: {
        paymentTransactionId: transactionId
      },
      select: {
        id: true
      }
    });

    await this.syncCreditCardInvoicesTx(tx, invoices.map((invoice) => invoice.id));
  }

  private static async getGroupedPurchaseTransactionsTx(
    tx: Prisma.TransactionClient,
    purchaseGroupId: string,
    companyId: number
  ) {
    return tx.financialTransaction.findMany({
      where: {
        purchaseGroupId,
        companyId
      },
      include: {
        creditCardInvoice: {
          include: {
            paymentTransaction: {
              select: {
                id: true,
                status: true
              }
            }
          }
        }
      },
      orderBy: [
        { installmentNumber: 'asc' },
        { id: 'asc' }
      ]
    });
  }

  private static ensureGroupedPurchaseEditableFields(
    data: Partial<{
      description: string;
      amount: number | string;
      date: Date;
      dueDate?: Date | null;
      effectiveDate?: Date | null;
      type: TransactionType;
      status: TransactionStatus;
      notes?: string;
      fromAccountId?: number | null;
      toAccountId?: number | null;
      categoryId?: number | null;
      tags?: string[];
      installmentNumber?: number | null;
      totalInstallments?: number | null;
      purchaseScope?: PurchaseScope;
    }>
  ) {
    const forbiddenKeys: Array<keyof typeof data> = [
      'date',
      'dueDate',
      'effectiveDate',
      'type',
      'status',
      'fromAccountId',
      'toAccountId',
      'installmentNumber',
      'totalInstallments'
    ];

    const hasForbiddenChanges = forbiddenKeys.some((key) => data[key] !== undefined);
    if (hasForbiddenChanges) {
      throw new Error('Compras parceladas no cartão permitem editar apenas descrição, valor, categoria, tags e observações');
    }
  }

  private static async assertGroupedPurchaseMutationAllowedTx(
    tx: Prisma.TransactionClient,
    purchaseGroupId: string,
    companyId: number,
    scope: PurchaseScope,
    currentTransactionId: number
  ) {
    const groupedTransactions = await this.getGroupedPurchaseTransactionsTx(
      tx,
      purchaseGroupId,
      companyId
    );

    if (groupedTransactions.length === 0) {
      throw new Error('Compra parcelada nao encontrada');
    }

    const hasPaidInvoice = groupedTransactions.some(
      (transaction) =>
        transaction.creditCardInvoice?.status === CreditCardInvoiceStatus.PAID
    );

    if (scope === 'PURCHASE' && hasPaidInvoice) {
      throw new Error('Não é possível alterar a compra inteira porque existe parcela em fatura paga');
    }

    if (scope === 'SINGLE') {
      const currentTransaction = groupedTransactions.find(
        (transaction) => transaction.id === currentTransactionId
      );

      if (!currentTransaction) {
        throw new Error('Parcela nao encontrada na compra agrupada');
      }

      if (currentTransaction.creditCardInvoice?.status === CreditCardInvoiceStatus.PAID) {
        throw new Error('Não é possível alterar parcela que pertence a fatura paga');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const scheduledDate = new Date(
        currentTransaction.scheduledDate ||
          currentTransaction.dueDate ||
          currentTransaction.date
      );
      scheduledDate.setHours(0, 0, 0, 0);

      if (scheduledDate <= today) {
        throw new Error('Ajustes individuais sao permitidos apenas para parcelas futuras e nao pagas');
      }
    }

    return groupedTransactions;
  }

  private static async updateSingleTransactionRecordTx(
    tx: Prisma.TransactionClient,
    originalTxn: any,
    data: Partial<{
      description: string;
      amount: number | string;
      date: Date;
      dueDate?: Date | null;
      effectiveDate?: Date | null;
      type: TransactionType;
      status: TransactionStatus;
      notes?: string;
      fromAccountId?: number | null;
      toAccountId?: number | null;
      categoryId?: number | null;
      tags?: string[];
      installmentNumber?: number | null;
      totalInstallments?: number | null;
    }>,
    companyId: number
  ): Promise<FinancialTransaction> {
    if (originalTxn.companyId !== companyId) {
      throw new Error(`Transaction ${originalTxn.id} does not belong to company ${companyId}`);
    }

    const accountsToLock = new Set<number>();
    if (originalTxn.fromAccountId) accountsToLock.add(originalTxn.fromAccountId);
    if (originalTxn.toAccountId) accountsToLock.add(originalTxn.toAccountId);
    if (data.fromAccountId) accountsToLock.add(data.fromAccountId);
    if (data.toAccountId) accountsToLock.add(data.toAccountId);

    const sortedAccountIds = Array.from(accountsToLock).sort((a, b) => a - b);

    for (const accountId of sortedAccountIds) {
      await tx.$queryRaw`
        SELECT id FROM "FinancialAccount"
        WHERE id = ${accountId}
        FOR UPDATE NOWAIT
      `;
    }

    if (originalTxn.status === 'COMPLETED' && !originalTxn.isExternalCreditCardSettlement) {
      await this.reverseAccountBalancesAtomic(tx, {
        type: originalTxn.type,
        amount: originalTxn.amount,
        fromAccountId: originalTxn.fromAccountId,
        toAccountId: originalTxn.toAccountId
      });
    }

    const updatedData: Prisma.FinancialTransactionUpdateInput = {};

    if (data.description !== undefined) updatedData.description = data.description;
    if (data.amount !== undefined) updatedData.amount = parseDecimal(data.amount);
    if (data.date !== undefined) updatedData.date = data.date;
    if (data.dueDate !== undefined) updatedData.dueDate = data.dueDate;
    if (data.effectiveDate !== undefined) updatedData.effectiveDate = data.effectiveDate;
    if (data.type !== undefined) updatedData.type = data.type;
    if (data.status !== undefined) updatedData.status = data.status;
    if (data.notes !== undefined) updatedData.notes = data.notes;
    if (data.installmentNumber !== undefined) updatedData.installmentNumber = data.installmentNumber;
    if (data.totalInstallments !== undefined) updatedData.totalInstallments = data.totalInstallments;
    if (data.fromAccountId !== undefined) {
      updatedData.fromAccount = data.fromAccountId
        ? { connect: { id: data.fromAccountId } }
        : { disconnect: true };
    }
    if (data.toAccountId !== undefined) {
      updatedData.toAccount = data.toAccountId
        ? { connect: { id: data.toAccountId } }
        : { disconnect: true };
    }
    if (data.categoryId !== undefined) {
      updatedData.category = data.categoryId
        ? { connect: { id: data.categoryId } }
        : { disconnect: true };
    }
    if (data.tags !== undefined) {
      updatedData.tags = {
        set: [],
        ...(data.tags.length > 0
          ? {
              connectOrCreate: data.tags.map((tagName) => ({
                where: {
                  name_companyId: {
                    name: tagName,
                    companyId
                  }
                },
                create: {
                  name: tagName,
                  company: {
                    connect: { id: companyId }
                  }
                }
              }))
            }
          : {})
      };
    }

    const updated = await tx.financialTransaction.update({
      where: { id: originalTxn.id },
      data: updatedData
    });

    const newStatus = data.status ?? originalTxn.status;
    if (newStatus === TransactionStatus.COMPLETED && !updated.isExternalCreditCardSettlement) {
      await this.updateAccountBalancesAtomic(tx, {
        transactionId: updated.id,
        type: updated.type,
        amount: updated.amount,
        fromAccountId: updated.fromAccountId,
        toAccountId: updated.toAccountId
      });

      await this.verifyBalanceIntegrity(tx, sortedAccountIds);
    }

    await this.syncCreditCardInvoicesTx(tx, [
      originalTxn.creditCardInvoiceId,
      updated.creditCardInvoiceId
    ]);
    await this.syncCreditCardInvoicesByPaymentTransactionTx(tx, updated.id);

    return updated;
  }

  private static async deleteSingleTransactionRecordTx(
    tx: Prisma.TransactionClient,
    originalTxn: any,
    companyId: number
  ): Promise<void> {
    if (originalTxn.companyId !== companyId) {
      throw new Error(`Transaction ${originalTxn.id} does not belong to company ${companyId}`);
    }

    const accountsToLock = new Set<number>();
    if (originalTxn.fromAccountId) accountsToLock.add(originalTxn.fromAccountId);
    if (originalTxn.toAccountId) accountsToLock.add(originalTxn.toAccountId);

    const sortedAccountIds = Array.from(accountsToLock).sort((a, b) => a - b);
    for (const accountId of sortedAccountIds) {
      await tx.$queryRaw`
        SELECT id FROM "FinancialAccount"
        WHERE id = ${accountId}
        FOR UPDATE NOWAIT
      `;
    }

    if (originalTxn.status === 'COMPLETED' && !originalTxn.isExternalCreditCardSettlement) {
      await this.reverseAccountBalancesAtomic(tx, {
        type: originalTxn.type,
        amount: originalTxn.amount,
        fromAccountId: originalTxn.fromAccountId,
        toAccountId: originalTxn.toAccountId
      });

      await this.verifyBalanceIntegrity(tx, sortedAccountIds);
    }

    const paymentLinkedInvoiceIds = await tx.creditCardInvoice.findMany({
      where: {
        paymentTransactionId: originalTxn.id
      },
      select: {
        id: true
      }
    });

    await tx.$executeRaw`
      DELETE FROM "_FinancialTagToFinancialTransaction" WHERE "B" = ${originalTxn.id}
    `;

    await tx.financialTransaction.delete({
      where: { id: originalTxn.id }
    });

    await this.syncCreditCardInvoicesTx(tx, [originalTxn.creditCardInvoiceId]);
    await this.syncCreditCardInvoicesTx(
      tx,
      paymentLinkedInvoiceIds.map((invoice) => invoice.id)
    );
  }

  /**
   * CRITICAL: Update transaction with same safety guarantees
   */
  static async updateTransaction(
    id: number,
    data: Partial<{
      description: string;
      amount: number | string;
      date: Date;
      dueDate?: Date | null;
      effectiveDate?: Date | null;
      type: TransactionType;
      status: TransactionStatus;
      notes?: string;
      fromAccountId?: number | null;
      toAccountId?: number | null;
      categoryId?: number | null;
      tags?: string[];
      installmentNumber?: number | null;
      totalInstallments?: number | null;
      purchaseScope?: PurchaseScope;
    }>,
    companyId: number
  ): Promise<FinancialTransaction> {
    const transactionId = `update_${id}_${Date.now()}`;

    return prisma.$transaction(async (tx) => {
      const original = await tx.$queryRaw`
        SELECT * FROM "FinancialTransaction" 
        WHERE id = ${id} 
        FOR UPDATE NOWAIT
      ` as any[];

      if (!original || original.length === 0) {
        throw new Error(`Transaction ${id} not found`);
      }

      const originalTxn = original[0];
      const purchaseScope: PurchaseScope =
        data.purchaseScope ??
        (originalTxn.purchaseGroupId ? 'PURCHASE' : 'SINGLE');

      const { purchaseScope: _ignoredScope, ...updatePayload } = data;

      let updatedTransaction: FinancialTransaction;

      if (originalTxn.purchaseGroupId) {
        this.ensureGroupedPurchaseEditableFields(data);

        const groupedTransactions = await this.assertGroupedPurchaseMutationAllowedTx(
          tx,
          originalTxn.purchaseGroupId,
          companyId,
          purchaseScope,
          id
        );

        if (purchaseScope === 'PURCHASE') {
          const updates = [];
          for (const groupedTransaction of groupedTransactions) {
            updates.push(
              await this.updateSingleTransactionRecordTx(
                tx,
                groupedTransaction,
                updatePayload,
                companyId
              )
            );
          }

          updatedTransaction =
            updates.find((transaction) => transaction.id === id) || updates[0];
        } else {
          updatedTransaction = await this.updateSingleTransactionRecordTx(
            tx,
            originalTxn,
            updatePayload,
            companyId
          );
        }
      } else {
        updatedTransaction = await this.updateSingleTransactionRecordTx(
          tx,
          originalTxn,
          updatePayload,
          companyId
        );
      }

      logger.info('Financial transaction updated successfully', {
        transactionId,
        dbTransactionId: id,
        originalStatus: originalTxn.status,
        newStatus: updatedTransaction.status,
        purchaseScope
      });

      return updatedTransaction;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000
    });
  }

  /**
   * CRITICAL: Reverse account balance changes atomically
   * @private
   */
  private static async reverseAccountBalancesAtomic(
    tx: Prisma.TransactionClient,
    data: {
      type: TransactionType;
      amount: any;
      fromAccountId: number | null;
      toAccountId: number | null;
    }
  ): Promise<void> {
    
    const { type, amount, fromAccountId, toAccountId } = data;
    const amountDecimal = parseDecimal(amount);

    if (type === 'INCOME' && toAccountId) {
      await tx.$executeRaw`
        UPDATE "FinancialAccount" 
        SET balance = balance - ${amountDecimal}, "updatedAt" = NOW()
        WHERE id = ${toAccountId}
      `;
    } 
    else if (type === 'EXPENSE' && fromAccountId) {
      await tx.$executeRaw`
        UPDATE "FinancialAccount" 
        SET balance = balance + ${amountDecimal}, "updatedAt" = NOW()
        WHERE id = ${fromAccountId}
      `;
    } 
    else if (type === 'TRANSFER' && fromAccountId && toAccountId) {
      await tx.$executeRaw`
        UPDATE "FinancialAccount" 
        SET balance = balance + ${amountDecimal}, "updatedAt" = NOW()
        WHERE id = ${fromAccountId}
      `;
      
      await tx.$executeRaw`
        UPDATE "FinancialAccount" 
        SET balance = balance - ${amountDecimal}, "updatedAt" = NOW()
        WHERE id = ${toAccountId}
      `;
    }
  }

  /**
   * Validate transaction data integrity
   * @private
   */
  private static validateTransactionData(
    type: TransactionType,
    fromAccountId?: number | null,
    toAccountId?: number | null,
    allowMissingAccount = false
  ): void {
    if (type === 'INCOME' && !toAccountId && !allowMissingAccount) {
      throw new Error('Income transactions require destination account');
    }
    if (type === 'EXPENSE' && !fromAccountId && !allowMissingAccount) {
      throw new Error('Expense transactions require source account');
    }
    if (type === 'TRANSFER') {
      if (!fromAccountId) throw new Error('Transfers require source account');
      if (!toAccountId) throw new Error('Transfers require destination account');
      if (fromAccountId === toAccountId) throw new Error('Source and destination accounts must be different');
    }
  }

  // ============================================
  // EXISTING METHODS (UNCHANGED)
  // ============================================

  static async deleteTransaction(
    id: number,
    options: {
      companyId: number;
      scope?: PurchaseScope;
    }
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.$queryRaw`
        SELECT * FROM "FinancialTransaction" WHERE id = ${id} FOR UPDATE NOWAIT
      ` as any[];

      if (!transaction || transaction.length === 0) {
        throw new Error(`Transaction ${id} not found`);
      }

      const originalTxn = transaction[0];
      const scope: PurchaseScope =
        options.scope ??
        (originalTxn.purchaseGroupId ? 'PURCHASE' : 'SINGLE');

      if (originalTxn.purchaseGroupId) {
        const groupedTransactions = await this.assertGroupedPurchaseMutationAllowedTx(
          tx,
          originalTxn.purchaseGroupId,
          options.companyId,
          scope,
          id
        );

        if (scope === 'PURCHASE') {
          for (const groupedTransaction of groupedTransactions) {
            await this.deleteSingleTransactionRecordTx(
              tx,
              groupedTransaction,
              options.companyId
            );
          }
        } else {
          await this.deleteSingleTransactionRecordTx(tx, originalTxn, options.companyId);
        }
      } else {
        await this.deleteSingleTransactionRecordTx(tx, originalTxn, options.companyId);
      }

      logger.info('Financial transaction deleted successfully', {
        transactionId: id,
        scope
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000
    });
  }

  static async updateTransactionStatus(
    id: number,
    status: TransactionStatus,
    companyId: number
  ): Promise<FinancialTransaction> {
    return this.updateTransaction(id, { status }, companyId);
  }

  static async listTransactions(params: {
    companyId: number;
    startDate?: Date;
    endDate?: Date;
    dateField?: TransactionListDateField;
    includeCreditCardTransactions?: boolean;
    includeVirtualFixed?: boolean;
    types?: TransactionType[];
    status?: TransactionStatus;
    accountId?: number;
    categoryId?: number;
    search?: string;
    page?: number;
    pageSize?: number;
    accessFilter?: any;
    accessibleAccountIds?: number[];
  }): Promise<{ data: any[]; total: number; pages: number; summary: TransactionListSummary }> {
    const {
      companyId,
      startDate,
      endDate,
      dateField = 'date',
      includeCreditCardTransactions = true,
      includeVirtualFixed = true,
      types,
      status,
      accountId,
      categoryId,
      search,
      page = 1,
      pageSize = 20,
      accessFilter,
      accessibleAccountIds
    } = params;

    if (!startDate || !endDate) {
      throw new Error('startDate e endDate sao obrigatorios para listar transacoes');
    }

    if (types && types.length === 0) {
      return {
        data: [],
        total: 0,
        pages: 1,
        summary: {
          incomeTotal: '0',
          expenseTotal: '0'
        }
      };
    }

    const normalizedStartDate = this.startOfDay(startDate);
    const normalizedEndDate = this.endOfDay(endDate);
    const normalizedSearch = search?.trim();
    const includesExpenseType = !types || types.includes(TransactionType.EXPENSE);
    const projectedDateField = this.getProjectedDateField(dateField);
    const shouldSummarizeCreditCardInvoices =
      includeCreditCardTransactions &&
      includesExpenseType &&
      projectedDateField !== null;
    const shouldExcludeCreditCardItemsFromMaterialized =
      !includeCreditCardTransactions || shouldSummarizeCreditCardInvoices;
    const whereFilters: Prisma.FinancialTransactionWhereInput[] = [
      { companyId },
      this.buildListDateWhere(dateField, normalizedStartDate, normalizedEndDate)
    ];

    if (types && types.length > 0) {
      whereFilters.push({ type: { in: types } });
    }

    if (status) {
      whereFilters.push({ status });
    }

    if (categoryId) {
      whereFilters.push({ categoryId });
    }

    if (accountId) {
      whereFilters.push({
        OR: [
          { fromAccountId: accountId },
          { toAccountId: accountId }
        ]
      });
    }

    if (normalizedSearch) {
      whereFilters.push({
        OR: [
          { description: { contains: normalizedSearch, mode: 'insensitive' } },
          { notes: { contains: normalizedSearch, mode: 'insensitive' } }
        ]
      });
    }

    if (accessFilter) {
      whereFilters.push(accessFilter);
    }

    if (shouldExcludeCreditCardItemsFromMaterialized) {
      whereFilters.push({ creditCardInvoiceId: null });
    }

    const where: Prisma.FinancialTransactionWhereInput = { AND: whereFilters };

    const materialized = await prisma.financialTransaction.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, color: true } },
        fromAccount: { select: { id: true, name: true, type: true } },
        toAccount: { select: { id: true, name: true, type: true } },
        creditCardInvoice: {
          select: {
            id: true,
            referenceYear: true,
            referenceMonth: true,
            dueDate: true,
            status: true,
            settlementType: true
          }
        },
        tags: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, name: true } }
      }
    });

    const decoratedMaterialized = materialized.map((transaction: any) => ({
      ...transaction,
      isVirtual: false,
      isFixed: !!transaction.recurringTransactionId,
      fixedTemplateId: transaction.recurringTransactionId ?? null,
      virtualKey: undefined
    }));
    const visibleMaterialized = decoratedMaterialized;

    const buildResult = async (paramsForResult?: {
      virtualTransactions?: any[];
      allProjectedCreditCardVirtuals?: any[];
      matchingProjectedCreditCardVirtuals?: any[];
      includeProjected?: boolean;
    }) => {
      const virtualTransactions = paramsForResult?.virtualTransactions ?? [];
      const invoiceSummaryRows = shouldSummarizeCreditCardInvoices
        ? await this.buildCreditCardInvoiceSummaryRows({
            companyId,
            startDate: normalizedStartDate,
            endDate: normalizedEndDate,
            dateField: projectedDateField as CreditCardInvoiceSummaryDateField,
            includeProjected: paramsForResult?.includeProjected ?? false,
            status,
            accountId,
            categoryId,
            search: normalizedSearch,
            accessibleAccountIds,
            projectedTransactions: paramsForResult?.allProjectedCreditCardVirtuals ?? [],
            matchingProjectedTransactions: paramsForResult?.matchingProjectedCreditCardVirtuals ?? []
          })
        : [];

      const merged = [...visibleMaterialized, ...virtualTransactions, ...invoiceSummaryRows];
      const sorted = this.sortTransactionsForList(merged);
      const total = sorted.length;
      const pages = Math.ceil(total / pageSize) || 1;
      const data = sorted.slice((page - 1) * pageSize, page * pageSize);

      return {
        data,
        total,
        pages,
        summary: this.buildTransactionListSummary(merged)
      };
    };

    if (!includeVirtualFixed) {
      return buildResult();
    }

    const includesProjectableType =
      !types || types.some((transactionType) => transactionType !== TransactionType.TRANSFER);

    // Transações virtuais de fixas sempre são PENDING e nunca TRANSFER.
    if (!projectedDateField || (status && status !== TransactionStatus.PENDING) || !includesProjectableType) {
      return buildResult();
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const projectionStart = normalizedStartDate > todayStart ? normalizedStartDate : todayStart;

    const existingOccurrenceKeys = new Set<string>();
    const existingOccurrenceWhereFilters: Prisma.FinancialTransactionWhereInput[] = [
      { companyId },
      this.buildListDateWhere(projectedDateField, projectionStart, normalizedEndDate),
      { recurringTransactionId: { not: null } }
    ];

    if (accessFilter) {
      existingOccurrenceWhereFilters.push(accessFilter);
    }

    const existingOccurrences = projectionStart <= normalizedEndDate
      ? await prisma.financialTransaction.findMany({
          where: { AND: existingOccurrenceWhereFilters },
          select: {
            recurringTransactionId: true,
            occurrenceKey: true,
            dueDate: true,
            date: true
          }
        })
      : [];

    for (const transaction of existingOccurrences) {
      if (!transaction.recurringTransactionId) {
        continue;
      }

      const baseDate = transaction.dueDate || transaction.date;
      if (!baseDate) {
        continue;
      }

      const key = transaction.occurrenceKey || buildOccurrenceKeyValue(transaction.recurringTransactionId, new Date(baseDate));
      existingOccurrenceKeys.add(key);
    }

    const virtualTransactions: any[] = [];
    const allProjectedCreditCardVirtuals: any[] = [];
    const matchingProjectedCreditCardVirtuals: any[] = [];

    if (projectionStart <= normalizedEndDate) {
      const templates = await FixedTransactionService.getTemplatesForProjection({
        companyId,
        rangeStart: projectionStart,
        rangeEnd: normalizedEndDate,
        accessibleAccountIds
      });

      const startCursor = new Date(projectionStart.getFullYear(), projectionStart.getMonth(), 1);
      const endCursor = new Date(normalizedEndDate.getFullYear(), normalizedEndDate.getMonth(), 1);

      for (const template of templates as any[]) {
        if (types && !types.includes(template.type)) {
          continue;
        }

        if (this.isUnsupportedFixedCreditCardTemplate(template)) {
          continue;
        }

        if (categoryId && template.categoryId !== categoryId) {
          continue;
        }

        if (accountId) {
          const matchesAccount = template.fromAccountId === accountId || template.toAccountId === accountId;
          if (!matchesAccount) {
            continue;
          }
        }

        if (normalizedSearch) {
          const normalizedTemplateText = `${template.description ?? ''} ${template.notes ?? ''}`.toLowerCase();
          if (!normalizedTemplateText.includes(normalizedSearch.toLowerCase())) {
            continue;
          }
        }

        let cursor = new Date(startCursor);

        while (cursor <= endCursor) {
          const occurrenceDate = FixedTransactionService.buildVirtualDateForMonth(
            template,
            cursor.getFullYear(),
            cursor.getMonth()
          );

          if (template.startDate <= occurrenceDate && (!template.endDate || template.endDate >= occurrenceDate)) {
            const occurrenceKey = buildOccurrenceKeyValue(template.id, occurrenceDate);

            if (!existingOccurrenceKeys.has(occurrenceKey)) {
              const virtualTransaction = this.buildProjectedVirtualTransaction(template, occurrenceDate);
              const projectedComparisonDate =
                projectedDateField === 'dueDate' ? virtualTransaction.dueDate : virtualTransaction.date;

              if (projectedComparisonDate >= projectionStart && projectedComparisonDate <= normalizedEndDate) {
                const isCreditCardVirtual = this.isCreditCardRelatedTransactionForList(virtualTransaction);
                const matchesProjectedFilters = this.matchesProjectedTransactionFilters(virtualTransaction, {
                  types,
                  status,
                  accountId,
                  categoryId,
                  search: normalizedSearch
                });

                if (isCreditCardVirtual) {
                  if (shouldSummarizeCreditCardInvoices) {
                    allProjectedCreditCardVirtuals.push(virtualTransaction);

                    if (matchesProjectedFilters) {
                      matchingProjectedCreditCardVirtuals.push(virtualTransaction);
                    }
                  } else if (includeCreditCardTransactions && matchesProjectedFilters) {
                    virtualTransactions.push(virtualTransaction);
                  }
                } else if (matchesProjectedFilters) {
                  virtualTransactions.push(virtualTransaction);
                }
              }
            }
          }

          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        }
      }
    }

    return buildResult({
      virtualTransactions,
      allProjectedCreditCardVirtuals,
      matchingProjectedCreditCardVirtuals,
      includeProjected: true
    });
  }

  private static async buildCreditCardInvoiceSummaryRows(params: {
    companyId: number;
    startDate: Date;
    endDate: Date;
    dateField: CreditCardInvoiceSummaryDateField;
    includeProjected: boolean;
    status?: TransactionStatus;
    accountId?: number;
    categoryId?: number;
    search?: string;
    accessibleAccountIds?: number[];
    projectedTransactions: any[];
    matchingProjectedTransactions: any[];
  }): Promise<CreditCardInvoiceSummaryRow[]> {
    const {
      companyId,
      startDate,
      endDate,
      dateField,
      includeProjected,
      status,
      accountId,
      categoryId,
      search,
      accessibleAccountIds,
      projectedTransactions,
      matchingProjectedTransactions
    } = params;

    if (status === TransactionStatus.CANCELED) {
      return [];
    }

    if (accessibleAccountIds && accessibleAccountIds.length === 0) {
      return [];
    }

    const accountWhere: Prisma.FinancialAccountWhereInput = {
      companyId,
      type: AccountType.CREDIT_CARD,
      ...(accessibleAccountIds ? { id: { in: accessibleAccountIds } } : {})
    };

    const invoiceDateWhere =
      dateField === 'dueDate'
        ? { dueDate: { gte: startDate, lte: endDate } }
        : { closingDate: { gte: startDate, lte: endDate } };

    const normalizedSearch = search?.toLowerCase() ?? '';
    const hasItemLevelFilters = Boolean(categoryId || normalizedSearch);

    const [realInvoices, matchingRealTransactions] = await Promise.all([
      prisma.creditCardInvoice.findMany({
        where: {
          ...invoiceDateWhere,
          ...(accountId ? { accountId } : {}),
          account: accountWhere
        },
        include: {
          account: {
            select: {
              id: true,
              name: true,
              type: true
            }
          },
          paymentTransaction: {
            select: {
              status: true,
              effectiveDate: true,
              date: true
            }
          }
        }
      }),
      hasItemLevelFilters
        ? prisma.financialTransaction.findMany({
            where: {
              companyId,
              type: TransactionType.EXPENSE,
              creditCardInvoiceId: { not: null },
              ...(categoryId ? { categoryId } : {}),
              ...(normalizedSearch
                ? {
                    OR: [
                      { description: { contains: normalizedSearch, mode: 'insensitive' } },
                      { notes: { contains: normalizedSearch, mode: 'insensitive' } }
                    ]
                  }
                : {}),
              creditCardInvoice: {
                is: {
                  ...invoiceDateWhere,
                  ...(accountId ? { accountId } : {}),
                  account: accountWhere
                }
              }
            },
            select: {
              creditCardInvoiceId: true
            }
          })
        : Promise.resolve([])
    ]);

    const matchingRealInvoiceIds = new Set(
      matchingRealTransactions
        .map((transaction) => transaction.creditCardInvoiceId)
        .filter((invoiceId): invoiceId is number => typeof invoiceId === 'number')
    );
    const projectedGroups: Map<string, CreditCardProjectedInvoiceSummaryGroup> = includeProjected
      ? this.groupProjectedCreditCardInvoiceSummaries(projectedTransactions)
      : new Map<string, CreditCardProjectedInvoiceSummaryGroup>();
    const matchingProjectedKeys = includeProjected
      ? new Set(this.groupProjectedCreditCardInvoiceSummaries(matchingProjectedTransactions).keys())
      : new Set<string>();
    const rows: CreditCardInvoiceSummaryRow[] = [];
    const emittedKeys = new Set<string>();

    for (const invoice of realInvoices) {
      const summaryKey = this.buildCreditCardInvoiceSummaryKey(
        invoice.accountId,
        invoice.referenceYear,
        invoice.referenceMonth
      );
      const projectedGroup = projectedGroups.get(summaryKey);
      const summaryDescription = this.buildCreditCardInvoiceSummaryDescription(
        invoice.account.name,
        invoice.referenceYear,
        invoice.referenceMonth
      );
      const matchesSummarySearch =
        !!normalizedSearch && summaryDescription.toLowerCase().includes(normalizedSearch);

      if (
        hasItemLevelFilters &&
        !matchingRealInvoiceIds.has(invoice.id) &&
        !matchingProjectedKeys.has(summaryKey) &&
        !matchesSummarySearch
      ) {
        continue;
      }

      if (!this.matchesCreditCardInvoiceSummaryStatus(status, invoice.status)) {
        continue;
      }

      rows.push(
        this.buildCreditCardInvoiceSummaryRow({
          summaryKey,
          account: invoice.account,
          referenceYear: invoice.referenceYear,
          referenceMonth: invoice.referenceMonth,
          closingDate: invoice.closingDate,
          dueDate: invoice.dueDate,
          invoiceStatus: invoice.status,
          settledAt: this.resolveCreditCardInvoiceSummaryEffectiveDate(invoice),
          realInvoiceId: invoice.id,
          realItemsSubtotal: invoice.totalAmount,
          projectedGroup,
          isProjected: false
        })
      );
      emittedKeys.add(summaryKey);
    }

    if (!includeProjected) {
      return rows;
    }

    for (const [summaryKey, projectedGroup] of projectedGroups.entries()) {
      if (emittedKeys.has(summaryKey)) {
        continue;
      }

      const summaryDescription = this.buildCreditCardInvoiceSummaryDescription(
        projectedGroup.account.name,
        projectedGroup.referenceYear,
        projectedGroup.referenceMonth
      );
      const matchesSummarySearch =
        !!normalizedSearch && summaryDescription.toLowerCase().includes(normalizedSearch);

      if (hasItemLevelFilters && !matchingProjectedKeys.has(summaryKey) && !matchesSummarySearch) {
        continue;
      }

      if (!this.matchesCreditCardInvoiceSummaryStatus(status, projectedGroup.invoiceStatus)) {
        continue;
      }

      rows.push(
        this.buildCreditCardInvoiceSummaryRow({
          summaryKey,
          account: projectedGroup.account,
          referenceYear: projectedGroup.referenceYear,
          referenceMonth: projectedGroup.referenceMonth,
          closingDate: projectedGroup.closingDate,
          dueDate: projectedGroup.dueDate,
          invoiceStatus: projectedGroup.invoiceStatus,
          settledAt: null,
          realInvoiceId: null,
          realItemsSubtotal: new Prisma.Decimal(0),
          projectedGroup,
          isProjected: true
        })
      );
    }

    return rows;
  }

  private static buildCreditCardInvoiceSummaryKey(
    accountId: number,
    referenceYear: number,
    referenceMonth: number
  ): string {
    return `${accountId}:${referenceYear}-${String(referenceMonth).padStart(2, '0')}`;
  }

  private static buildCreditCardInvoiceSummaryDescription(
    accountName: string,
    referenceYear: number,
    referenceMonth: number
  ): string {
    return `Fatura ${accountName} ${String(referenceMonth).padStart(2, '0')}/${referenceYear}`;
  }

  private static groupProjectedCreditCardInvoiceSummaries(
    projectedTransactions: any[]
  ): Map<string, CreditCardProjectedInvoiceSummaryGroup> {
    const grouped = new Map<string, CreditCardProjectedInvoiceSummaryGroup>();

    for (const transaction of projectedTransactions) {
      const account = transaction.fromAccount;
      const invoice = transaction.creditCardInvoice;

      if (!account?.id || !invoice?.referenceYear || !invoice?.referenceMonth || !invoice?.dueDate) {
        continue;
      }

      const summaryKey = this.buildCreditCardInvoiceSummaryKey(
        account.id,
        invoice.referenceYear,
        invoice.referenceMonth
      );

      const current = grouped.get(summaryKey);
      const amount = parseDecimal(transaction.amount);
      const closingDate = new Date(transaction.date);
      const dueDate = new Date(invoice.dueDate);

      if (current) {
        current.fixedSubtotal = current.fixedSubtotal.plus(amount);
        continue;
      }

      grouped.set(summaryKey, {
        account: {
          id: account.id,
          name: account.name,
          type: account.type
        },
        referenceYear: invoice.referenceYear,
        referenceMonth: invoice.referenceMonth,
        closingDate,
        dueDate,
        invoiceStatus: invoice.status,
        fixedSubtotal: amount,
        hasProjectedTransactions: true
      });
    }

    return grouped;
  }

  private static matchesCreditCardInvoiceSummaryStatus(
    requestedStatus: TransactionStatus | undefined,
    invoiceStatus: CreditCardInvoiceStatus
  ): boolean {
    if (!requestedStatus) {
      return true;
    }

    if (requestedStatus === TransactionStatus.CANCELED) {
      return false;
    }

    const summaryStatus = invoiceStatus === CreditCardInvoiceStatus.PAID
      ? TransactionStatus.COMPLETED
      : TransactionStatus.PENDING;

    return requestedStatus === summaryStatus;
  }

  private static resolveCreditCardInvoiceSummaryEffectiveDate(invoice: {
    paymentTransaction?: {
      effectiveDate?: Date | null;
      date?: Date | null;
    } | null;
    settledAt?: Date | null;
  }): Date | null {
    return invoice.paymentTransaction?.effectiveDate ||
      invoice.paymentTransaction?.date ||
      invoice.settledAt ||
      null;
  }

  private static buildCreditCardInvoiceSummaryRow(params: {
    summaryKey: string;
    account: {
      id: number;
      name: string;
      type: string;
    };
    referenceYear: number;
    referenceMonth: number;
    closingDate: Date;
    dueDate: Date;
    invoiceStatus: CreditCardInvoiceStatus;
    settledAt: Date | null;
    realInvoiceId: number | null;
    realItemsSubtotal: Prisma.Decimal | number | string;
    projectedGroup?: {
      fixedSubtotal: Prisma.Decimal;
      hasProjectedTransactions: boolean;
    };
    isProjected: boolean;
  }): CreditCardInvoiceSummaryRow {
    const realItemsSubtotal = parseDecimal(params.realItemsSubtotal);
    const fixedSubtotal = params.projectedGroup?.fixedSubtotal ?? new Prisma.Decimal(0);
    const totalAmount = realItemsSubtotal.plus(fixedSubtotal);
    const status = params.invoiceStatus === CreditCardInvoiceStatus.PAID
      ? TransactionStatus.COMPLETED
      : TransactionStatus.PENDING;
    const invoiceKey = params.realInvoiceId
      ? `invoice:${params.realInvoiceId}`
      : `projection:${String(params.referenceYear)}-${String(params.referenceMonth).padStart(2, '0')}`;

    return {
      id: params.realInvoiceId,
      description: this.buildCreditCardInvoiceSummaryDescription(
        params.account.name,
        params.referenceYear,
        params.referenceMonth
      ),
      amount: totalAmount.toString(),
      date: params.closingDate,
      dueDate: params.dueDate,
      effectiveDate: params.settledAt,
      type: TransactionType.EXPENSE,
      status,
      notes: null,
      fromAccount: params.account,
      toAccount: null,
      category: null,
      tags: [],
      createdByUser: { id: 0, name: 'Sistema' },
      createdAt: params.dueDate,
      installmentNumber: null,
      totalInstallments: null,
      purchaseGroupId: null,
      creditCardInvoice: {
        ...(params.realInvoiceId ? { id: params.realInvoiceId } : {}),
        referenceYear: params.referenceYear,
        referenceMonth: params.referenceMonth,
        dueDate: params.dueDate,
        status: params.invoiceStatus
      },
      isVirtual: false,
      virtualKey: undefined,
      fixedTemplateId: null,
      isFixed: false,
      isProjected: params.isProjected,
      hasProjectedTransactions: params.projectedGroup?.hasProjectedTransactions ?? false,
      isCreditCardInvoiceSummary: true,
      invoiceNavigation: {
        accountId: params.account.id,
        invoiceKey
      },
      itemsSubtotal: realItemsSubtotal.toString(),
      fixedSubtotal: fixedSubtotal.toString()
    };
  }

  private static buildTransactionListSummary(transactions: Array<{
    type?: TransactionType;
    amount?: Prisma.Decimal | string | number | null;
  }>): TransactionListSummary {
    let incomeTotal = new Prisma.Decimal(0);
    let expenseTotal = new Prisma.Decimal(0);

    for (const transaction of transactions) {
      if (transaction.type !== TransactionType.INCOME && transaction.type !== TransactionType.EXPENSE) {
        continue;
      }

      const amount = this.parseTransactionListSummaryAmount(transaction.amount);

      if (transaction.type === TransactionType.INCOME) {
        incomeTotal = incomeTotal.plus(amount);
      } else {
        expenseTotal = expenseTotal.plus(amount);
      }
    }

    return {
      incomeTotal: incomeTotal.toString(),
      expenseTotal: expenseTotal.toString()
    };
  }

  private static parseTransactionListSummaryAmount(
    value: Prisma.Decimal | string | number | null | undefined
  ): Prisma.Decimal {
    if (value === null || value === undefined) {
      return new Prisma.Decimal(0);
    }

    if (value instanceof Prisma.Decimal) {
      return value;
    }

    if (typeof value === 'number') {
      return new Prisma.Decimal(value);
    }

    const compactValue = value.trim().replace(/[^\d,.-]/g, '');

    if (!compactValue) {
      return new Prisma.Decimal(0);
    }

    const hasComma = compactValue.includes(',');
    const hasDot = compactValue.includes('.');
    let normalizedValue = compactValue;

    if (hasComma && hasDot) {
      normalizedValue = compactValue.lastIndexOf(',') > compactValue.lastIndexOf('.')
        ? compactValue.replace(/\./g, '').replace(',', '.')
        : compactValue.replace(/,/g, '');
    } else if (hasComma) {
      normalizedValue = compactValue.replace(',', '.');
    }

    return new Prisma.Decimal(normalizedValue);
  }

  private static sortTransactionsForList(transactions: any[]): any[] {
    return [...transactions].sort((a, b) => {
      const aDateValue = new Date(a?.dueDate || a?.date || 0).getTime();
      const bDateValue = new Date(b?.dueDate || b?.date || 0).getTime();

      if (aDateValue !== bDateValue) {
        return bDateValue - aDateValue;
      }

      const aCreated = new Date(a?.createdAt || a?.date || 0).getTime();
      const bCreated = new Date(b?.createdAt || b?.date || 0).getTime();

      if (aCreated !== bCreated) {
        return bCreated - aCreated;
      }

      const aVirtual = a?.isVirtual ? 1 : 0;
      const bVirtual = b?.isVirtual ? 1 : 0;

      if (aVirtual !== bVirtual) {
        return aVirtual - bVirtual;
      }

      const aId = typeof a?.id === 'number' ? a.id : 0;
      const bId = typeof b?.id === 'number' ? b.id : 0;
      return bId - aId;
    });
  }

  private static buildListDateWhere(
    dateField: TransactionListDateField,
    startDate: Date,
    endDate: Date
  ): Prisma.FinancialTransactionWhereInput {
    switch (dateField) {
      case 'dueDate':
        return { dueDate: { gte: startDate, lte: endDate } };
      case 'effectiveDate':
        return { effectiveDate: { gte: startDate, lte: endDate } };
      case 'createdAt':
        return { createdAt: { gte: startDate, lte: endDate } };
      case 'date':
      default:
        return { date: { gte: startDate, lte: endDate } };
    }
  }

  private static isCreditCardRelatedTransactionForList(transaction: {
    creditCardInvoiceId?: number | null;
    creditCardInvoice?: {
      id?: number | null;
      referenceYear?: number;
      referenceMonth?: number;
      dueDate?: Date | string | null;
      status?: string | null;
    } | null;
  }): boolean {
    if (transaction.creditCardInvoiceId || transaction.creditCardInvoice) {
      return true;
    }

    return false;
  }

  private static isUnsupportedFixedCreditCardTemplate(template: {
    type?: TransactionType;
    toAccount?: { type?: string | null } | null;
  }): boolean {
    return (
      template.type === TransactionType.INCOME &&
      template.toAccount?.type === AccountType.CREDIT_CARD
    );
  }

  private static buildProjectedVirtualTransaction(template: any, occurrenceDate: Date) {
    const isCreditCardFixedExpense =
      template.type === TransactionType.EXPENSE &&
      template.fromAccount?.type === AccountType.CREDIT_CARD &&
      template.fromAccount?.statementClosingDay &&
      template.fromAccount?.statementDueDay;

    const invoiceReference = isCreditCardFixedExpense
      ? resolveCreditCardInvoiceReference(
          occurrenceDate,
          template.fromAccount.statementClosingDay,
          template.fromAccount.statementDueDay
        )
      : null;

    return {
      id: null,
      description: template.description,
      amount: template.amount,
      date: occurrenceDate,
      dueDate: invoiceReference?.dueDate ?? occurrenceDate,
      effectiveDate: null,
      type: template.type,
      status: TransactionStatus.PENDING,
      notes: template.notes,
      fromAccountId: template.fromAccountId,
      toAccountId: template.toAccountId,
      categoryId: template.categoryId,
      recurringTransactionId: template.id,
      occurrenceKey: buildOccurrenceKeyValue(template.id, occurrenceDate),
      installmentNumber: null,
      totalInstallments: null,
      tags: [],
      category: template.category,
      fromAccount: template.fromAccount,
      toAccount: template.toAccount,
      creditCardInvoice: invoiceReference
        ? {
            referenceYear: invoiceReference.referenceYear,
            referenceMonth: invoiceReference.referenceMonth,
            dueDate: invoiceReference.dueDate,
            status: resolveCreditCardInvoiceStatus(invoiceReference.closingDate, false),
            settlementType: null
          }
        : null,
      createdByUser: { id: template.createdBy, name: 'Template Fixa' },
      createdAt: occurrenceDate,
      updatedAt: occurrenceDate,
      isVirtual: true,
      virtualKey: buildOccurrenceKeyValue(template.id, occurrenceDate),
      fixedTemplateId: template.id,
      isFixed: true
    };
  }

  private static getProjectedDateField(
    dateField: TransactionListDateField
  ): Extract<TransactionListDateField, 'dueDate' | 'date'> | null {
    if (dateField === 'dueDate' || dateField === 'date') {
      return dateField;
    }

    return null;
  }

  private static startOfDay(date: Date): Date {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    return normalizedDate;
  }

  private static endOfDay(date: Date): Date {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(23, 59, 59, 999);
    return normalizedDate;
  }

  private static matchesProjectedTransactionFilters(
    transaction: {
      description?: string;
      notes?: string | null;
      type: TransactionType;
      status: TransactionStatus;
      fromAccountId?: number | null;
      toAccountId?: number | null;
      categoryId?: number | null;
    },
    filters: {
      types?: TransactionType[];
      status?: TransactionStatus;
      accountId?: number;
      categoryId?: number;
      search?: string;
    }
  ): boolean {
    if (filters.types && !filters.types.includes(transaction.type)) {
      return false;
    }

    if (filters.status && transaction.status !== filters.status) {
      return false;
    }

    if (filters.categoryId && transaction.categoryId !== filters.categoryId) {
      return false;
    }

    if (filters.accountId) {
      const matchesAccount =
        transaction.fromAccountId === filters.accountId ||
        transaction.toAccountId === filters.accountId;

      if (!matchesAccount) {
        return false;
      }
    }

    if (filters.search) {
      const haystack = `${transaction.description ?? ''} ${transaction.notes ?? ''}`.toLowerCase();
      if (!haystack.includes(filters.search.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  static async getTransactionById(id: number): Promise<any | null> {
    const transaction = await prisma.financialTransaction.findUnique({
      where: { id },
      include: {
        category: true,
        fromAccount: true,
        toAccount: true,
        creditCardInvoice: {
          include: {
            paymentTransaction: {
              select: {
                id: true,
                status: true
              }
            }
          }
        },
        tags: true,
        createdByUser: { select: { id: true, name: true, email: true } }
      }
    });

    if (!transaction) {
      return null;
    }

    if (!transaction.purchaseGroupId) {
      return transaction;
    }

    const purchaseGroupTransactions = await prisma.financialTransaction.findMany({
      where: {
        purchaseGroupId: transaction.purchaseGroupId
      },
      select: {
        id: true,
        description: true,
        amount: true,
        installmentNumber: true,
        totalInstallments: true,
        dueDate: true,
        scheduledDate: true,
        status: true,
        isExternalCreditCardSettlement: true,
        creditCardInvoice: {
          select: {
            id: true,
            referenceYear: true,
            referenceMonth: true,
            dueDate: true,
            status: true,
            paymentTransactionId: true,
            settlementType: true
          }
        }
      },
      orderBy: [
        { installmentNumber: 'asc' },
        { id: 'asc' }
      ]
    });

    return {
      ...transaction,
      purchaseGroupTransactions
    };
  }

  static async getFinancialSummary(
    companyId: number,
    startDate: Date,
    endDate: Date,
    accessibleAccountIds?: number[] // âœ… NOVO PARÃ‚METRO OPCIONAL
  ): Promise<{
    income: number;
    expense: number;
    balance: number;
    accounts: { id: number; name: string; balance: any; type: string }[];
    topCategories: { id: number; name: string; amount: number; color: string }[];
  }> {
    // CACHE: Try to get from cache first (se nÃ£o houver filtro de contas especÃ­ficas)
    let cacheKey: string | null = null;
    if (!accessibleAccountIds || accessibleAccountIds.length === 0) {
      cacheKey = cacheService.getDashboardKey(
        companyId,
        startDate.toISOString(),
        endDate.toISOString()
      );
      
      const cached = await cacheService.get<{
        income: number;
        expense: number;
        balance: number;
        accounts: { id: number; name: string; balance: any; type: string }[];
        topCategories: { id: number; name: string; amount: number; color: string }[];
      }>(cacheKey);

      if (cached) {
        logger.debug('Financial summary served from cache', { companyId, cacheKey });
        return cached;
      }
    }

    // âœ… FILTRAR CONTAS POR PERMISSÃ•ES
    const accountWhere: any = { 
      companyId, 
      isActive: true,
      type: { not: AccountType.CREDIT_CARD }
    };
    
    if (accessibleAccountIds && accessibleAccountIds.length > 0) {
      accountWhere.id = { in: accessibleAccountIds };
    }

    const accounts = await prisma.financialAccount.findMany({
      where: accountWhere,
      select: { id: true, name: true, balance: true, type: true }
    });

    // âœ… FILTRAR TRANSAÃ‡Ã•ES POR CONTAS ACESSÃVEIS
    const transactionWhere: any = {
      companyId,
      status: 'COMPLETED',
      date: { gte: startDate, lte: endDate }
    };

    if (accessibleAccountIds && accessibleAccountIds.length > 0) {
      transactionWhere.OR = [
        { fromAccountId: { in: accessibleAccountIds } },
        { toAccountId: { in: accessibleAccountIds } }
      ];
    }

    const incomeAggregate = await prisma.financialTransaction.aggregate({
      where: {
        ...transactionWhere,
        type: 'INCOME'
      },
      _sum: { amount: true }
    });

    const expenseAggregate = await prisma.financialTransaction.aggregate({
      where: {
        ...transactionWhere,
        type: 'EXPENSE'
      },
      _sum: { amount: true }
    });

    // Inclui transferÃªncias na soma quando filtrando por contas especÃ­ficas
    let incomingTransferAggregate = { _sum: { amount: new Prisma.Decimal(0) } } as { _sum: { amount: Prisma.Decimal | null } };
    let outgoingTransferAggregate = { _sum: { amount: new Prisma.Decimal(0) } } as { _sum: { amount: Prisma.Decimal | null } };

    if (accessibleAccountIds && accessibleAccountIds.length > 0) {
      incomingTransferAggregate = await prisma.financialTransaction.aggregate({
        where: {
          ...transactionWhere,
          type: 'TRANSFER',
          toAccountId: { in: accessibleAccountIds }
        },
        _sum: { amount: true }
      });

      outgoingTransferAggregate = await prisma.financialTransaction.aggregate({
        where: {
          ...transactionWhere,
          type: 'TRANSFER',
          fromAccountId: { in: accessibleAccountIds }
        },
        _sum: { amount: true }
      });
    }

    const topExpenseCategories = await prisma.financialTransaction.groupBy({
      by: ['categoryId'],
      where: {
        ...transactionWhere,
        type: 'EXPENSE',
        categoryId: { not: null }
      },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5
    });

    const categoryIds = topExpenseCategories
      .map(c => c.categoryId)
      .filter(id => id !== null) as number[];

    const categories = await prisma.financialCategory.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, color: true }
    });

    const topCategories = topExpenseCategories
      .filter(c => c.categoryId !== null)
      .map(c => {
        const category = categories.find(cat => cat.id === c.categoryId);
        return {
          id: c.categoryId as number,
          name: category?.name || 'Sem categoria',
          amount: Number(c._sum.amount),
          color: category?.color || '#CCCCCC'
        };
      });

    const income =
      Number(incomeAggregate._sum.amount || 0) +
      Number(incomingTransferAggregate._sum.amount || 0);

    const expense =
      Number(expenseAggregate._sum.amount || 0) +
      Number(outgoingTransferAggregate._sum.amount || 0);

    const balance = income - expense;

    const result = {
      income,
      expense,
      balance,
      accounts,
      topCategories
    };

    // CACHE: Store for 10 minutes (apenas se nÃ£o houver filtro especÃ­fico)
    if (cacheKey) {
      await cacheService.set(cacheKey, result, 600);
      logger.info('Financial summary cached', { companyId, cacheKey });
    }
    
    return result;
  }

  /**
   * CRITICAL: Invalidate caches after financial operations
   */
  private static async invalidateFinancialCaches(companyId: number, accountIds: number[]): Promise<void> {
    // Invalidate dashboard cache
    await cacheService.invalidatePattern(`dashboard:${companyId}:*`);
    
    // Invalidate account balance caches
    for (const accountId of accountIds) {
      await cacheService.del(cacheService.getAccountBalanceKey(accountId));
    }
    
    // Invalidate transaction list caches
    await cacheService.invalidatePattern(`transactions:${companyId}:*`);
    
    logger.debug('Financial caches invalidated', { companyId, accountIds });
  }

  /**
   * Busca sugestÃµes de autocomplete para descriÃ§Ãµes de transaÃ§Ãµes
   * Filtrado por tipo de transaÃ§Ã£o para melhor relevÃ¢ncia e performance
   */
  static async getDescriptionSuggestions(
    companyId: number, 
    query: string, 
    transactionType: TransactionType, // âœ… NOVO PARÃ‚METRO
    limit: number = 10
  ): Promise<Array<{ description: string; frequency: number }>> {
    
    // ValidaÃ§Ã£o de entrada
    if (!query || query.trim().length < 3) {
      return [];
    }

    const normalizedQuery = query.trim();
    
    try {
      // âœ… BUSCAR DESCRIÃ‡Ã•ES FILTRADAS POR TIPO E FREQUÃŠNCIA
      const suggestions = await prisma.financialTransaction.groupBy({
        by: ['description'],
        where: {
          companyId,
          type: transactionType, // âœ… FILTRO POR TIPO DE TRANSAÃ‡ÃƒO
          description: {
            contains: normalizedQuery,
            mode: 'insensitive' // Case-insensitive search
          }
        },
        _count: {
          description: true
        },
        orderBy: [
          {
            _count: {
              description: 'desc' // Mais frequentes primeiro
            }
          },
          {
            description: 'asc' // AlfabÃ©tica como critÃ©rio secundÃ¡rio
          }
        ],
        take: limit
      });

      // Mapear resultado para formato esperado
      const formattedSuggestions = suggestions
        .filter(item => item.description) // Garantir que descriÃ§Ã£o nÃ£o Ã© null
        .map(item => ({
          description: item.description!,
          frequency: item._count.description
        }));

      logger.debug('Autocomplete suggestions generated with type filter', {
        companyId,
        query: normalizedQuery,
        transactionType, // âœ… LOG DO TIPO
        resultCount: formattedSuggestions.length,
        topResult: formattedSuggestions[0]?.description
      });

      return formattedSuggestions;

    } catch (error) {
      logger.error('Error fetching description suggestions', {
        companyId,
        query: normalizedQuery,
        transactionType, // âœ… LOG DO TIPO NO ERRO
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Em caso de erro, retornar array vazio em vez de lanÃ§ar exceÃ§Ã£o
      return [];
    }
  }
}



