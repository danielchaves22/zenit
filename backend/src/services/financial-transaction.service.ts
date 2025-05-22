import { PrismaClient, FinancialTransaction, TransactionType, TransactionStatus, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { parseDecimal } from '../utils/money';

const prisma = new PrismaClient();

/**
 * Serviço para gerenciar transações financeiras
 * Com suporte para transações atômicas e atualizações automáticas de saldo
 */
export default class FinancialTransactionService {
  /**
   * Cria uma transação financeira com atualizações de saldo em transação atômica
   */
  static async createTransaction(data: {
    description: string;
    amount: number | string;
    date: Date;
    type: TransactionType;
    status?: TransactionStatus;
    notes?: string;
    fromAccountId?: number | null;
    toAccountId?: number | null;
    categoryId?: number | null;
    companyId: number;
    createdBy: number;
    tags?: string[];
  }): Promise<FinancialTransaction> {
    const {
      description,
      amount,
      date,
      type,
      status = 'PENDING',
      notes,
      fromAccountId,
      toAccountId,
      categoryId,
      companyId,
      createdBy,
      tags = []
    } = data;

    // Validação por tipo de transação
    this.validateTransactionData(type, fromAccountId, toAccountId);

    // Convertemos para decimal (2 casas) garantindo precisão
    const parsedAmount = parseDecimal(amount);

    // Usamos transação para garantir consistência
    return prisma.$transaction(async (tx) => {
      // 1. Criar a transação base
      const transaction = await tx.financialTransaction.create({
        data: {
          description,
          amount: parsedAmount,
          date,
          type,
          status,
          notes,
          // Usando operador ternário com verificação explícita para valor truthy
          fromAccount: fromAccountId ? { connect: { id: fromAccountId } } : undefined,
          toAccount: toAccountId ? { connect: { id: toAccountId } } : undefined,
          category: categoryId ? { connect: { id: categoryId } } : undefined,
          company: { connect: { id: companyId } },
          createdByUser: { connect: { id: createdBy } },
          // Conecta ou cria tags 
          tags: tags.length > 0 ? {
            connectOrCreate: tags.map(tagName => ({
              where: { name_companyId: { name: tagName, companyId } },
              create: { name: tagName, company: { connect: { id: companyId } } }
            }))
          } : undefined
        }
      });

      // 2. Se o status for COMPLETED, atualiza os saldos
      if (status === 'COMPLETED') {
        await this.updateAccountBalances(tx, {
          id: transaction.id,
          type,
          amount: parsedAmount,
          // Estamos usando null aqui porque esta é uma função interna que lida 
          // corretamente com valores nulos
          fromAccountId: fromAccountId || null,
          toAccountId: toAccountId || null
        });
      }

      return transaction;
    });
  }

  /**
   * Valida os dados da transação conforme seu tipo
   * @private
   */
  private static validateTransactionData(
    type: TransactionType,
    fromAccountId?: number | null,
    toAccountId?: number | null
  ): void {
    if (type === 'INCOME' && !toAccountId) {
      throw new Error('Receitas requerem conta de destino');
    }
    if (type === 'EXPENSE' && !fromAccountId) {
      throw new Error('Despesas requerem conta de origem');
    }
    if (type === 'TRANSFER') {
      if (!fromAccountId) {
        throw new Error('Transferências requerem conta de origem');
      }
      if (!toAccountId) {
        throw new Error('Transferências requerem conta de destino');
      }
      if (fromAccountId === toAccountId) {
        throw new Error('Conta de origem e destino devem ser diferentes');
      }
    }
  }

  /**
   * Atualiza uma transação financeira
   */
  static async updateTransaction(
    id: number,
    data: Partial<{
      description: string;
      amount: number | string;
      date: Date;
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
    return prisma.$transaction(async (tx) => {
      // 1. Busca a transação original
      const original = await tx.financialTransaction.findUnique({
        where: { id },
        include: {
          tags: true
        }
      });

      if (!original) {
        throw new Error(`Transação ID ${id} não encontrada`);
      }

      // 2. Se o status mudar de/para COMPLETED, precisamos ajustar saldos
      const oldStatus = original.status;
      const newStatus = data.status || oldStatus;

      // 3. Se estava COMPLETED antes, reverte os saldos
      if (oldStatus === 'COMPLETED') {
        await this.reverseAccountBalances(tx, {
          id,
          type: original.type,
          amount: original.amount,
          fromAccountId: original.fromAccountId,
          toAccountId: original.toAccountId
        });
      }

      // 4. Preparar dados de atualização
      const updateData: Prisma.FinancialTransactionUpdateInput = {};
      
      // Campos escalares
      if (data.description !== undefined) updateData.description = data.description;
      if (data.amount !== undefined) updateData.amount = parseDecimal(data.amount);
      if (data.date !== undefined) updateData.date = data.date;
      if (data.type !== undefined) updateData.type = data.type;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.notes !== undefined) updateData.notes = data.notes;

      // 5. Atualiza as relações
      if (data.fromAccountId !== undefined) {
        updateData.fromAccount = data.fromAccountId 
          ? { connect: { id: data.fromAccountId } } 
          : { disconnect: true };
      }
      
      if (data.toAccountId !== undefined) {
        updateData.toAccount = data.toAccountId 
          ? { connect: { id: data.toAccountId } } 
          : { disconnect: true };
      }
      
      if (data.categoryId !== undefined) {
        updateData.category = data.categoryId 
          ? { connect: { id: data.categoryId } } 
          : { disconnect: true };
      }

      // 6. Atualiza tags se fornecidas
      if (data.tags) {
        // Desconecta todas as tags existentes
        await tx.financialTransaction.update({
          where: { id },
          data: {
            tags: {
              disconnect: original.tags.map(tag => ({ id: tag.id }))
            }
          }
        });

        // Adiciona as novas tags
        if (data.tags.length > 0) {
          updateData.tags = {
            connectOrCreate: data.tags.map(tagName => ({
              where: { name_companyId: { name: tagName, companyId } },
              create: { name: tagName, company: { connect: { id: companyId } } }
            }))
          };
        }
      }

      // 7. Atualiza a transação
      const updated = await tx.financialTransaction.update({
        where: { id },
        data: updateData
      });

      // 8. Se o novo status for COMPLETED, aplica os ajustes de saldo
      if (newStatus === 'COMPLETED') {
        await this.updateAccountBalances(tx, {
          id: updated.id,
          type: updated.type,
          amount: updated.amount,
          fromAccountId: updated.fromAccountId,
          toAccountId: updated.toAccountId
        });
      }

      return updated;
    });
  }

  /**
   * Exclui uma transação financeira
   */
  static async deleteTransaction(id: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.financialTransaction.findUnique({
        where: { id }
      });

      if (!transaction) {
        throw new Error(`Transação ID ${id} não encontrada`);
      }

      // Se a transação estava concluída, reverter saldos
      if (transaction.status === 'COMPLETED') {
        await this.reverseAccountBalances(tx, {
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          fromAccountId: transaction.fromAccountId,
          toAccountId: transaction.toAccountId
        });
      }

      // Remover todas as relações de tags
      await tx.financialTransaction.update({
        where: { id },
        data: {
          tags: {
            set: [] // Remove todas as relações de tag
          }
        }
      });

      // Excluir a transação
      await tx.financialTransaction.delete({
        where: { id }
      });
    });
  }

  /**
   * Atualiza o status de uma transação
   */
  static async updateTransactionStatus(
    id: number, 
    status: TransactionStatus
  ): Promise<FinancialTransaction> {
    return this.updateTransaction(id, { status }, 0); // companyId não importa aqui pois só estamos atualizando status
  }

  /**
   * Atualiza saldos das contas com base na transação
   * @private
   */
  private static async updateAccountBalances(
    tx: Prisma.TransactionClient,
    data: {
      id: number;
      type: TransactionType;
      amount: any; // Aceita string, number ou Decimal
      fromAccountId: number | null;
      toAccountId: number | null;
    }
  ): Promise<void> {
    const { type, amount, fromAccountId, toAccountId } = data;
    const amountNumber = Number(amount);

    if (type === 'INCOME' && toAccountId) {
      // Receita: incrementa conta de destino
      await tx.financialAccount.update({
        where: { id: toAccountId },
        data: { balance: { increment: amountNumber } }
      });
    } 
    else if (type === 'EXPENSE' && fromAccountId) {
      // Despesa: decrementa conta de origem
      await tx.financialAccount.update({
        where: { id: fromAccountId },
        data: { balance: { decrement: amountNumber } }
      });
    } 
    else if (type === 'TRANSFER' && fromAccountId && toAccountId) {
      // Transferência: decrementa origem e incrementa destino
      await tx.financialAccount.update({
        where: { id: fromAccountId },
        data: { balance: { decrement: amountNumber } }
      });
      
      await tx.financialAccount.update({
        where: { id: toAccountId },
        data: { balance: { increment: amountNumber } }
      });
    }
  }

  /**
   * Reverte alterações de saldo (usado em atualizações e exclusões)
   * @private
   */
  private static async reverseAccountBalances(
    tx: Prisma.TransactionClient,
    data: {
      id: number;
      type: TransactionType;
      amount: any; // Aceita string, number ou Decimal
      fromAccountId: number | null;
      toAccountId: number | null;
    }
  ): Promise<void> {
    const { type, amount, fromAccountId, toAccountId } = data;
    const amountNumber = Number(amount);

    if (type === 'INCOME' && toAccountId) {
      // Reverter receita: diminui da conta de destino
      await tx.financialAccount.update({
        where: { id: toAccountId },
        data: { balance: { decrement: amountNumber } }
      });
    } 
    else if (type === 'EXPENSE' && fromAccountId) {
      // Reverter despesa: aumenta conta de origem
      await tx.financialAccount.update({
        where: { id: fromAccountId },
        data: { balance: { increment: amountNumber } }
      });
    } 
    else if (type === 'TRANSFER' && fromAccountId && toAccountId) {
      // Reverter transferência: aumenta origem e diminui destino
      await tx.financialAccount.update({
        where: { id: fromAccountId },
        data: { balance: { increment: amountNumber } }
      });
      
      await tx.financialAccount.update({
        where: { id: toAccountId },
        data: { balance: { decrement: amountNumber } }
      });
    }
  }

  /**
   * Lista transações com filtros avançados e paginação
   */
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
      pageSize = 20
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
      })
    };

    // Buscar dados paginados e total em paralelo
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

  /**
   * Busca uma transação específica por ID
   */
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

  /**
   * Obtém o resumo financeiro para um período
   */
  static async getFinancialSummary(
    companyId: number,
    startDate: Date,
    endDate: Date
  ): Promise<{
    income: number;
    expense: number;
    balance: number;
    accounts: { id: number; name: string; balance: any; type: string }[];
    topCategories: { id: number; name: string; amount: number; color: string }[];
  }> {
    const accounts = await prisma.financialAccount.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, balance: true, type: true }
    });

    // Busca receitas e despesas do período
    const incomeAggregate = await prisma.financialTransaction.aggregate({
      where: {
        companyId,
        type: 'INCOME',
        status: 'COMPLETED',
        date: { gte: startDate, lte: endDate }
      },
      _sum: { amount: true }
    });

    const expenseAggregate = await prisma.financialTransaction.aggregate({
      where: {
        companyId,
        type: 'EXPENSE',
        status: 'COMPLETED',
        date: { gte: startDate, lte: endDate }
      },
      _sum: { amount: true }
    });

    // Busca top categorias de despesa
    const topExpenseCategories = await prisma.financialTransaction.groupBy({
      by: ['categoryId'],
      where: {
        companyId,
        type: 'EXPENSE',
        status: 'COMPLETED',
        date: { gte: startDate, lte: endDate },
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

    const income = Number(incomeAggregate._sum.amount || 0);
    const expense = Number(expenseAggregate._sum.amount || 0);
    const balance = income - expense;

    return {
      income,
      expense,
      balance,
      accounts,
      topCategories
    };
  }
}