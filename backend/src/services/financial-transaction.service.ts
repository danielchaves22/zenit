import { PrismaClient, FinancialTransaction, TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { parseDecimal } from '../utils/money';
import cacheService from './cache.service';

const prisma = new PrismaClient();

// ============================================
// CRITICAL: FINANCIAL DATA INTEGRITY CLASS
// ============================================

export default class FinancialTransactionService {
  
  /**
   * CRITICAL: Creates financial transaction with ACID guarantees
   * Netflix-level reliability for financial operations
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
    budgetId?: number | null;
    companyId: number;
    createdBy: number;
    tags?: string[];
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

    // ✅ CRITICAL: Input validation BEFORE any DB operation
    this.validateTransactionData(data.type, data.fromAccountId, data.toAccountId);
    const parsedAmount = parseDecimal(data.amount);
    
    if (parsedAmount.lte(0)) {
      throw new Error('Transaction amount must be positive');
    }

    // ✅ CRITICAL: Maximum 3 retry attempts for deadlocks
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        return await this.executeTransactionWithFullLocking(data, parsedAmount, transactionId, startTime);
      } catch (error: any) {
        // ✅ CRITICAL: Retry only on deadlock/serialization failures
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
        
        // ✅ CRITICAL: Log all financial transaction failures
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
      
      // ✅ CRITICAL: Acquire locks in DETERMINISTIC ORDER to prevent deadlocks
      const accountsToLock = [];
      if (data.fromAccountId) accountsToLock.push(data.fromAccountId);
      if (data.toAccountId && data.toAccountId !== data.fromAccountId) {
        accountsToLock.push(data.toAccountId);
      }
      
      // Sort to ensure consistent locking order
      accountsToLock.sort((a, b) => a - b);
      
      const lockedAccounts: any[] = [];
      
      // ✅ CRITICAL: Acquire ALL locks BEFORE any business logic
      for (const accountId of accountsToLock) {
        try {
          const result = await tx.$queryRaw`
            SELECT id, name, balance, "isActive", "companyId", "allowNegativeBalance"
            FROM "FinancialAccount"
            WHERE id = ${accountId}
            FOR UPDATE NOWAIT
          `;
          
          if (!result || (result as any[]).length === 0) {
            throw new Error(`Account ID ${accountId} not found`);
          }
          
          const account = (result as any[])[0];
          
          // ✅ CRITICAL: Verify account belongs to company
          if (account.companyId !== data.companyId) {
            throw new Error(`Account ${accountId} does not belong to company ${data.companyId}`);
          }
          
          // ✅ CRITICAL: Verify account is active
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
      
      // ✅ CRITICAL: Business logic validation AFTER locks acquired
      if (data.status === 'COMPLETED') {
        await this.validateBusinessRules(data, parsedAmount, lockedAccounts);
      }
      
      // ✅ CRITICAL: Create transaction record FIRST (for audit trail)
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
          fromAccount: data.fromAccountId ? { connect: { id: data.fromAccountId } } : undefined,
          toAccount: data.toAccountId ? { connect: { id: data.toAccountId } } : undefined,
          category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
          budget: data.budgetId ? { connect: { id: data.budgetId } } : undefined,
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
      
      // ✅ CRITICAL: Update account balances ATOMICALLY
      if (data.status === 'COMPLETED') {
        await this.updateAccountBalancesAtomic(tx, {
          transactionId: transaction.id,
          type: data.type,
          amount: parsedAmount,
          fromAccountId: data.fromAccountId,
          toAccountId: data.toAccountId
        });
        
        // ✅ CRITICAL: Verify balance integrity AFTER update
        await this.verifyBalanceIntegrity(tx, accountsToLock);
      }
      
      // ✅ CRITICAL: Success audit log
      logger.info('Financial transaction completed successfully', {
        transactionId,
        dbTransactionId: transaction.id,
        type: data.type,
        amount: parsedAmount.toString(),
        duration: Date.now() - startTime,
        accountsAffected: accountsToLock.length
      });

      // ✅ CRITICAL: Invalidate relevant caches
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
      
      // ✅ VERIFICAR SE PERMITE SALDO NEGATIVO
      if (!fromAccount.allowNegativeBalance) {
        // ✅ VALIDAÇÃO TRADICIONAL - não permite negativo
        if (currentBalance.lt(transactionAmount)) {
          throw new Error(
            `Insufficient balance. Available: ${currentBalance.toFixed(2)}, Required: ${transactionAmount.toFixed(2)}`
          );
        }
      } else {
        // ✅ PERMITE NEGATIVO - mas ainda logamos para auditoria
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
      
      // ✅ VERIFICAR SE PERMITE SALDO NEGATIVO PARA TRANSFERÊNCIAS
      if (!fromAccount.allowNegativeBalance) {
        if (currentBalance.lt(transferAmount)) {
          throw new Error(
            `Insufficient balance for transfer. Available: ${currentBalance.toFixed(2)}, Required: ${transferAmount.toFixed(2)}`
          );
        }
      } else {
        // ✅ PERMITE NEGATIVO - mas ainda logamos para auditoria
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
      // ✅ CRITICAL: BOTH updates in same atomic operation
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
      
      // ✅ SÓ VERIFICAR NEGATIVOS SE A CONTA NÃO PERMITE
      if (!account.allowNegativeBalance && balance.lt(0)) {
        throw new Error(
          `CRITICAL: Account ${accountId} (${account.name}) has negative balance: ${balance.toFixed(2)} but allowNegativeBalance is false`
        );
      }
      
      // ✅ LOG PARA AUDITORIA DE SALDOS NEGATIVOS PERMITIDOS
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
    }>,
    companyId: number
  ): Promise<FinancialTransaction> {
    
    const transactionId = `update_${id}_${Date.now()}`;
    
    return await prisma.$transaction(async (tx) => {
      
      // ✅ CRITICAL: Lock original transaction first
      const original = await tx.$queryRaw`
        SELECT * FROM "FinancialTransaction" 
        WHERE id = ${id} 
        FOR UPDATE NOWAIT
      ` as any[];

      if (!original || original.length === 0) {
        throw new Error(`Transaction ${id} not found`);
      }

      const originalTxn = original[0];
      
      // ✅ CRITICAL: Company ownership verification
      if (originalTxn.companyId !== companyId) {
        throw new Error(`Transaction ${id} does not belong to company ${companyId}`);
      }

      // ✅ CRITICAL: Collect ALL accounts that need locking (old + new)
      const accountsToLock = new Set<number>();
      
      if (originalTxn.fromAccountId) accountsToLock.add(originalTxn.fromAccountId);
      if (originalTxn.toAccountId) accountsToLock.add(originalTxn.toAccountId);
      if (data.fromAccountId) accountsToLock.add(data.fromAccountId);
      if (data.toAccountId) accountsToLock.add(data.toAccountId);
      
      // ✅ CRITICAL: Acquire locks in deterministic order
      const sortedAccountIds = Array.from(accountsToLock).sort((a, b) => a - b);
      
      for (const accountId of sortedAccountIds) {
        await tx.$queryRaw`
          SELECT id FROM "FinancialAccount" 
          WHERE id = ${accountId} 
          FOR UPDATE NOWAIT
        `;
      }

      // ✅ CRITICAL: If was COMPLETED, reverse the effects first
      if (originalTxn.status === 'COMPLETED') {
        await this.reverseAccountBalancesAtomic(tx, {
          type: originalTxn.type,
          amount: originalTxn.amount,
          fromAccountId: originalTxn.fromAccountId,
          toAccountId: originalTxn.toAccountId
        });
      }

      // ✅ CRITICAL: Update the transaction record
      const updatedData: any = {};
      if (data.description !== undefined) updatedData.description = data.description;
      if (data.amount !== undefined) updatedData.amount = parseDecimal(data.amount);
      if (data.date !== undefined) updatedData.date = data.date;
      if (data.dueDate !== undefined) updatedData.dueDate = data.dueDate;
      if (data.effectiveDate !== undefined) updatedData.effectiveDate = data.effectiveDate;
      if (data.type !== undefined) updatedData.type = data.type;
      if (data.status !== undefined) updatedData.status = data.status;
      if (data.notes !== undefined) updatedData.notes = data.notes;

      const updated = await tx.financialTransaction.update({
        where: { id },
        data: updatedData
      });

      // ✅ CRITICAL: Apply new effects if COMPLETED
      const newStatus = data.status || originalTxn.status;
      if (newStatus === 'COMPLETED') {
        await this.updateAccountBalancesAtomic(tx, {
          transactionId: updated.id,
          type: updated.type,
          amount: updated.amount,
          fromAccountId: updated.fromAccountId,
          toAccountId: updated.toAccountId
        });
        
        // ✅ CRITICAL: Verify integrity
        await this.verifyBalanceIntegrity(tx, sortedAccountIds);
      }

      logger.info('Financial transaction updated successfully', {
        transactionId,
        dbTransactionId: id,
        originalStatus: originalTxn.status,
        newStatus,
        accountsAffected: sortedAccountIds.length
      });

      return updated;
      
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
    toAccountId?: number | null
  ): void {
    if (type === 'INCOME' && !toAccountId) {
      throw new Error('Income transactions require destination account');
    }
    if (type === 'EXPENSE' && !fromAccountId) {
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

  static async deleteTransaction(id: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.$queryRaw`
        SELECT * FROM "FinancialTransaction" WHERE id = ${id} FOR UPDATE NOWAIT
      ` as any[];

      if (!transaction || transaction.length === 0) {
        throw new Error(`Transaction ${id} not found`);
      }

      const txn = transaction[0];

      // Lock accounts
      const accountsToLock = [];
      if (txn.fromAccountId) accountsToLock.push(txn.fromAccountId);
      if (txn.toAccountId) accountsToLock.push(txn.toAccountId);
      
      for (const accountId of accountsToLock.sort()) {
        await tx.$queryRaw`SELECT id FROM "FinancialAccount" WHERE id = ${accountId} FOR UPDATE NOWAIT`;
      }

      // Reverse if completed
      if (txn.status === 'COMPLETED') {
        await this.reverseAccountBalancesAtomic(tx, {
          type: txn.type,
          amount: txn.amount,
          fromAccountId: txn.fromAccountId,
          toAccountId: txn.toAccountId
        });
      }

      // Remove tags
      await tx.$executeRaw`
        DELETE FROM "_FinancialTagToFinancialTransaction" WHERE "B" = ${id}
      `;

      // Delete transaction
      await tx.financialTransaction.delete({ where: { id } });

      logger.info('Financial transaction deleted successfully', { transactionId: id });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 30000
    });
  }

  static async updateTransactionStatus(id: number, status: TransactionStatus): Promise<FinancialTransaction> {
    return this.updateTransaction(id, { status }, 0);
  }

  static async listTransactions(params: {
    companyId: number;
    startDate?: Date;
    endDate?: Date;
    type?: TransactionType;
    status?: TransactionStatus;
    accountId?: number;
    categoryId?: number;
    search?: string;
    page?: number;
    pageSize?: number;
    accessFilter?: any; // ✅ NOVO PARÂMETRO
  }): Promise<{ data: FinancialTransaction[]; total: number; pages: number }> {
    const {
      companyId,
      startDate,
      endDate,
      type,
      status,
      accountId,
      categoryId,
      search,
      page = 1,
      pageSize = 20,
      accessFilter // ✅ NOVO PARÂMETRO
    } = params;

    const where: Prisma.FinancialTransactionWhereInput = {
      companyId,
      ...(startDate && { date: { gte: startDate } }),
      ...(endDate && { date: { lte: endDate } }),
      ...(type && { type }),
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(accountId && {
        OR: [
          { fromAccountId: accountId },
          { toAccountId: accountId }
        ]
      }),
      ...(search && {
        OR: [
          { description: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } }
        ]
      }),
      // ✅ APLICAR FILTRO DE PERMISSÕES SE FORNECIDO
      ...(accessFilter && { AND: [accessFilter] })
    };

    const [data, total] = await Promise.all([
      prisma.financialTransaction.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, color: true } },
          fromAccount: { select: { id: true, name: true } },
          toAccount: { select: { id: true, name: true } },
          tags: { select: { id: true, name: true } },
          createdByUser: { select: { id: true, name: true } }
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.financialTransaction.count({ where })
    ]);

    const pages = Math.ceil(total / pageSize);
    return { data, total, pages };
  }

  static async getTransactionById(id: number): Promise<FinancialTransaction | null> {
    return prisma.financialTransaction.findUnique({
      where: { id },
      include: {
        category: true,
        fromAccount: true,
        toAccount: true,
        tags: true,
        createdByUser: { select: { id: true, name: true, email: true } }
      }
    });
  }

  static async getFinancialSummary(
    companyId: number,
    startDate: Date,
    endDate: Date,
    accessibleAccountIds?: number[] // ✅ NOVO PARÂMETRO OPCIONAL
  ): Promise<{
    income: number;
    expense: number;
    balance: number;
    accounts: { id: number; name: string; balance: any; type: string }[];
    topCategories: { id: number; name: string; amount: number; color: string }[];
  }> {
    // CACHE: Try to get from cache first (se não houver filtro de contas específicas)
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

    // ✅ FILTRAR CONTAS POR PERMISSÕES
    const accountWhere: any = { 
      companyId, 
      isActive: true 
    };
    
    if (accessibleAccountIds && accessibleAccountIds.length > 0) {
      accountWhere.id = { in: accessibleAccountIds };
    }

    const accounts = await prisma.financialAccount.findMany({
      where: accountWhere,
      select: { id: true, name: true, balance: true, type: true }
    });

    // ✅ FILTRAR TRANSAÇÕES POR CONTAS ACESSÍVEIS
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

    // Inclui transferências na soma quando filtrando por contas específicas
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

    // CACHE: Store for 10 minutes (apenas se não houver filtro específico)
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
   * Busca sugestões de autocomplete para descrições de transações
   * Filtrado por tipo de transação para melhor relevância e performance
   */
  static async getDescriptionSuggestions(
    companyId: number, 
    query: string, 
    transactionType: TransactionType, // ✅ NOVO PARÂMETRO
    limit: number = 10
  ): Promise<Array<{ description: string; frequency: number }>> {
    
    // Validação de entrada
    if (!query || query.trim().length < 3) {
      return [];
    }

    const normalizedQuery = query.trim();
    
    try {
      // ✅ BUSCAR DESCRIÇÕES FILTRADAS POR TIPO E FREQUÊNCIA
      const suggestions = await prisma.financialTransaction.groupBy({
        by: ['description'],
        where: {
          companyId,
          type: transactionType, // ✅ FILTRO POR TIPO DE TRANSAÇÃO
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
            description: 'asc' // Alfabética como critério secundário
          }
        ],
        take: limit
      });

      // Mapear resultado para formato esperado
      const formattedSuggestions = suggestions
        .filter(item => item.description) // Garantir que descrição não é null
        .map(item => ({
          description: item.description!,
          frequency: item._count.description
        }));

      logger.debug('Autocomplete suggestions generated with type filter', {
        companyId,
        query: normalizedQuery,
        transactionType, // ✅ LOG DO TIPO
        resultCount: formattedSuggestions.length,
        topResult: formattedSuggestions[0]?.description
      });

      return formattedSuggestions;

    } catch (error) {
      logger.error('Error fetching description suggestions', {
        companyId,
        query: normalizedQuery,
        transactionType, // ✅ LOG DO TIPO NO ERRO
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Em caso de erro, retornar array vazio em vez de lançar exceção
      return [];
    }
  }
}