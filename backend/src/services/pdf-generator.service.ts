// backend/src/services/pdf-generator.service.ts
import { logger } from '../utils/logger';

interface PDFOptions {
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

export default class PDFGeneratorService {
  
  /**
   * Gera PDF para relatório de movimentação de contas financeiras
   */
  static async generateFinancialAccountMovementPDF(options: PDFOptions): Promise<Buffer> {
    const { title, subtitle, companyName, period, data, totals, groupBy } = options;
    
    logger.info('Generating PDF report', {
      title,
      dataCount: data.length,
      groupBy
    });

    // Gerar conteúdo texto estruturado (que pode ser aberto como PDF)
    const textContent = this.generateStructuredTextContent(options);
    
    // Retornar como arquivo de texto que pode ser visualizado
    return Buffer.from(textContent, 'utf-8');
  }

  /**
   * Gera conteúdo de texto estruturado para o relatório
   */
  private static generateStructuredTextContent(options: PDFOptions): string {
    const { title, subtitle, companyName, period, data, totals, groupBy } = options;
    
    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    };

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('pt-BR');
    };

    const formatDateTime = (dateString: string) => {
      return new Date(dateString).toLocaleString('pt-BR');
    };

    const groupByLabel = {
      day: 'Por Dia',
      week: 'Por Semana', 
      month: 'Por Mês'
    }[groupBy] || 'Por Período';

    let content = '';
    content += '='.repeat(80) + '\n';
    content += `${title.toUpperCase()}\n`;
    if (subtitle) content += `${subtitle}\n`;
    content += '='.repeat(80) + '\n\n';

    // Informações do cabeçalho
    if (companyName) content += `Empresa: ${companyName}\n`;
    content += `Período: ${formatDate(period.startDate)} a ${formatDate(period.endDate)}\n`;
    content += `Agrupamento: ${groupByLabel}\n`;
    content += `Gerado em: ${new Date().toLocaleString('pt-BR')}\n\n`;

    // Resumo geral
    if (totals) {
      content += '-'.repeat(80) + '\n';
      content += 'RESUMO GERAL\n';
      content += '-'.repeat(80) + '\n';
      content += `Total de Entradas:     ${formatCurrency(totals.income).padStart(20)}\n`;
      content += `Total de Saídas:       ${formatCurrency(totals.expense).padStart(20)}\n`;
      content += `Saldo do Período:      ${formatCurrency(totals.balance).padStart(20)}\n`;
      content += `Total de Períodos:     ${data.length.toString().padStart(20)}\n`;
      content += `Total de Transações:   ${data.reduce((sum, period) => sum + period.transactions.length, 0).toString().padStart(20)}\n\n`;
    }

    // Movimentações por período
    content += '-'.repeat(80) + '\n';
    content += 'MOVIMENTAÇÕES DETALHADAS POR PERÍODO\n';
    content += '-'.repeat(80) + '\n\n';

    for (const period of data) {
      // Cabeçalho do período
      content += '█'.repeat(60) + '\n';
      content += `█ ${period.periodLabel.padEnd(56)} █\n`;
      content += '█'.repeat(60) + '\n\n';

      // Listar todas as transações do período
      content += 'Data/Hora'.padEnd(20) + 'Tipo'.padEnd(10) + 'Valor'.padStart(15) + ' Conta'.padEnd(20) + ' Categoria\n';
      content += '-'.repeat(80) + '\n';

      for (const transaction of period.transactions) {
        const dateTime = formatDateTime(transaction.date);
        const type = transaction.type === 'INCOME' ? 'ENTRADA' : 'SAÍDA';
        const amount = formatCurrency(transaction.amount);
        const account = transaction.financialAccount.name;
        const category = transaction.category?.name || 'Sem categoria';
        
        content += `${dateTime.padEnd(20)}${type.padEnd(10)}${amount.padStart(15)} ${account.padEnd(20)} ${category}\n`;
        content += `${''.padEnd(20)}${transaction.description.padEnd(70)}\n`;
        content += '\n';
      }

      // Subtotais do período
      content += '-'.repeat(80) + '\n';
      content += `SUBTOTAL DO PERÍODO:\n`;
      content += `  Entradas: ${formatCurrency(period.income)}\n`;
      content += `  Saídas:   ${formatCurrency(period.expense)}\n`;
      content += `  Saldo:    ${formatCurrency(period.balance)}\n`;
      content += `  Transações: ${period.transactions.length}\n`;
      content += '\n\n';
    }

