// __tests__/financial-stress.test.ts
// CRITICAL: Stress tests for financial data integrity under concurrency

import { PrismaClient } from '@prisma/client';
import FinancialTransactionService from '../../src/services/financial-transaction.service';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

describe('Financial System Stress Tests - PRODUCTION CRITICAL', () => {
  const uniqueSuffix = Date.now().toString();
  let companyId: number;
  let userId: number;
  let account1Id: number;
  let account2Id: number;
  let categoryId: number;
  const resetFinancialState = async (balance1: number, balance2: number) => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.financialAccount.update({
      where: { id: account1Id },
      data: { balance: balance1 }
    });
    await prisma.financialAccount.update({
      where: { id: account2Id },
      data: { balance: balance2 }
    });
  };

  beforeAll(async () => {
    const company = await prisma.company.create({
      data: {
        name: `Stress Test Corp ${uniqueSuffix}`,
        code: Number(uniqueSuffix.slice(-6)) + 500
      }
    });
    companyId = company.id;

    const hash = await bcrypt.hash('password', 10);
    const user = await prisma.user.create({
      data: { 
        email: `stress.${uniqueSuffix}@test.com`, 
        password: hash, 
        name: 'Stress Tester', 
        role: 'ADMIN' 
      }
    });
    userId = user.id;

    await prisma.userCompany.create({
      data: { userId: user.id, companyId, isDefault: true, role: 'USER' }
    });

    // Create test accounts with specific balances
    const account1 = await prisma.financialAccount.create({
      data: {
        name: 'Test Account 1',
        type: 'CHECKING',
        balance: 10000, // Start with $10,000
        companyId
      }
    });
    account1Id = account1.id;

    const account2 = await prisma.financialAccount.create({
      data: {
        name: 'Test Account 2', 
        type: 'CHECKING',
        balance: 5000, // Start with $5,000
        companyId
      }
    });
    account2Id = account2.id;

    const category = await prisma.financialCategory.create({
      data: {
        name: 'Test Category',
        type: 'EXPENSE',
        companyId
      }
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.financialTransaction.deleteMany({ where: { companyId } });
    await prisma.financialTag.deleteMany({ where: { companyId } });
    await prisma.financialCategory.deleteMany({ where: { companyId } });
    await prisma.financialAccount.deleteMany({ where: { companyId } });
    await prisma.userCompany.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  /**
   * CRITICAL TEST: Concurrent transactions on same account
   * Netflix/Stripe level: 100 concurrent transactions should NOT corrupt balances
   */
  describe('CRITICAL: Concurrent Transaction Safety', () => {
    
    it('should handle 50 concurrent expenses without balance corruption', async () => {
      const initialBalance = 10000;
      const expenseAmount = 100;
      const concurrentCount = 50;

      await resetFinancialState(initialBalance, 5000);

      // Create 50 concurrent expense transactions
      const promises = Array(concurrentCount).fill(0).map(async (_, index) => {
        return FinancialTransactionService.createTransaction({
          description: `Concurrent Expense ${index + 1}`,
          amount: expenseAmount,
          date: new Date(),
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: account1Id,
          categoryId,
          companyId,
          createdBy: userId
        });
      });

      // Execute all transactions concurrently
      const results = await Promise.allSettled(promises);
      
      // Count successful transactions
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Successful transactions: ${successCount}`);
      console.log(`❌ Failed transactions: ${failureCount}`);

      // Verify final balance integrity
      const finalAccount = await prisma.financialAccount.findUnique({
        where: { id: account1Id }
      });

      const actualFinalBalance = Number(finalAccount!.balance);
      const expectedBalanceWithSuccesses = initialBalance - (expenseAmount * successCount);

      expect(actualFinalBalance).toBe(expectedBalanceWithSuccesses);
      expect(successCount + failureCount).toBe(concurrentCount);
      expect(successCount).toBeGreaterThan(0);
      expect(failureCount).toBeGreaterThan(0);
      
      console.log(`🎯 Balance integrity verified: ${actualFinalBalance} (expected: ${expectedBalanceWithSuccesses})`);
    }, 60000); // 60 second timeout

    it('should handle concurrent transfers between accounts', async () => {
      const initialBalance1 = 5000;
      const initialBalance2 = 3000;
      const transferAmount = 50;
      const transferCount = 30;

      await resetFinancialState(initialBalance1, initialBalance2);

      // 15 transfers from account1 to account2
      // 15 transfers from account2 to account1
      const promises = Array(transferCount).fill(0).map(async (_, index) => {
        const fromAccount = index % 2 === 0 ? account1Id : account2Id;
        const toAccount = index % 2 === 0 ? account2Id : account1Id;
        
        return FinancialTransactionService.createTransaction({
          description: `Transfer ${index + 1}`,
          amount: transferAmount,
          date: new Date(),
          type: 'TRANSFER',
          status: 'COMPLETED',
          fromAccountId: fromAccount,
          toAccountId: toAccount,
          companyId,
          createdBy: userId
        });
      });

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      // Check final balances
      const [finalAccount1, finalAccount2] = await Promise.all([
        prisma.financialAccount.findUnique({ where: { id: account1Id } }),
        prisma.financialAccount.findUnique({ where: { id: account2Id } })
      ]);

      const balance1 = Number(finalAccount1!.balance);
      const balance2 = Number(finalAccount2!.balance);
      const totalBalance = balance1 + balance2;
      const expectedTotalBalance = initialBalance1 + initialBalance2;

      // CRITICAL: Total money in system must be preserved
      expect(totalBalance).toBe(expectedTotalBalance);
      
      console.log(`🎯 Money preservation verified: ${totalBalance} = ${expectedTotalBalance}`);
      console.log(`📊 Account 1: ${balance1}, Account 2: ${balance2}`);
      
    }, 45000);

    it('should prevent overdrafts under concurrent load', async () => {
      const lowBalance = 200;
      const expenseAmount = 100;
      const attemptCount = 10; // Try to spend $1000 when only $200 available

      await resetFinancialState(lowBalance, 3000);

      const promises = Array(attemptCount).fill(0).map(async (_, index) => {
        return FinancialTransactionService.createTransaction({
          description: `Overdraft Attempt ${index + 1}`,
          amount: expenseAmount,
          date: new Date(),
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: account1Id,
          categoryId,
          companyId,
          createdBy: userId
        });
      });

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const rejectedCount = results.filter(r => r.status === 'rejected').length;

      // Should only allow 2 transactions maximum (200/100 = 2)
      expect(successCount).toBeLessThanOrEqual(2);
      expect(rejectedCount).toBeGreaterThanOrEqual(8);

      // Final balance should never be negative for checking account
      const finalAccount = await prisma.financialAccount.findUnique({
        where: { id: account1Id }
      });
      
      expect(Number(finalAccount!.balance)).toBeGreaterThanOrEqual(0);
      
      console.log(`🛡️  Overdraft protection verified: ${successCount} allowed, ${rejectedCount} rejected`);
    }, 30000);

  });

  /**
   * CRITICAL TEST: System recovery and consistency
   */
  describe('CRITICAL: System Consistency Verification', () => {

    it('should maintain audit trail consistency', async () => {
      await resetFinancialState(1000, 500);

      await FinancialTransactionService.createTransaction({
        description: 'Audit income',
        amount: 300,
        date: new Date(),
        type: 'INCOME',
        status: 'COMPLETED',
        toAccountId: account1Id,
        companyId,
        createdBy: userId
      });
      await FinancialTransactionService.createTransaction({
        description: 'Audit expense',
        amount: 120,
        date: new Date(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: account1Id,
        categoryId,
        companyId,
        createdBy: userId
      });
      await FinancialTransactionService.createTransaction({
        description: 'Audit transfer',
        amount: 200,
        date: new Date(),
        type: 'TRANSFER',
        status: 'COMPLETED',
        fromAccountId: account1Id,
        toAccountId: account2Id,
        companyId,
        createdBy: userId
      });

      const transactions = await prisma.financialTransaction.findMany({
        where: { 
          companyId,
          status: 'COMPLETED',
          OR: [
            { fromAccountId: account1Id },
            { toAccountId: account1Id }
          ]
        }
      });

      const account = await prisma.financialAccount.findUnique({
        where: { id: account1Id }
      });

      let calculatedBalance = 1000;
      
      for (const txn of transactions) {
        if (txn.type === 'INCOME' && txn.toAccountId === account1Id) {
          calculatedBalance += Number(txn.amount);
        } else if (txn.type === 'EXPENSE' && txn.fromAccountId === account1Id) {
          calculatedBalance -= Number(txn.amount);
        } else if (txn.type === 'TRANSFER') {
          if (txn.fromAccountId === account1Id) {
            calculatedBalance -= Number(txn.amount);
          } else if (txn.toAccountId === account1Id) {
            calculatedBalance += Number(txn.amount);
          }
        }
      }

      const actualBalance = Number(account!.balance);
      
      // CRITICAL: Calculated balance must match actual balance
      expect(actualBalance).toBeCloseTo(calculatedBalance, 2);
      
      console.log(`🔍 Audit trail verified: Calculated=${calculatedBalance}, Actual=${actualBalance}`);
    });

    it('should verify total system money conservation', async () => {
      await resetFinancialState(15000, 5000);

      await FinancialTransactionService.createTransaction({
        description: 'Conservation income',
        amount: 500,
        date: new Date(),
        type: 'INCOME',
        status: 'COMPLETED',
        toAccountId: account1Id,
        companyId,
        createdBy: userId
      });
      await FinancialTransactionService.createTransaction({
        description: 'Conservation expense',
        amount: 200,
        date: new Date(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: account1Id,
        categoryId,
        companyId,
        createdBy: userId
      });
      await FinancialTransactionService.createTransaction({
        description: 'Conservation transfer',
        amount: 300,
        date: new Date(),
        type: 'TRANSFER',
        status: 'COMPLETED',
        fromAccountId: account1Id,
        toAccountId: account2Id,
        companyId,
        createdBy: userId
      });

      const accounts = await prisma.financialAccount.findMany({
        where: { companyId }
      });

      const totalSystemBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance), 0);
      
      // Get all completed income transactions
      const incomeSum = await prisma.financialTransaction.aggregate({
        where: {
          companyId,
          type: 'INCOME',
          status: 'COMPLETED'
        },
        _sum: { amount: true }
      });

      // Get all completed expense transactions  
      const expenseSum = await prisma.financialTransaction.aggregate({
        where: {
          companyId,
          type: 'EXPENSE',
          status: 'COMPLETED'
        },
        _sum: { amount: true }
      });

      const initialSystemBalance = 20000;
      const totalIncome = Number(incomeSum._sum.amount || 0);
      const totalExpenses = Number(expenseSum._sum.amount || 0);
      
      const expectedBalance = initialSystemBalance + totalIncome - totalExpenses;
      
      // CRITICAL: Money cannot be created or destroyed
      expect(totalSystemBalance).toBeCloseTo(expectedBalance, 2);
      
      console.log(`💰 Money conservation verified:`);
      console.log(`   Initial: ${initialSystemBalance}`);
      console.log(`   Income: +${totalIncome}`);
      console.log(`   Expenses: -${totalExpenses}`);
      console.log(`   Expected: ${expectedBalance}`);
      console.log(`   Actual: ${totalSystemBalance}`);
    });

  });

  /**
   * PERFORMANCE BENCHMARK: Response time under load
   */
  describe('PERFORMANCE: Response Time Benchmarks', () => {

    it('should process single transaction in <200ms', async () => {
      await resetFinancialState(1000, 1000);
      const startTime = Date.now();
      
      await FinancialTransactionService.createTransaction({
        description: 'Performance Test',
        amount: 50,
        date: new Date(),
        type: 'EXPENSE',
        status: 'COMPLETED',
        fromAccountId: account1Id,
        categoryId,
        companyId,
        createdBy: userId
      });

      const duration = Date.now() - startTime;
      
      // CRITICAL: Single transaction must be fast
      expect(duration).toBeLessThan(200);
      
      console.log(`⚡ Single transaction performance: ${duration}ms`);
    });

    it('should handle 10 sequential transactions in <2s', async () => {
      await resetFinancialState(1000, 1000);
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        await FinancialTransactionService.createTransaction({
          description: `Sequential Test ${i + 1}`,
          amount: 25,
          date: new Date(),
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: account1Id,
          categoryId,
          companyId,
          createdBy: userId
        });
      }

      const duration = Date.now() - startTime;
      
      // Target: <200ms average per transaction
      expect(duration).toBeLessThan(2000);
      
      console.log(`📈 Sequential performance: ${duration}ms for 10 transactions (${duration/10}ms avg)`);
    });

  });

});

/**
 * UTILITY: Run this test to verify production readiness
 * 
 * Usage:
 * npm test -- financial-stress.test.ts
 * 
 * All tests MUST pass before production deployment.
 * Any failure indicates potential data corruption risk.
 */
