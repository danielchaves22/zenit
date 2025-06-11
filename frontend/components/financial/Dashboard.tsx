// frontend/components/financial/Dashboard.tsx - BOTÕES DE PERÍODO COM CORES DINÂMICAS
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import api from '../../lib/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Tipos para o resumo financeiro
interface FinancialSummary {
  income: number;
  expense: number;
  balance: number;
  accounts: {
    id: number;
    name: string;
    balance: string;
    type: string;
  }[];
  topCategories: {
    id: number;
    name: string;
    amount: number;
    color: string;
  }[];
  period: {
    startDate: string;
    endDate: string;
  };
}

export default function FinancialDashboard() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  useEffect(() => {
    if (!token) return;
    fetchSummary();
  }, [token, period]);

  async function fetchSummary() {
    setLoading(true);
    setError(null);

    try {
      // Calcular datas com base no período selecionado
      const now = new Date();
      let startDate = new Date();
      let endDate = new Date();

      if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      } else if (period === 'quarter') {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      } else if (period === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
      }

      const response = await api.get('/financial/summary', {
        params: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString()
        }
      });

      setSummary(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar resumo financeiro');
    } finally {
      setLoading(false);
    }
  }

  // Formatar valor para exibição em BRL
  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  }

  // Gerar dados para o gráfico de receitas x despesas
  function getChartData() {
    if (!summary) return [];

    return [
      {
        name: 'Resumo',
        Receitas: summary.income,
        Despesas: summary.expense,
        Saldo: summary.balance
      }
    ];
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-heading font-bold">Dashboard Financeiro</h1>
        
        {/* ✅ BOTÕES DE PERÍODO COM CORES DINÂMICAS */}
        <div className="flex space-x-2">
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              period === 'month' 
                ? 'bg-accent text-white shadow-lg' // ✅ USA CSS VARIABLE DINÂMICA
                : 'bg-[#1e2126] text-gray-300 hover:bg-[#262b36] hover:text-accent border border-gray-700'
            }`}
          >
            Mês Atual
          </button>
          <button
            onClick={() => setPeriod('quarter')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              period === 'quarter' 
                ? 'bg-accent text-white shadow-lg' // ✅ USA CSS VARIABLE DINÂMICA
                : 'bg-[#1e2126] text-gray-300 hover:bg-[#262b36] hover:text-accent border border-gray-700'
            }`}
          >
            Trimestre
          </button>
          <button
            onClick={() => setPeriod('year')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              period === 'year' 
                ? 'bg-accent text-white shadow-lg' // ✅ USA CSS VARIABLE DINÂMICA
                : 'bg-[#1e2126] text-gray-300 hover:bg-[#262b36] hover:text-accent border border-gray-700'
            }`}
          >
            Ano
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-6 text-center text-danger">
          {error}
        </Card>
      ) : summary && (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6 relative overflow-hidden">
              <h3 className="text-lg font-medium text-gray-600">Receitas</h3>
              <p className="text-2xl font-bold text-success mt-2">
                {formatCurrency(summary.income)}
              </p>
              <div 
                className="absolute bottom-0 left-0 h-1 bg-success" 
                style={{ width: `${Math.min(100, (summary.income / (summary.income + summary.expense)) * 100)}%` }}
              />
            </Card>

            <Card className="p-6 relative overflow-hidden">
              <h3 className="text-lg font-medium text-gray-600">Despesas</h3>
              <p className="text-2xl font-bold text-danger mt-2">
                {formatCurrency(summary.expense)}
              </p>
              <div 
                className="absolute bottom-0 left-0 h-1 bg-danger" 
                style={{ width: `${Math.min(100, (summary.expense / (summary.income + summary.expense)) * 100)}%` }}
              />
            </Card>

            <Card className="p-6 relative overflow-hidden">
              <h3 className="text-lg font-medium text-gray-600">Saldo</h3>
              <p className={`text-2xl font-bold mt-2 ${summary.balance >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(summary.balance)}
              </p>
              <div 
                className={`absolute bottom-0 left-0 h-1 ${summary.balance >= 0 ? 'bg-success' : 'bg-danger'}`} 
                style={{ width: '100%' }}
              />
            </Card>
          </div>

          {/* Gráfico de Receitas x Despesas */}
          <Card className="p-6">
            <h3 className="text-lg font-medium text-gray-600 mb-4">Receitas x Despesas</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={getChartData()}
                  margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: '#1e2126',
                      borderColor: '#374151',
                      color: '#fff',
                    }}
                    cursor={{ fill: '#262b36' }}
                  />
                  <Legend />
                  <Bar dataKey="Receitas" fill="#16A34A" />
                  <Bar dataKey="Despesas" fill="#DC2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Contas Financeiras */}
          <Card className="p-6">
            <h3 className="text-lg font-medium text-gray-600 mb-4">Contas Financeiras</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                  <tr>
                    <th className="text-left p-2">Conta</th>
                    <th className="text-left p-2">Tipo</th>
                    <th className="text-right p-2">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.accounts.map((account) => (
                    <tr key={account.id} className="border-t">
                      <td className="p-2">{account.name}</td>
                      <td className="p-2">{mapAccountType(account.type)}</td>
                      <td className={`p-2 text-right ${Number(account.balance) >= 0 ? 'text-success' : 'text-danger'}`}>
                        {formatCurrency(Number(account.balance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-bold">
                  <tr className="border-t">
                    <td className="p-2" colSpan={2}>Total</td>
                    <td className={`p-2 text-right ${
                      summary.accounts.reduce((sum, account) => sum + Number(account.balance), 0) >= 0 
                      ? 'text-success' 
                      : 'text-danger'
                    }`}>
                      {formatCurrency(
                        summary.accounts.reduce((sum, account) => sum + Number(account.balance), 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {/* Top Categorias */}
          {summary.topCategories && summary.topCategories.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-medium text-gray-600 mb-4">Principais Categorias de Despesa</h3>
              <div className="space-y-3">
                {summary.topCategories.map((category) => (
                  <div key={category.id} className="flex items-center">
                    <div 
                      className="w-4 h-4 rounded-full mr-2" 
                      style={{ backgroundColor: category.color }} 
                    />
                    <span className="flex-1">{category.name}</span>
                    <span className="font-medium text-danger">
                      {formatCurrency(category.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// Mapear tipos de conta para exibição amigável
function mapAccountType(type: string): string {
  const types: Record<string, string> = {
    'CHECKING': 'Conta Corrente',
    'SAVINGS': 'Poupança',
    'CREDIT_CARD': 'Cartão de Crédito',
    'INVESTMENT': 'Investimento',
    'CASH': 'Dinheiro'
  };
  
  return types[type] || type;
}