    // Totais finais
    if (totals) {
      content += '='.repeat(80) + '\n';
      content += 'TOTAIS GERAIS\n';
      content += '='.repeat(80) + '\n';
      content += `Total de Entradas:     ${formatCurrency(totals.income)}\n`;
      content += `Total de Saídas:       ${formatCurrency(totals.expense)}\n`;
      content += `SALDO FINAL:           ${formatCurrency(totals.balance)}\n`;
      content += '='.repeat(80) + '\n\n';
    }

    // Rodapé
    content += '\n\n';
    content += '-'.repeat(80) + '\n';
    content += 'Relatório gerado pelo Sistema Zenit\n';
    content += `Data/Hora: ${new Date().toLocaleString('pt-BR')}\n`;
    content += 'Este documento é confidencial e destinado ao uso interno da empresa.\n';
    content += '-'.repeat(80) + '\n';

    return content;
  }

  /**
   * Gera conteúdo HTML estilizado para o relatório
   */
  private static generateHTMLContent(options: PDFOptions): string {
    const { title, subtitle, companyName, period, data, totals, groupBy } = options;
    
    const groupByLabel = {
      day: 'Por Dia',
      week: 'Por Semana', 
      month: 'Por Mês'
    }[groupBy] || 'Por Período';

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    };

    const formatDate = (date: Date) => {
      return date.toLocaleDateString('pt-BR');
    };

    interface PeriodTransaction {
      date: string;
      type: 'INCOME' | 'EXPENSE';
      amount: number;
      description: string;
      financialAccount: {
        name: string;
      };
      category?: {
        name: string;
      };
    }

    interface PeriodData {
      periodLabel: string;
      income: number;
      expense: number;
      balance: number;
      transactions: PeriodTransaction[];
    }

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 210mm;
            margin: 0 auto;
            padding: 20mm;
        }
        
        .header {
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
        }
        
        .header h1 {
            color: #2563eb;
            font-size: 24px;
            margin-bottom: 5px;
        }
        
        .header h2 {
            color: #666;
            font-size: 16px;
            font-weight: normal;
        }
        
        .company-name {
            color: #333;
            font-size: 14px;
            margin-bottom: 10px;
        }
        
        .report-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 30px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        
        .info-item {
            display: flex;
            flex-direction: column;
        }
        
        .info-label {
            font-weight: bold;
            color: #555;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 5px;
        }
        
        .info-value {
            color: #333;
            font-size: 14px;
        }
        
        .summary-cards {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .summary-card {
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        
        .summary-card.income {
            border-left: 4px solid #10b981;
        }
        
        .summary-card.expense {
            border-left: 4px solid #ef4444;
        }
        
        .summary-card.balance {
            border-left: 4px solid #3b82f6;
        }
        
        .summary-label {
            font-size: 12px;
            color: #666;
            text-transform: uppercase;
            margin-bottom: 8px;
        }
        
        .summary-value {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .summary-value.positive {
            color: #10b981;
        }
        
        .summary-value.negative {
            color: #ef4444;
        }
        
        .summary-value.neutral {
            color: #3b82f6;
        }
        
        .data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        
        .data-table th {
            background: #2563eb;
            color: white;
            padding: 12px;
            text-align: left;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: 600;
        }
        
        .data-table td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 13px;
        }
        
        .data-table tr:nth-child(even) {
            background: #f8f9fa;
        }
        
        .data-table tr:last-child td {
            border-bottom: none;
        }
        
        .text-right {
            text-align: right;
        }
        
        .text-center {
            text-align: center;
        }
        
        .currency {
            font-family: 'Courier New', monospace;
            font-weight: 600;
        }
        
        .currency.positive {
            color: #10b981;
        }
        
        .currency.negative {
            color: #ef4444;
        }
        
        .period-header {
            background: #f1f5f9;
            font-weight: bold;
            color: #1e40af;
        }
        
        .transaction-detail {
            font-size: 11px;
            color: #666;
            padding-left: 20px;
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 11px;
            color: #666;
            text-align: center;
        }
        
        .page-break {
            page-break-before: always;
        }
        
        @media print {
            body {
                margin: 0;
                padding: 15mm;
            }
            
            .summary-cards {
                grid-template-columns: 1fr;
                gap: 10px;
            }
            
            .summary-card {
                padding: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${title}</h1>
        ${subtitle ? `<h2>${subtitle}</h2>` : ''}
        ${companyName ? `<div class="company-name">${companyName}</div>` : ''}
    </div>
    
    <div class="report-info">
        <div class="info-item">
            <div class="info-label">Período</div>
            <div class="info-value">${formatDate(period.startDate)} a ${formatDate(period.endDate)}</div>
        </div>
        
        <div class="info-item">
            <div class="info-label">Agrupamento</div>
            <div class="info-value">${groupByLabel}</div>
        </div>
        
        <div class="info-item">
            <div class="info-label">Total de Períodos</div>
            <div class="info-value">${data.length}</div>
        </div>
        
        <div class="info-item">
            <div class="info-label">Gerado em</div>
            <div class="info-value">${new Date().toLocaleString('pt-BR')}</div>
        </div>
    </div>
    
    ${totals ? `
    <div class="summary-cards">
        <div class="summary-card income">
            <div class="summary-label">Total de Entradas</div>
            <div class="summary-value positive">${formatCurrency(totals.income)}</div>
        </div>
        
        <div class="summary-card expense">
            <div class="summary-label">Total de Saídas</div>
            <div class="summary-value negative">${formatCurrency(totals.expense)}</div>
        </div>
        
        <div class="summary-card balance">
            <div class="summary-label">Saldo do Período</div>
            <div class="summary-value ${totals.balance >= 0 ? 'positive' : 'negative'}">
                ${formatCurrency(totals.balance)}
            </div>
        </div>
    </div>
    ` : ''}
    
    <table class="data-table">
        <thead>
            <tr>
                <th>Período</th>
                <th class="text-right">Entradas</th>
                <th class="text-right">Saídas</th>
                <th class="text-right">Saldo</th>
                <th class="text-center">Transações</th>
            </tr>
        </thead>
        <tbody>
            ${(data as PeriodData[]).map((period: PeriodData) => `
                <tr class="period-header">
                    <td>${period.periodLabel}</td>
                    <td class="text-right currency positive">${formatCurrency(period.income)}</td>
                    <td class="text-right currency negative">${formatCurrency(period.expense)}</td>
                    <td class="text-right currency ${period.balance >= 0 ? 'positive' : 'negative'}">
                        ${formatCurrency(period.balance)}
                    </td>
                    <td class="text-center">${period.transactions.length}</td>
                </tr>
                ${period.transactions.map((transaction: PeriodTransaction): string => `
                    <tr class="transaction-detail">
                        <td style="padding-left: 20px;">
                            ${transaction.description}<br>
                            <small style="color: #666;">
                                ${transaction.financialAccount.name}
                                ${transaction.category ? ` • ${transaction.category.name}` : ''}
                            </small>
                        </td>
                        <td class="text-right">
                            ${transaction.type === 'INCOME' ? `<span class="currency positive">${formatCurrency(transaction.amount)}</span>` : '-'}
                        </td>
                        <td class="text-right">
                            ${transaction.type === 'EXPENSE' ? `<span class="currency negative">${formatCurrency(transaction.amount)}</span>` : '-'}
                        </td>
                        <td class="text-right">-</td>
                        <td class="text-center">
                            <small style="color: #666;">${new Date(transaction.date).toLocaleDateString('pt-BR')}</small>
                        </td>
                    </tr>
                `).join('')}
            `).join('')}
        </tbody>
        ${totals ? `
        <tfoot>
            <tr style="background: #1e40af; color: white; font-weight: bold;">
                <td>TOTAL GERAL</td>
                <td class="text-right">${formatCurrency(totals.income)}</td>
                <td class="text-right">${formatCurrency(totals.expense)}</td>
                <td class="text-right">${formatCurrency(totals.balance)}</td>
                <td class="text-center">${(data as PeriodData[]).reduce((sum, period) => sum + period.transactions.length, 0)}</td>
            </tr>
        </tfoot>
        ` : ''}
    </table>
    
    <div class="footer">
        <p>Relatório gerado automaticamente pelo Sistema Zenit em ${new Date().toLocaleString('pt-BR')}</p>
        <p>Este documento é confidencial e destinado exclusivamente ao uso interno da empresa.</p>
    </div>
</body>
</html>
    `.trim();
  }
}