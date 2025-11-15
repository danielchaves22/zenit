// backend/src/services/excel-generator.service.ts
import { logger } from '../utils/logger';
import { formatInstallmentDescription } from '../utils/installments';

interface ExcelOptions {
  title: string;
  subtitle?: string;
  companyName?: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  data: any[];
  totals?: {
    income: number;
    expense: number;
    balance: number;
  };
  groupBy: string;
}

export default class ExcelGeneratorService {
  
  /**
   * Gera arquivo Excel para relatório de movimentação de contas financeiras
   */
  static async generateFinancialAccountMovementExcel(options: ExcelOptions): Promise<Buffer> {
    const { title, data, groupBy } = options;
    
    logger.info('Generating Excel report', {
      title,
      dataCount: data.length,
      groupBy
    });

    // Em um ambiente real, você usaria bibliotecas como:
    // - exceljs (mais robusta)
    // - xlsx (mais leve)
    // - node-xlsx (simples)
    
    const csvContent = this.generateAdvancedCSV(options);
    
    // Por enquanto, retornamos CSV que pode ser aberto no Excel
    // Em produção, você geraria um arquivo .xlsx real
    return Buffer.from(csvContent, 'utf-8');
  }

  /**
   * Gera CSV avançado com formatação adequada para Excel
   */
  private static generateAdvancedCSV(options: ExcelOptions): string {
    const { title, subtitle, companyName, period, data, totals, groupBy } = options;
    
    const formatDate = (date: Date) => date.toLocaleDateString('pt-BR');
    const formatCurrency = (value: number) => value.toFixed(2).replace('.', ',');
    
    const groupByLabel = {
      day: 'Por Dia',
      week: 'Por Semana', 
      month: 'Por Mês'
    }[groupBy] || 'Por Período';

    let csv = '';

    // Cabeçalho do relatório
    csv += `"${title}"\n`;
    if (subtitle) csv += `"${subtitle}"\n`;
    if (companyName) csv += `"Empresa: ${companyName}"\n`;
    csv += `"Período: ${formatDate(period.startDate)} a ${formatDate(period.endDate)}"\n`;
    csv += `"Agrupamento: ${groupByLabel}"\n`;
    csv += `"Gerado em: ${new Date().toLocaleString('pt-BR')}"\n`;
    csv += '\n';

    // Resumo executivo
    if (totals) {
      csv += '"RESUMO EXECUTIVO"\n';
      csv += '"Métrica","Valor"\n';
      csv += `"Total de Entradas","R$ ${formatCurrency(totals.income)}"\n`;
      csv += `"Total de Saídas","R$ ${formatCurrency(totals.expense)}"\n`;
      csv += `"Saldo do Período","R$ ${formatCurrency(totals.balance)}"\n`;
      csv += `"Total de Períodos","${data.length}"\n`;
      csv += `"Total de Transações","${data.reduce((sum, period) => sum + period.transactions.length, 0)}"\n`;
      csv += '\n';
    }

    // Dados por período - Planilha 1: Resumo
    csv += '"RESUMO POR PERÍODO"\n';
    csv += '"Período","Data/Intervalo","Entradas","Saídas","Saldo","Transações"\n';
    
    for (const period of data) {
      csv += `"${period.period}","${period.periodLabel}","${formatCurrency(period.income)}","${formatCurrency(period.expense)}","${formatCurrency(period.balance)}","${period.transactions.length}"\n`;
    }
    csv += '\n';

    // Dados detalhados - Planilha 2: Transações
    csv += '"TRANSAÇÕES DETALHADAS"\n';
    csv += '"Período","Data Transação","Tipo","Descrição","Conta","Categoria","Valor","ID Transação"\n';
    
    for (const period of data) {
      for (const transaction of period.transactions) {
        const type = transaction.type === 'INCOME' ? 'ENTRADA' : 'SAÍDA';
        const category = transaction.category?.name || 'Sem categoria';
        const transactionDate = new Date(transaction.date).toLocaleDateString('pt-BR');
        const description = formatInstallmentDescription(
          transaction.description,
          transaction.installmentNumber,
          transaction.totalInstallments
        );

        csv += `"${period.periodLabel}","${transactionDate}","${type}","${description}","${transaction.financialAccount.name}","${category}","${formatCurrency(transaction.amount)}","${transaction.id}"\n`;
      }
    }
    csv += '\n';

    // Análise adicional - Planilha 3: Por Conta
    csv += '"ANÁLISE POR CONTA FINANCEIRA"\n';
    csv += '"Conta","Total Entradas","Total Saídas","Saldo Líquido","Transações"\n';
    
    const accountAnalysis = this.analyzeByAccount(data);
    for (const [accountName, analysis] of Object.entries(accountAnalysis)) {
      csv += `"${accountName}","${formatCurrency(analysis.income)}","${formatCurrency(analysis.expense)}","${formatCurrency(analysis.balance)}","${analysis.transactionCount}"\n`;
    }
    csv += '\n';

    // Análise adicional - Planilha 4: Por Categoria
    csv += '"ANÁLISE POR CATEGORIA"\n';
    csv += '"Categoria","Tipo","Total","Transações","Participação %"\n';
    
    const categoryAnalysis = this.analyzeByCategory(data, totals);
    for (const [categoryName, analysis] of Object.entries(categoryAnalysis)) {
      const participation = totals && analysis.type === 'EXPENSE' 
        ? (analysis.total / totals.expense * 100).toFixed(1)
        : totals && analysis.type === 'INCOME'
        ? (analysis.total / totals.income * 100).toFixed(1)
        : '0';
      
      csv += `"${categoryName}","${analysis.type}","${formatCurrency(analysis.total)}","${analysis.transactionCount}","${participation}%"\n`;
    }

    return csv;
  }

