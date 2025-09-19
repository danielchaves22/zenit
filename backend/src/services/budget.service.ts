import { PrismaClient, Budget, BudgetStatus, BudgetType, TransactionType } from '@prisma/client';
import FinancialTransactionService from './financial-transaction.service';
import DefaultService from './default.service';

const prisma = new PrismaClient();

export default class BudgetService {
  static async createOrUpdateBudget(data: {
    id?: number;
    code: string;
    initialAmount: number | string;
    currentBalance: number | string;
    endDate: Date;
    desiredFinalBalance: number | string;
    dailyBudgetInitial: number | string;
    dailyBudgetCurrent: number | string;
    startDate: Date;
    type: BudgetType;
    dailyBudgetDate: Date;
    isWork?: boolean;
    status?: BudgetStatus;
    extraDailyBalance?: number | string;
    companyId: number;
    createdBy: number;
  }): Promise<Budget> {
    const {
      id,
      code,
      initialAmount,
      currentBalance,
      endDate,
      desiredFinalBalance,
      dailyBudgetInitial,
      dailyBudgetCurrent,
      startDate,
      type,
      dailyBudgetDate,
      isWork = false,
      status = BudgetStatus.ACTIVE,
      extraDailyBalance = 0,
      companyId,
      createdBy
    } = data;

    if (id) {
      return prisma.budget.update({
        where: { id },
        data: {
          code,
          initialAmount,
          currentBalance,
          endDate,
          desiredFinalBalance,
          dailyBudgetInitial,
          dailyBudgetCurrent,
          startDate,
          type,
          dailyBudgetDate,
          isWork,
          status,
          extraDailyBalance,
          companyId,
          createdBy
        }
      });
    }

    return prisma.budget.create({
      data: {
        code,
        initialAmount,
        currentBalance,
        endDate,
        desiredFinalBalance,
        dailyBudgetInitial,
        dailyBudgetCurrent,
        startDate,
        type,
        dailyBudgetDate,
        isWork,
        status,
        extraDailyBalance,
        companyId,
        createdBy
      }
    });
  }

  static async listBudgets(companyId: number): Promise<Budget[]> {
    return prisma.budget.findMany({
      where: { companyId }
    });
  }

  static async addTransaction(budgetId: number, params: {
    description: string;
    amount: number | string;
    date: Date;
    type: TransactionType;
    companyId: number;
    createdBy: number;
  }) {
    const { companyId, createdBy, ...data } = params;
    const defaults = await DefaultService.getCompanyDefaults(companyId);
    const category =
      data.type === TransactionType.EXPENSE
        ? defaults.categories.expense
        : defaults.categories.income;

    return FinancialTransactionService.createTransaction({
      ...data,
      budgetId,
      status: 'COMPLETED',
      fromAccountId: defaults.account?.id,
      toAccountId: defaults.account?.id,
      categoryId: category?.id,
      companyId,
      createdBy
    });
  }
}

