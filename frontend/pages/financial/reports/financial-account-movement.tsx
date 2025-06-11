import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import {
  TrendingUp, TrendingDown, Download, Printer,
  Calendar, Filter, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
import { FaFilePdf, FaFileExcel } from 'react-icons/fa';
import api from '@/lib/api';
import { Roboto_Condensed } from 'next/font/google';

// Configurar a fonte Roboto Condensed
const robotoCondensed = Roboto_Condensed({
  subsets: ['latin'],
  weight: ['300', '400', '700'],
  display: 'swap',
  variable: '--font-roboto-condensed'
});

// Interfaces baseadas no retorno do backend
interface FinancialAccount {
  id: number;
  name: string;
}

interface Category {
  id: number;
  name: string;
  color: string;
}

interface Transaction {
  id: number;
  description: string;
  amount: number;
  date: string;
  type: 'INCOME' | 'EXPENSE';
  financialAccount: FinancialAccount;
  category?: Category;
}

interface PeriodData {
  period: string;
  periodLabel: string;
  income: number;
  expense: number;
  balance: number;
  transactions: Transaction[];
}

interface ReportFilters {
  startDate: string;
  endDate: string;
  financialAccountIds: number[];
  groupBy: 'day' | 'week' | 'month';
}

export default function FinancialMovementReport() {
  const { addToast } = useToast();
  
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [reportData, setReportData] = useState<PeriodData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(150);
  
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    financialAccountIds: [],
    groupBy: 'day'
  });

  useEffect(() => {
    fetchFinancialAccounts();
  }, []);

  async function fetchFinancialAccounts() {
    try {
      const response = await api.get('/financial/accounts');
      setFinancialAccounts(response.data.filter((acc: any) => acc.isActive !== false));
    } catch (error) {
      addToast('Erro ao carregar contas financeiras', 'error');
    }
  }

  async function generateReport() {
    if (filters.financialAccountIds.length === 0) {
      addToast('Selecione pelo menos uma conta financeira', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await api.get('/financial/reports/financial-account-movement', {
        params: {
          startDate: filters.startDate,
          endDate: filters.endDate,
          financialAccountIds: filters.financialAccountIds.join(','),
          groupBy: filters.groupBy
        }
      });
      
      setReportData(response.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao gerar relatório', 'error');
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'decimal',
      currency: 'BRL',
      minimumFractionDigits: 2,
    }).format(value);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR');
  }

  function increaseZoom() {
    if (zoomLevel < 150) {
      setZoomLevel(prev => prev + 10);
    }
  }

  function decreaseZoom() {
    if (zoomLevel > 50) {
      setZoomLevel(prev => prev - 10);
    }
  }

  function resetZoom() {
    setZoomLevel(100);
  }

  async function exportToPDF() {
    try {
      // Capturar apenas o container do relatório
      const reportElement = document.querySelector('.report-container');
      if (!reportElement) {
        addToast('Relatório não encontrado', 'error');
        return;
      }

      // Criar uma nova janela apenas com o relatório
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        addToast('Erro ao abrir janela de impressão', 'error');
        return;
      }

      // HTML completo para a nova janela
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Relatório de Movimentação Financeira</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: var(--font-roboto-condensed), 'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Condensed', sans-serif; 
              background: white; 
              color: black;
              font-size: 10px;
              line-height: 1.3;
              font-weight: 400;
            }
            @page { 
              size: A4; 
              margin: 1cm; 
            }
            table { 
              border-collapse: collapse; 
              width: 100%; 
              font-size: 9px;
              font-family: var(--font-roboto-condensed), 'Arial Narrow', 'Liberation Sans Narrow', monospace;
              table-layout: fixed;
            }
            th, td { 
              border: 1px solid #000; 
              padding: 2px 3px; 
              font-size: 9px;
              font-family: var(--font-roboto-condensed), 'Arial Narrow', 'Liberation Sans Narrow', monospace;
              font-weight: 400;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
            th { 
              background: #f0f0f0; 
              font-weight: 700; 
            }
            
            /* Larguras fixas para colunas do relatório principal */
            .data-table {
              table-layout: fixed;
            }
            .data-table .col-date { width: 9%; }
            .data-table .col-description { width: auto; }
            .data-table .col-account { width: 18%; }
            .data-table .col-category { width: 18%; }
            .data-table .col-type { width: 8%; }
            .data-table .col-value { width: 13%; }
            
            .text-green-600 { color: #059669; }
            .text-red-600 { color: #dc2626; }
            .bg-gray-50 { background: #f9fafb; }
            .bg-gray-100 { background: #f3f4f6; }
            .bg-gray-200 { background: #e5e7eb; }
            .font-bold { font-weight: 700; }
            .text-center { text-align: center; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .truncate { 
              overflow: hidden; 
              text-overflow: ellipsis; 
              white-space: nowrap; 
            }
            .rounded { border-radius: 2px; }
            .border-b-2 { border-bottom: 2px solid #000; }
            .border-t { border-top: 1px solid #000; }
            .mb-2 { margin-bottom: 9px; }
            .mb-4 { margin-bottom: 18px; }
            .p-1 { padding: 3px; }
            .p-2 { padding: 8px; }
            .p-3 { padding: 9px; }
            .pb-3 { padding-bottom: 9px; }
            .pt-3 { padding-top: 9px; }
            .space-y-4 > * + * { margin-top: 18px; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .gap-4 { gap: 18px; }
            .w-2 { width: 8px; }
            .h-2 { height: 8px; }
            .rounded-full { border-radius: 50%; }
            .flex { display: flex; }
            .items-center { align-items: center; }
            .gap-1 { gap: 3px; }
            .px-1 { padding-left: 3px; padding-right: 3px; }
            .py-0\\.5 { padding-top: 1px; padding-bottom: 1px; }
            .bg-green-600 { background-color: #059669; }
            .bg-red-600 { background-color: #dc2626; }
            .text-white { color: white; }
            .text-gray-500 { color: #6b7280; }
            .text-gray-600 { color: #4b5563; }
            
            /* Styling para o subtotal com múltiplas linhas */
            tfoot tr td[rowspan] {
              vertical-align: middle;
            }
            
            /* Estilos específicos para dados condensados */
            .data-cell {
              font-family: var(--font-roboto-condensed), 'Arial Narrow', 'Liberation Sans Narrow', monospace;
              font-size: 10px;
              font-weight: 400;
              letter-spacing: -0.2px;
            }
            
            .data-header {
              font-family: var(--font-roboto-condensed), 'Arial Narrow', 'Liberation Sans Narrow', sans-serif;
              font-size: 9px;
              font-weight: 700;
              letter-spacing: 0px;
            }
            
            .currency-cell {
              font-family: var(--font-roboto-condensed), 'Liberation Sans Narrow', monospace;
              font-weight: 500;
              letter-spacing: -0.3px;
            }
            
            h1 { 
              font-family: var(--font-roboto-condensed), sans-serif; 
              font-weight: 700; 
            }
            
            h3, h4 { 
              font-family: var(--font-roboto-condensed), sans-serif; 
              font-weight: 700; 
            }
          </style>
        </head>
        <body class="${robotoCondensed.variable}">
          <style>
            .data-table colgroup col:nth-child(1) { width: 9%; }
            .data-table colgroup col:nth-child(2) { width: auto; }
            .data-table colgroup col:nth-child(3) { width: 18%; }
            .data-table colgroup col:nth-child(4) { width: 18%; }
            .data-table colgroup col:nth-child(5) { width: 8%; }
            .data-table colgroup col:nth-child(6) { width: 13%; }
          </style>
          ${reportElement.outerHTML}
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Aguardar o carregamento e imprimir
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 250);
      };
      
      addToast('Janela de impressão aberta', 'success');
    } catch (error) {
      addToast('Erro ao gerar PDF', 'error');
    }
  }

  async function exportToExcel() {
    try {
      const response = await api.post('/financial/reports/financial-account-movement/excel', {
        ...filters,
        data: reportData
      }, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-movimentacao-contas-${filters.startDate}-${filters.endDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      addToast('Excel gerado com sucesso', 'success');
    } catch (error) {
      addToast('Erro ao gerar Excel', 'error');
    }
  }

  function printReport() {
    window.print();
  }

  // Calcular totais gerais
  const totals = reportData.reduce(
    (acc, period) => ({
      income: acc.income + period.income,
      expense: acc.expense + period.expense,
      balance: acc.balance + period.balance
    }),
    { income: 0, expense: 0, balance: 0 }
  );

  const selectedFinancialAccounts = financialAccounts.filter(acc => filters.financialAccountIds.includes(acc.id));

  return (
    <div className={robotoCondensed.variable}>
      <DashboardLayout title="Relatório de Movimentação">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Financeiro' },
        { label: 'Relatórios' },
        { label: 'Movimentação de Contas Financeiras' }
      ]} />

      {/* Barra de Ações */}
      <div className="flex justify-between items-center mb-4 print:hidden">
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter size={16} />
            {showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card className="mb-4">
          <h3 className="text-white font-medium mb-3">Filtros do Relatório</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              label="Data Inicial"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
              className="mb-0"
            />
            
            <Input
              label="Data Final"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
              className="mb-0"
            />
            
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Agrupar por</label>
              <select
                value={filters.groupBy}
                onChange={(e) => setFilters(prev => ({ ...prev, groupBy: e.target.value as 'day' | 'week' | 'month' }))}
                className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-accent"
              >
                <option value="day">Por Dia</option>
                <option value="week">Por Semana</option>
                <option value="month">Por Mês</option>
              </select>
            </div>
          </div>

          {/* Seleção de Contas Financeiras */}
          <div className="mt-4">
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Contas Financeiras ({filters.financialAccountIds.length} selecionadas)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {financialAccounts.map(account => (
                <label
                  key={account.id}
                  className="flex items-center space-x-2 p-3 bg-[#1e2126] rounded-lg border border-gray-700 hover:bg-[#262b36] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filters.financialAccountIds.includes(account.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFilters(prev => ({
                          ...prev,
                          financialAccountIds: [...prev.financialAccountIds, account.id]
                        }));
                      } else {
                        setFilters(prev => ({
                          ...prev,
                          financialAccountIds: prev.financialAccountIds.filter(id => id !== account.id)
                        }));
                      }
                    }}
                    className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                  />
                  <span className="text-sm text-white truncate">{account.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-end" style={{ marginTop: '1rem' }}>
            <Button variant="accent" onClick={generateReport} >
              Gerar Relatório
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <PageLoader message="Gerando relatório..." />
      ) : reportData.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-400 mb-4">
            {filters.financialAccountIds.length === 0 
              ? 'Selecione as contas financeiras e clique em "Gerar Relatório"'
              : 'Nenhuma movimentação encontrada para o período selecionado'
            }
          </p>
          {filters.financialAccountIds.length > 0 && (
            <Button variant="accent" onClick={generateReport}>
              Gerar Relatório
            </Button>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="space-y-0">
            {/* Toolbar do Relatório */}
            <div className="flex justify-between items-center bg-[#1e2126] border-b border-gray-700 p-3 print:hidden">
              <div className="flex items-center gap-2">
                {/* Controles de Zoom */}
                <div className="flex items-center gap-1 border border-gray-600 rounded bg-[#151921]">
                  <button
                    onClick={decreaseZoom}
                    disabled={zoomLevel <= 50}
                    className="p-1 hover:bg-[#262b36] disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
                    title="Diminuir zoom"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="px-2 text-sm font-medium text-gray-300 min-w-[50px] text-center">
                    {zoomLevel}%
                  </span>
                  <button
                    onClick={increaseZoom}
                    disabled={zoomLevel >= 150}
                    className="p-1 hover:bg-[#262b36] disabled:opacity-50 disabled:cursor-not-allowed text-gray-300"
                    title="Aumentar zoom"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    onClick={resetZoom}
                    className="p-1 hover:bg-[#262b36] border-l border-gray-600 text-gray-300"
                    title="Resetar zoom"
                  >
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Ações do Relatório */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={exportToPDF}
                    className="p-2 hover:bg-[#262b36] rounded transition-colors text-gray-300 hover:text-red-400"
                    title="Exportar PDF"
                  >
                    <FaFilePdf size={16} />
                  </button>
                  <button
                    onClick={exportToExcel}
                    className="p-2 hover:bg-[#262b36] rounded transition-colors text-gray-300 hover:text-green-400"
                    title="Exportar Excel"
                  >
                    <FaFileExcel size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Container do Relatório com Zoom */}
            <div 
              className="transition-transform duration-200 origin-top p-4"
              style={{ transform: `scale(${zoomLevel / 100})` }}
            >
              {/* Relatório em formato A4 */}
              <div 
                className={`report-container mx-auto bg-white text-black print:bg-white print:text-black shadow-lg ${robotoCondensed.className}`}
                style={{ 
                  width: '21cm', 
                  minHeight: '29.7cm', 
                  padding: '0.8cm', 
                  fontSize: '10px'
                }}
              >
                {/* Cabeçalho do Relatório */}
                <div className="text-center mb-4 pb-3 border-b-2 border-gray-400">
                  <h1 className="text-lg font-bold mb-2">
                    RELATÓRIO DE MOVIMENTAÇÃO FINANCEIRA
                  </h1>
                  <div style={{ fontSize: '9px' }}>
                    <p><strong>Período:</strong> {formatDate(filters.startDate)} a {formatDate(filters.endDate)}</p>
                    <p><strong>Agrupamento:</strong> {filters.groupBy === 'day' ? 'Diário' : filters.groupBy === 'week' ? 'Semanal' : 'Mensal'}</p>
                    <p><strong>Contas:</strong> {selectedFinancialAccounts.map(acc => acc.name).join(', ')}</p>
                  </div>
                </div>

                {/* Resumo Geral */}
                <div className="mb-4 p-3 border border-gray-300">
                  <h3 className="font-bold text-sm mb-2 text-center">
                    RESUMO GERAL DO PERÍODO
                  </h3>
                  <table 
                    className="w-full border-collapse" 
                    style={{ fontSize: '9px' }}
                  >
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-400 p-1 text-left font-bold" style={{ fontWeight: 700 }}>DESCRIÇÃO</th>
                        <th className="border border-gray-400 p-1 text-right font-bold" style={{ fontWeight: 700 }}>VALOR (R$)</th>
                      </tr>
                    </thead>
                    <tbody style={{ fontWeight: 400 }}>
                      <tr>
                        <td className="border border-gray-400 p-1 font-medium">Total de Entradas</td>
                        <td className="border border-gray-400 p-1 text-right font-medium text-green-600">
                          {formatCurrency(totals.income)}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-gray-400 p-1 font-medium">Total de Saídas</td>
                        <td className="border border-gray-400 p-1 text-right font-medium text-red-600">
                          {formatCurrency(totals.expense)}
                        </td>
                      </tr>
                      <tr className="bg-gray-50 font-bold">
                        <td className="border border-gray-400 p-1" style={{ fontWeight: 700 }}>SALDO LÍQUIDO DO PERÍODO</td>
                        <td className={`border border-gray-400 p-1 text-right ${totals.balance >= 0 ? 'text-green-600' : 'text-red-600'}`} style={{ fontWeight: 700 }}>
                          {formatCurrency(totals.balance)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Detalhamento por Período */}
                <div className="space-y-4">
                  {reportData.map((period, periodIndex) => (
                    <div key={period.period} className="border border-gray-300">
                      {/* Cabeçalho do Período */}
                      <div className="bg-gray-100 p-2 border-b border-gray-300">
                        <h4 className="font-bold" style={{ fontSize: '10px', fontWeight: 700 }}>
                          {period.periodLabel}
                        </h4>
                      </div>

                      {/* Transações do Período */}
                      <div className="overflow-x-auto">
                        <table 
                          className="w-full border-collapse" 
                          style={{ 
                            fontSize: '10px',
                            letterSpacing: '-0.2px',
                            tableLayout: 'fixed'
                          }}
                        >
                          <colgroup>
                            <col style={{ width: '9%' }} />
                            <col />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '8%' }} />
                            <col style={{ width: '13%' }} />
                          </colgroup>
                          <thead>
                            <tr className="bg-gray-200">
                              <th className="border border-gray-400 p-1 text-left font-bold" style={{ fontWeight: 700, fontSize: '9px' }}>DATA</th>
                              <th className="border border-gray-400 p-1 text-left font-bold" style={{ fontWeight: 700, fontSize: '9px' }}>DESCRIÇÃO</th>
                              <th className="border border-gray-400 p-1 text-left font-bold" style={{ fontWeight: 700, fontSize: '9px' }}>CONTA</th>
                              <th className="border border-gray-400 p-1 text-left font-bold" style={{ fontWeight: 700, fontSize: '9px' }}>CATEGORIA</th>
                              <th className="border border-gray-400 p-1 text-center font-bold" style={{ fontWeight: 700, fontSize: '9px' }}>TIPO</th>
                              <th className="border border-gray-400 p-1 text-right font-bold" style={{ fontWeight: 700, fontSize: '9px' }}>VALOR (R$)</th>
                            </tr>
                          </thead>
                          <tbody style={{ fontWeight: 400 }}>
                            {period.transactions.map((transaction, index) => (
                              <tr key={transaction.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-400 p-1" style={{ padding: '2px 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {formatDate(transaction.date)}
                                </td>
                                <td className="border border-gray-400 p-1" style={{ padding: '2px 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {transaction.description}
                                </td>
                                <td className="border border-gray-400 p-1" style={{ padding: '2px 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {transaction.financialAccount.name}
                                </td>
                                <td className="border border-gray-400 p-1" style={{ padding: '2px 3px' }}>
                                  {transaction.category ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                      <div 
                                        style={{ 
                                          backgroundColor: transaction.category.color,
                                          width: '8px',
                                          height: '8px',
                                          borderRadius: '50%',
                                          border: '1px solid #9ca3af',
                                          flexShrink: 0
                                        }}
                                      />
                                      <span 
                                        style={{ 
                                          overflow: 'hidden', 
                                          textOverflow: 'ellipsis', 
                                          whiteSpace: 'nowrap',
                                          flex: 1
                                        }}
                                      >
                                        {transaction.category.name}
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-500">-</span>
                                  )}
                                </td>
                                <td className="border border-gray-400 p-1 text-center" style={{ padding: '2px 3px' }}>
                                  <span 
                                    className={`px-1 py-0.5 rounded text-white font-medium ${
                                      transaction.type === 'INCOME' ? 'bg-green-600' : 'bg-red-600'
                                    }`} 
                                    style={{ 
                                      fontSize: '8px', 
                                      padding: '1px 2px',
                                      borderRadius: '2px',
                                      fontWeight: 500
                                    }}
                                  >
                                    {transaction.type === 'INCOME' ? 'ENT' : 'SAÍ'}
                                  </span>
                                </td>
                                <td 
                                  className={`border border-gray-400 p-1 text-right font-medium ${
                                    transaction.type === 'INCOME' ? 'text-green-600' : 'text-red-600'
                                  }`}
                                  style={{ 
                                    padding: '2px 3px',
                                    fontWeight: 500,
                                    letterSpacing: '-0.3px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {formatCurrency(transaction.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {/* Subtotal do Período */}
                          <tfoot>
                            <tr className="bg-gray-100 font-bold" style={{ fontSize: '10px', fontWeight: 700 }}>
                              <td colSpan={4} rowSpan={3} className="border border-gray-400 p-1 text-right" style={{ padding: '2px 3px', verticalAlign: 'middle' }}>
                                SUBTOTAIS - {period.periodLabel}
                              </td>
                              <td className="border border-gray-400 p-1 text-right" style={{ padding: '2px 3px', fontSize: '10px' }}>
                                Entradas:
                              </td>
                              <td className="border border-gray-400 p-1 text-right" style={{ padding: '2px 3px', fontSize: '10px' }}>
                                <span className='text-green-600'>{formatCurrency(period.income)}</span>
                              </td>
                            </tr>
                            <tr className="bg-gray-100 font-bold" style={{ fontSize: '10px', fontWeight: 700 }}>
                              <td className="border border-gray-400 p-1 text-right" style={{ padding: '2px 3px', fontSize: '10px' }}>
                                Saídas:
                              </td>
                              <td className="border border-gray-400 p-1 text-right" style={{ padding: '2px 3px', fontSize: '10px' }}>
                                <span className='text-red-600'>{formatCurrency(period.expense)}</span>
                              </td>
                            </tr>
                            <tr className="bg-gray-100 font-bold" style={{ fontSize: '10px', fontWeight: 700 }}>
                              <td className="border border-gray-400 p-1 text-right" style={{ padding: '2px 3px', fontSize: '10px' }}>
                                Líquido:
                              </td>
                              <td className="border border-gray-400 p-1 text-right" style={{ padding: '2px 3px', fontSize: '10px' }}>
                                <span className={`${period.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(period.balance)}</span>                               
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rodapé */}
                <div 
                  className="mt-4 pt-3 border-t border-gray-300 text-gray-600" 
                  style={{ fontSize: '9px' }}
                >
                  <div className="grid grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px' }}>
                    <div>
                      <p><strong>Relatório gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                      <p><strong>Sistema:</strong> Zenit - Gestão Financeira</p>
                    </div>
                    <div className="text-right" style={{ textAlign: 'right' }}>
                      <p><strong>Usuário:</strong> Sistema</p>
                      <p><strong>Empresa:</strong> {selectedFinancialAccounts.length > 0 ? 'Empresa Exemplo' : '-'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </DashboardLayout>
    </div>
  );
}