  /**
   * Analisa dados agrupados por conta financeira
   */
  private static analyzeByAccount(data: any[]): Record<string, any> {
    const analysis: Record<string, any> = {};

    for (const period of data) {
      for (const transaction of period.transactions) {
        const accountName = transaction.financialAccount.name;
        
        if (!analysis[accountName]) {
          analysis[accountName] = {
            income: 0,
            expense: 0,
            balance: 0,
            transactionCount: 0
          };
        }

        if (transaction.type === 'INCOME') {
          analysis[accountName].income += transaction.amount;
        } else {
          analysis[accountName].expense += transaction.amount;
        }
        
        analysis[accountName].balance = analysis[accountName].income - analysis[accountName].expense;
        analysis[accountName].transactionCount++;
      }
    }

    return analysis;
  }

  /**
   * Analisa dados agrupados por categoria
   */
  private static analyzeByCategory(data: any[], totals?: any): Record<string, any> {
    const analysis: Record<string, any> = {};

    for (const period of data) {
      for (const transaction of period.transactions) {
        const categoryName = transaction.category?.name || 'Sem categoria';
        
        if (!analysis[categoryName]) {
          analysis[categoryName] = {
            total: 0,
            type: transaction.type,
            transactionCount: 0
          };
        }

        analysis[categoryName].total += transaction.amount;
        analysis[categoryName].transactionCount++;
      }
    }

    return analysis;
  }

  /**
   * Gera arquivo Excel usando formato binário (futuro)
   */
  static async generateBinaryExcel(options: ExcelOptions): Promise<Buffer> {
    // Implementação futura usando exceljs ou similar
    // 
    // const workbook = new ExcelJS.Workbook();
    // 
    // // Planilha 1: Resumo
    // const summarySheet = workbook.addWorksheet('Resumo');
    // 
    // // Planilha 2: Transações Detalhadas  
    // const detailSheet = workbook.addWorksheet('Transações');
    // 
    // // Planilha 3: Análise por Conta
    // const accountSheet = workbook.addWorksheet('Por Conta');
    // 
    // // Planilha 4: Análise por Categoria
    // const categorySheet = workbook.addWorksheet('Por Categoria');
    // 
    // return await workbook.xlsx.writeBuffer();
    
    logger.info('Binary Excel generation not implemented yet, using CSV fallback');
    return this.generateFinancialAccountMovementExcel(options);
  }

  /**
   * Gera template Excel para importação de dados
   */
  static async generateImportTemplate(): Promise<Buffer> {
    let csv = `"TEMPLATE DE IMPORTAÇÃO - TRANSAÇÕES FINANCEIRAS"\n`;
    csv += `"Preencha os dados conforme o exemplo abaixo"\n`;
    csv += `\n`;
    csv += `"Data","Descrição","Valor","Tipo","Conta","Categoria","Observações"\n`;
    csv += `"01/01/2024","Exemplo de receita","1000.00","INCOME","Conta Principal","Vendas","Observação opcional"\n`;
    csv += `"01/01/2024","Exemplo de despesa","500.00","EXPENSE","Conta Principal","Despesas Gerais","Observação opcional"\n`;
    csv += `\n`;
    csv += `"INSTRUÇÕES:"\n`;
    csv += `"- Data: formato DD/MM/AAAA"\n`;
    csv += `"- Valor: usar ponto como separador decimal"\n`;
    csv += `"- Tipo: INCOME (receita) ou EXPENSE (despesa)"\n`;
    csv += `"- Conta: nome exato da conta cadastrada"\n`;
    csv += `"- Categoria: nome exato da categoria cadastrada"\n`;
    
    return Buffer.from(csv, 'utf-8');
  }
}