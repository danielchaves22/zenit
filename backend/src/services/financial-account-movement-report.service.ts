// backend/src/services/financial-account-movement-report.service.ts
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import PDFGeneratorService from './pdf-generator.service';
import ExcelGeneratorService from './excel-generator.service';

const prisma = new PrismaClient();

interface ReportFilters {
  companyId: number;
  startDate: Date;
  endDate: Date;
  financialAccountIds: number[];
  groupBy: 'day' | 'week' | 'month';
}

interface Transaction {
  id: number;
  description: string;
  amount: number;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  financialAccount: {
    id: number;
    name: string;
  };
  category?: {
    id: number;
    name: string;
    color: string;
  };
  installmentNumber?: number | null;
  totalInstallments?: number | null;
}

interface PeriodData {
  period: string;
  periodLabel: string;
  income: number;
  expense: number;
  balance: number;
  transactions: Transaction[];
}

interface ExportData {
  companyId: number;
  startDate: Date;
  endDate: Date;
  financialAccountIds: number[];
  groupBy: string;
  data: PeriodData[];
}

export default class FinancialAccountMovementReportService {

  /**
   * Gera relatório de movimentação de contas financeiras agrupado por período
   */
  static async generateReport(filters: ReportFilters): Promise<PeriodData[]> {
    const { companyId, startDate, endDate, financialAccountIds, groupBy } = filters;

    logger.info('Generating financial account movement report', {
      companyId,
      startDate,
      endDate,
      accountCount: financialAccountIds.length,
      groupBy
    });

    // Verificar se as contas pertencem à empresa
    const accountsCount = await prisma.financialAccount.count({
      where: {
        id: { in: financialAccountIds },
        companyId
      }
    });

    if (accountsCount !== financialAccountIds.length) {
      throw new Error('Uma ou mais contas financeiras não pertencem à empresa');
    }

    // Buscar todas as transações do período para as contas selecionadas
    const transactions = await prisma.financialTransaction.findMany({
      where: {
        companyId,
        date: {
          gte: startDate,
          lte: endDate
        },
        status: 'COMPLETED',
        OR: [
          { fromAccountId: { in: financialAccountIds } },
          { toAccountId: { in: financialAccountIds } }
        ]
      },
      include: {
        fromAccount: { select: { id: true, name: true } },
        toAccount: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } }
      },
      orderBy: { date: 'asc' }
    });

    // Processar transações para o formato correto
    const processedTransactions = this.processTransactions(transactions, financialAccountIds);

    // Agrupar por período
    const groupedData = this.groupTransactionsByPeriod(processedTransactions, groupBy);

    logger.info('Financial account movement report generated successfully', {
      companyId,
      totalTransactions: processedTransactions.length,
      periods: groupedData.length
    });

    return groupedData;
  }

  /**
   * Processa transações para extrair movimentação das contas selecionadas
   */
  private static processTransactions(transactions: any[], financialAccountIds: number[]): Transaction[] {
    const processed: Transaction[] = [];

    for (const txn of transactions) {
      // Para INCOME: se toAccount está nas contas selecionadas, é entrada
      if (txn.type === 'INCOME' && txn.toAccountId && financialAccountIds.includes(txn.toAccountId)) {
        processed.push({
          id: txn.id,
          description: txn.description,
          amount: Number(txn.amount),
          date: txn.date.toISOString(),
          type: 'INCOME',
          financialAccount: txn.toAccount,
          category: txn.category,
          installmentNumber: txn.installmentNumber,
          totalInstallments: txn.totalInstallments
        });
      }

      // Para EXPENSE: se fromAccount está nas contas selecionadas, é saída
      if (txn.type === 'EXPENSE' && txn.fromAccountId && financialAccountIds.includes(txn.fromAccountId)) {
        processed.push({
          id: txn.id,
          description: txn.description,
          amount: Number(txn.amount),
          date: txn.date.toISOString(),
          type: 'EXPENSE',
          financialAccount: txn.fromAccount,
          category: txn.category,
          installmentNumber: txn.installmentNumber,
          totalInstallments: txn.totalInstallments
        });
      }

      // Para TRANSFER: duas entradas se ambas as contas estão selecionadas
      if (txn.type === 'TRANSFER') {
        // Saída da conta origem
        if (txn.fromAccountId && financialAccountIds.includes(txn.fromAccountId)) {
          processed.push({
            id: txn.id,
            description: `${txn.description} (Saída)`,
            amount: Number(txn.amount),
            date: txn.date.toISOString(),
            type: 'EXPENSE',
            financialAccount: txn.fromAccount,
            category: txn.category,
            installmentNumber: txn.installmentNumber,
            totalInstallments: txn.totalInstallments
          });
        }

        // Entrada na conta destino
        if (txn.toAccountId && financialAccountIds.includes(txn.toAccountId)) {
          processed.push({
            id: txn.id + 1000000, // ID único para a entrada
            description: `${txn.description} (Entrada)`,
            amount: Number(txn.amount),
            date: txn.date.toISOString(),
            type: 'INCOME',
            financialAccount: txn.toAccount,
            category: txn.category,
            installmentNumber: txn.installmentNumber,
            totalInstallments: txn.totalInstallments
          });
        }
      }
    }

    return processed;
  }

  /**
   * Agrupa transações por período para exibição visual (não soma)
   */
  private static groupTransactionsByPeriod(transactions: Transaction[], groupBy: 'day' | 'week' | 'month'): PeriodData[] {
    const grouped = new Map<string, Transaction[]>();

    // Agrupar transações por período
    for (const transaction of transactions) {
      const date = new Date(transaction.date);
      let periodKey: string;

      switch (groupBy) {
        case 'day':
          periodKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
          break;
        
        case 'week':
          const weekStart = this.getWeekStart(date);
          periodKey = weekStart.toISOString().split('T')[0];
          break;
        
        case 'month':
          periodKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
          break;
      }

      if (!grouped.has(periodKey)) {
        grouped.set(periodKey, []);
      }
      grouped.get(periodKey)!.push(transaction);
    }

    // Converter para array com subtotais por período
    const result: PeriodData[] = [];
    
    for (const [period, periodTransactions] of grouped.entries()) {
      // Calcular subtotais do período
      const income = periodTransactions
        .filter(t => t.type === 'INCOME')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const expense = periodTransactions
        .filter(t => t.type === 'EXPENSE')
        .reduce((sum, t) => sum + t.amount, 0);

      const balance = income - expense;

      // Gerar label do período
      const firstTransaction = periodTransactions[0];
      const date = new Date(firstTransaction.date);
      let periodLabel: string;

      switch (groupBy) {
        case 'day':
          periodLabel = date.toLocaleDateString('pt-BR');
          break;
        case 'week':
          const weekStart = this.getWeekStart(date);
          const weekEnd = this.getWeekEnd(date);
          periodLabel = `Semana de ${weekStart.toLocaleDateString('pt-BR')} a ${weekEnd.toLocaleDateString('pt-BR')}`;
          break;
        case 'month':
          periodLabel = date.toLocaleDateString('pt-BR', { year: 'numeric', month: 'long' });
          break;
      }

      result.push({
        period,
        periodLabel,
        income, // Subtotal do período
        expense, // Subtotal do período  
        balance, // Subtotal do período
        transactions: periodTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      });
    }

    // Ordenar por período
    result.sort((a, b) => a.period.localeCompare(b.period));

    return result;
  }

  /**
   * Obtém o início da semana (domingo)
   */
  private static getWeekStart(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day;
    result.setDate(diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  /**
   * Obtém o fim da semana (sábado)
   */
  private static getWeekEnd(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = result.getDate() - day + 6;
    result.setDate(diff);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  /**
   * Gera PDF do relatório usando serviço especializado
   */
  static async generatePDF(data: ExportData): Promise<Buffer> {
    logger.info('Generating PDF report', {
      companyId: data.companyId,
      periodsCount: data.data.length
    });

    // Buscar nome da empresa
    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
      select: { name: true }
    });

    // Calcular totais
    const totals = data.data.reduce(
      (acc, period) => ({
        income: acc.income + period.income,
        expense: acc.expense + period.expense,
        balance: acc.balance + period.balance
      }),
      { income: 0, expense: 0, balance: 0 }
    );

    return await PDFGeneratorService.generateFinancialAccountMovementPDF({
      title: 'Relatório de Movimentação de Contas Financeiras',
      subtitle: 'Análise detalhada por período',
      companyName: company?.name,
      period: {
        startDate: data.startDate,
        endDate: data.endDate
      },
      data: data.data,
      totals,
      groupBy: data.groupBy
    });
  }

  /**
   * Gera Excel do relatório usando serviço especializado
   */
  static async generateExcel(data: ExportData): Promise<Buffer> {
    logger.info('Generating Excel report', {
      companyId: data.companyId,
      periodsCount: data.data.length
    });

    // Buscar nome da empresa
    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
      select: { name: true }
    });

    // Calcular totais
    const totals = data.data.reduce(
      (acc, period) => ({
        income: acc.income + period.income,
        expense: acc.expense + period.expense,
        balance: acc.balance + period.balance
      }),
      { income: 0, expense: 0, balance: 0 }
    );

    return await ExcelGeneratorService.generateFinancialAccountMovementExcel({
      title: 'Relatório de Movimentação de Contas Financeiras',
      subtitle: 'Análise detalhada por período',
      companyName: company?.name,
      period: {
        startDate: data.startDate,
        endDate: data.endDate
      },
      data: data.data,
      totals,
      groupBy: data.groupBy
    });
  }
}