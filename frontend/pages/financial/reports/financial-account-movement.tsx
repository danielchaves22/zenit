// frontend/pages/financial/reports/financial-account-movement.tsx
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
  Calendar, Filter, RefreshCw, ChevronDown, ChevronRight
} from 'lucide-react';
import api from '@/lib/api';

interface FinancialAccount {
  id: number;
  name: string;
  type: string;
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

export default function FinancialAccountMovementReport() {
  const { addToast } = useToast();
  
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccount[]>([]);
  const [reportData, setReportData] = useState<PeriodData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    financialAccountIds: [],
    groupBy: 'day'
  });

  useEffect(() => {
    fetchFinancialAccounts();
  }, []);

  useEffect(() => {
    if (financialAccounts.length > 0 && filters.financialAccountIds.length === 0) {
      // Auto-selecionar todas as contas financeiras inicialmente
      setFilters(prev => ({
        ...prev,
        financialAccountIds: financialAccounts.map(acc => acc.id)
      }));
    }
  }, [financialAccounts]);

  useEffect(() => {
    if (filters.financialAccountIds.length > 0) {
      generateReport();
    }
  }, [filters]);

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

  function toggleFinancialAccountSelection(accountId: number) {
    setFilters(prev => ({
      ...prev,
      financialAccountIds: prev.financialAccountIds.includes(accountId)
        ? prev.financialAccountIds.filter(id => id !== accountId)
        : [...prev.financialAccountIds, accountId]
    }));
  }

  function toggleAllFinancialAccounts() {
    setFilters(prev => ({
      ...prev,
      financialAccountIds: prev.financialAccountIds.length === financialAccounts.length ? [] : financialAccounts.map(acc => acc.id)
    }));
  }

  function togglePeriodExpansion(period: string) {
    setExpandedPeriods(prev => {
      const newSet = new Set(prev);
      if (newSet.has(period)) {
        newSet.delete(period);
      } else {
        newSet.add(period);
      }
      return newSet;
    });
  }

  async function exportToPDF() {
    try {
      const response = await api.post('/financial/reports/financial-account-movement/pdf', {
        ...filters,
        data: reportData
      }, {
        responseType: 'blob'
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `relatorio-movimentacao-contas-${filters.startDate}-${filters.endDate}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      addToast('PDF gerado com sucesso', 'success');
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

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR');
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

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white">Relatório de Movimentação de Contas Financeiras</h1>
          <p className="text-gray-400 mt-1">Movimentação detalhada por período</p>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={printReport} className="flex items-center gap-2">
            <Printer size={16} />
            Imprimir
          </Button>
          <Button variant="outline" onClick={exportToPDF} className="flex items-center gap-2">
            <FileText size={16} />
            PDF
          </Button>
          <Button variant="outline" onClick={exportToExcel} className="flex items-center gap-2">
            <Download size={16} />
            Excel
          </Button>
          <Button variant="accent" onClick={generateReport} className="flex items-center gap-2">
            <RefreshCw size={16} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-6 print:hidden">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-white">Filtros do Relatório</h3>
          
          {/* Período */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Agrupar por
              </label>
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Contas Financeiras Selecionadas ({filters.financialAccountIds.length} de {financialAccounts.length})
              </label>
              <Button 
                variant="outline" 
                onClick={toggleAllFinancialAccounts}
                className="text-xs py-1 px-3"
              >
                {filters.financialAccountIds.length === financialAccounts.length ? 'Desmarcar Todas' : 'Marcar Todas'}
              </Button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {financialAccounts.map(account => (
                <label
                  key={account.id}
                  className="flex items-center space-x-2 p-3 bg-[#1e2126] rounded-lg border border-gray-700 hover:bg-[#262b36] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filters.financialAccountIds.includes(account.id)}
                    onChange={() => toggleFinancialAccountSelection(account.id)}
                    className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                  />
                  <span className="text-sm text-white truncate">{account.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Resumo Geral */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total de Entradas</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(totals.income)}</p>
            </div>
            <TrendingUp size={24} className="text-green-400" />
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total de Saídas</p>
              <p className="text-xl font-bold text-red-400">{formatCurrency(totals.expense)}</p>
            </div>
            <TrendingDown size={24} className="text-red-400" />
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Saldo do Período</p>
              <p className={`text-xl font-bold ${totals.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(totals.balance)}
              </p>
            </div>
            <div className={`text-2xl ${totals.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totals.balance >= 0 ? '+' : '−'}
            </div>
          </div>
        </Card>
      </div>

      {/* Dados do Relatório */}
      {loading ? (
        <PageLoader message="Gerando relatório..." />
      ) : reportData.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
          <p className="text-gray-400 mb-4">Nenhuma movimentação encontrada para o período</p>
          <Button variant="accent" onClick={generateReport}>
            Gerar Relatório
          </Button>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f1419] text-gray-400 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Período</th>
                  <th className="px-4 py-3 text-right">Entradas</th>
                  <th className="px-4 py-3 text-right">Saídas</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-center">Transações</th>
                  <th className="px-4 py-3 text-center print:hidden">Ações</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((period, index) => (
                  <React.Fragment key={period.period}>
                    <tr className="border-b border-gray-700 hover:bg-[#1a1f2b]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-white">{period.periodLabel}</div>
                      </td>
                      <td className="px-4 py-3 text-right text-green-400 font-medium">
                        {formatCurrency(period.income)}
                      </td>
                      <td className="px-4 py-3 text-right text-red-400 font-medium">
                        {formatCurrency(period.expense)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${
                        period.balance >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(period.balance)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full">
                          {period.transactions.length}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center print:hidden">
                        <Button
                          variant="outline"
                          onClick={() => togglePeriodExpansion(period.period)}
                          className="p-1"
                        >
                          {expandedPeriods.has(period.period) ? (
                            <ChevronDown size={16} />
                          ) : (
                            <ChevronRight size={16} />
                          )}
                        </Button>
                      </td>
                    </tr>
                    
                    {/* Detalhes das Transações */}
                    {expandedPeriods.has(period.period) && (
                      <tr>
                        <td colSpan={6} className="px-4 py-3 bg-[#0f1419]">
                          <div className="space-y-2">
                            {period.transactions.map(transaction => (
                              <div key={transaction.id} className="flex items-center justify-between p-3 bg-[#1e2126] rounded-lg">
                                <div className="flex items-center gap-3">
                                  <div className={`p-1 rounded ${
                                    transaction.type === 'INCOME' ? 'bg-green-900' : 'bg-red-900'
                                  }`}>
                                    {transaction.type === 'INCOME' ? (
                                      <TrendingUp size={14} className="text-green-400" />
                                    ) : (
                                      <TrendingDown size={14} className="text-red-400" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="text-white font-medium">{transaction.description}</div>
                                    <div className="text-xs text-gray-400">
                                      {transaction.financialAccount.name}
                                      {transaction.category && ` • ${transaction.category.name}`}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className={`font-medium ${
                                    transaction.type === 'INCOME' ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {formatCurrency(transaction.amount)}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {formatDate(transaction.date)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
              <tfoot className="bg-[#0f1419] font-bold">
                <tr>
                  <td className="px-4 py-3 text-white">TOTAL GERAL</td>
                  <td className="px-4 py-3 text-right text-green-400">{formatCurrency(totals.income)}</td>
                  <td className="px-4 py-3 text-right text-red-400">{formatCurrency(totals.expense)}</td>
                  <td className={`px-4 py-3 text-right ${totals.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(totals.balance)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-300">
                    {reportData.reduce((sum, period) => sum + period.transactions.length, 0)}
                  </td>
                  <td className="px-4 py-3 print:hidden"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Informações do Relatório (para impressão) */}
      <div className="hidden print:block mt-6">
        <div className="text-sm text-gray-600">
          <p><strong>Período:</strong> {formatDate(filters.startDate)} a {formatDate(filters.endDate)}</p>
          <p><strong>Agrupamento:</strong> {
            filters.groupBy === 'day' ? 'Por Dia' : 
            filters.groupBy === 'week' ? 'Por Semana' : 'Por Mês'
          }</p>
          <p><strong>Contas Financeiras:</strong> {selectedFinancialAccounts.map(acc => acc.name).join(', ')}</p>
          <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
        </div>
      </div>
    </DashboardLayout>
  );
}