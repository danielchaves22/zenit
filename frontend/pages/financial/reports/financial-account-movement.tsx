import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { 
  TrendingUp, TrendingDown, Download, Printer, FileText, 
  Calendar, Filter, ZoomIn, ZoomOut, RotateCcw
} from 'lucide-react';
import api from '@/lib/api';

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
  const [zoomLevel, setZoomLevel] = useState(100);
  
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    financialAccountIds: [],
    groupBy: 'day'
  });

  useEffect(() => {
    fetchFinancialAccounts();
  }, []);

  // Não auto-selecionar contas - usuário deve escolher

  // Não executar relatório automaticamente - apenas quando usuário solicitar

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
      style: 'currency',
      currency: 'BRL'
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
      // Usar window.print() por enquanto (mais compatível)
      window.print();
      addToast('Use Ctrl+P ou Cmd+P para salvar como PDF', 'success');
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
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={printReport}>
            <Printer size={16} className="mr-2" />
            Imprimir
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

            <div className="flex items-end">
              <Button variant="outline" onClick={generateReport} className="w-full">
                Gerar Relatório
              </Button>
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
      ) : (<Card>
        <div className="space-y-4 p-0">
          {/* Toolbar do Relatório */}
          <div className="flex justify-between items-center bg-gray-100 rounded-lg p-2 print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-700 font-medium">Pré-visualização</span>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Controles de Zoom */}
              <div className="flex items-center gap-1 border border-gray-300 rounded bg-white">
                <button
                  onClick={decreaseZoom}
                  disabled={zoomLevel <= 50}
                  className="p-1 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Diminuir zoom"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="px-2 text-sm font-medium text-gray-700 min-w-[50px] text-center">
                  {zoomLevel}%
                </span>
                <button
                  onClick={increaseZoom}
                  disabled={zoomLevel >= 150}
                  className="p-1 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Aumentar zoom"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  onClick={resetZoom}
                  className="p-1 hover:bg-gray-100 border-l border-gray-300"
                  title="Resetar zoom"
                >
                  <RotateCcw size={14} />
                </button>
              </div>

              {/* Ações do Relatório */}
              <div className="flex items-center gap-1">
                <button
                  onClick={exportToPDF}
                  className="p-2 hover:bg-gray-200 rounded transition-colors"
                  title="Exportar PDF"
                >
                  <FileText size={16} className="text-gray-600" />
                </button>
                <button
                  onClick={exportToExcel}
                  className="p-2 hover:bg-gray-200 rounded transition-colors"
                  title="Exportar Excel"
                >
                  <Download size={16} className="text-gray-600" />
                </button>
              </div>
            </div>
          </div>

          {/* Container do Relatório com Zoom */}
          <div 
            className="transition-transform duration-200 origin-top"
            style={{ transform: `scale(${zoomLevel / 100})` }}
          >
            {/* Relatório em formato A4 */}
            <div className="report-container mx-auto bg-white text-black print:bg-white print:text-black shadow-lg" style={{ width: '21cm', minHeight: '29.7cm', padding: '0.8cm' }}>
          {/* Cabeçalho do Relatório */}
          <div className="text-center mb-4 pb-3 border-b-2 border-gray-400">
            <h1 className="text-lg font-bold mb-2">RELATÓRIO DE MOVIMENTAÇÃO FINANCEIRA</h1>
            <div className="text-xs">
              <p><strong>Período:</strong> {formatDate(filters.startDate)} a {formatDate(filters.endDate)}</p>
              <p><strong>Agrupamento:</strong> {filters.groupBy === 'day' ? 'Diário' : filters.groupBy === 'week' ? 'Semanal' : 'Mensal'}</p>
              <p><strong>Contas:</strong> {selectedFinancialAccounts.map(acc => acc.name).join(', ')}</p>
            </div>
          </div>

          {/* Resumo Geral */}
          <div className="mb-4 p-3 border border-gray-300">
            <h3 className="font-bold text-sm mb-2 text-center">RESUMO GERAL DO PERÍODO</h3>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-400 p-1 text-left font-bold">DESCRIÇÃO</th>
                  <th className="border border-gray-400 p-1 text-right font-bold">VALOR</th>
                </tr>
              </thead>
              <tbody>
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
                  <td className="border border-gray-400 p-1">SALDO LÍQUIDO DO PERÍODO</td>
                  <td className={`border border-gray-400 p-1 text-right ${totals.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
                  <h4 className="font-bold text-sm">{period.periodLabel}</h4>
                </div>

                {/* Transações do Período */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="border border-gray-400 p-1 text-left font-bold">DATA</th>
                        <th className="border border-gray-400 p-1 text-left font-bold">DESCRIÇÃO</th>
                        <th className="border border-gray-400 p-1 text-left font-bold">CONTA</th>
                        <th className="border border-gray-400 p-1 text-left font-bold">CATEGORIA</th>
                        <th className="border border-gray-400 p-1 text-center font-bold">TIPO</th>
                        <th className="border border-gray-400 p-1 text-right font-bold">VALOR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {period.transactions.map((transaction, index) => (
                        <tr key={transaction.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="border border-gray-400 p-1 text-xs">
                            {formatDate(transaction.date)}
                          </td>
                          <td className="border border-gray-400 p-1 text-xs">
                            {transaction.description}
                          </td>
                          <td className="border border-gray-400 p-1 text-xs">
                            {transaction.financialAccount.name}
                          </td>
                          <td className="border border-gray-400 p-1 text-xs">
                            {transaction.category ? (
                              <div className="flex items-center gap-1">
                                <div 
                                  className="w-2 h-2 rounded-full border border-gray-400"
                                  style={{ backgroundColor: transaction.category.color }}
                                />
                                <span className="truncate">{transaction.category.name}</span>
                              </div>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="border border-gray-400 p-1 text-center">
                            <span className={`px-1 py-0.5 rounded text-white text-xs font-medium ${
                              transaction.type === 'INCOME' ? 'bg-green-600' : 'bg-red-600'
                            }`}>
                              {transaction.type === 'INCOME' ? 'ENT' : 'SAÍ'}
                            </span>
                          </td>
                          <td className={`border border-gray-400 p-1 text-right text-xs font-medium ${
                            transaction.type === 'INCOME' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {formatCurrency(transaction.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Subtotal do Período */}
                    <tfoot>
                      <tr className="bg-gray-100 font-bold text-xs">
                        <td colSpan={3} className="border border-gray-400 p-1 text-left">
                          SUBTOTAL - {period.periodLabel}
                        </td>
                        <td className="border border-gray-400 p-1 text-right">
                          <div>Entradas: {formatCurrency(period.income)}</div>
                          <div>Saídas: {formatCurrency(period.expense)}</div>
                          <div>Transações: {period.transactions.length}</div>
                        </td>
                        <td className="border border-gray-400 p-1 text-center font-bold">
                          SUBTOTAL:
                        </td>
                        <td className={`border border-gray-400 p-1 text-right font-bold ${
                          period.balance >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {formatCurrency(period.balance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
          </div>

          {/* Rodapé */}
          <div className="mt-4 pt-3 border-t border-gray-300 text-xs text-gray-600">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p><strong>Relatório gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                <p><strong>Sistema:</strong> Zenit - Gestão Financeira</p>
              </div>
              <div className="text-right">
                <p><strong>Usuário:</strong> Sistema</p>
                <p><strong>Empresa:</strong> {selectedFinancialAccounts.length > 0 ? 'Empresa Exemplo' : '-'}</p>
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>
      </Card>)}
    </DashboardLayout>
  );
}