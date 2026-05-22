import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import api from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Budget,
  fetchBudgets,
  formatBusinessDate,
  formatCurrencyFromCents,
  getPrimaryBudget
} from '@/utils/budgets';

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
  const [primaryBudget, setPrimaryBudget] = useState<Budget | null>(null);
  const [budgetTimeZone, setBudgetTimeZone] = useState('UTC');
  const [budgetBusinessDate, setBudgetBusinessDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  useEffect(() => {
    if (!token) return;
    void fetchSummary();
  }, [token, period]);

  async function fetchSummary() {
    setLoading(true);
    setError(null);

    try {
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

      try {
        const budgetPayload = await fetchBudgets();
        setPrimaryBudget(getPrimaryBudget(budgetPayload.budgets));
        setBudgetTimeZone(budgetPayload.timeZone);
        setBudgetBusinessDate(budgetPayload.businessDate);
      } catch (_budgetError) {
        setPrimaryBudget(null);
        setBudgetBusinessDate(null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar resumo financeiro');
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

        <div className="flex space-x-2">
          <button
            onClick={() => setPeriod('month')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              period === 'month'
                ? 'bg-accent text-white shadow-lg'
                : 'bg-background text-gray-300 hover:bg-elevated hover:text-accent border border-gray-700'
            }`}
          >
            Mês Atual
          </button>
          <button
            onClick={() => setPeriod('quarter')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              period === 'quarter'
                ? 'bg-accent text-white shadow-lg'
                : 'bg-background text-gray-300 hover:bg-elevated hover:text-accent border border-gray-700'
            }`}
          >
            Trimestre
          </button>
          <button
            onClick={() => setPeriod('year')}
            className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              period === 'year'
                ? 'bg-accent text-white shadow-lg'
                : 'bg-background text-gray-300 hover:bg-elevated hover:text-accent border border-gray-700'
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
        <Card className="p-6 text-center text-danger">{error}</Card>
      ) : summary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6 relative overflow-hidden">
              <h3 className="text-lg font-medium text-gray-600">Receitas</h3>
              <p className="text-2xl font-bold text-success mt-2">
                {formatCurrency(summary.income)}
              </p>
              <div
                className="absolute bottom-0 left-0 h-1 bg-success"
                style={{
                  width: `${Math.min(
                    100,
                    (summary.income / (summary.income + summary.expense || 1)) * 100
                  )}%`
                }}
              />
            </Card>

            <Card className="p-6 relative overflow-hidden">
              <h3 className="text-lg font-medium text-gray-600">Despesas</h3>
              <p className="text-2xl font-bold text-danger mt-2">
                {formatCurrency(summary.expense)}
              </p>
              <div
                className="absolute bottom-0 left-0 h-1 bg-danger"
                style={{
                  width: `${Math.min(
                    100,
                    (summary.expense / (summary.income + summary.expense || 1)) * 100
                  )}%`
                }}
              />
            </Card>

            <Card className="p-6 relative overflow-hidden">
              <h3 className="text-lg font-medium text-gray-600">Saldo</h3>
              <p
                className={`text-2xl font-bold mt-2 ${
                  summary.balance >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {formatCurrency(summary.balance)}
              </p>
              <div
                className={`absolute bottom-0 left-0 h-1 ${
                  summary.balance >= 0 ? 'bg-success' : 'bg-danger'
                }`}
                style={{ width: '100%' }}
              />
            </Card>
          </div>

          <Card className="p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-300">Orçamento do dia</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Visão separada do domínio de orçamentos, sem misturar no saldo financeiro geral.
                </p>
              </div>

              <Link href="/financial/budgets">
                <Button variant="outline">Ver orçamentos</Button>
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-gray-700 bg-[#151b23] p-4">
                <div className="text-sm text-gray-400">Orçamento principal</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {primaryBudget?.code || 'Nenhum sincronizado'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-[#151b23] p-4">
                <div className="text-sm text-gray-400">Pode usar hoje</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {primaryBudget
                    ? formatCurrencyFromCents(primaryBudget.dailyBudgetCurrentCents)
                    : '--'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-[#151b23] p-4">
                <div className="text-sm text-gray-400">Saldo extra</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {primaryBudget
                    ? formatCurrencyFromCents(primaryBudget.dayExtraBalanceCents)
                    : '--'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-[#151b23] p-4">
                <div className="text-sm text-gray-400">Data de negócio</div>
                <div className="mt-2 text-lg font-semibold text-white">
                  {budgetBusinessDate
                    ? formatBusinessDate(budgetBusinessDate, budgetTimeZone)
                    : '--'}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-medium text-gray-600 mb-4">Receitas x Despesas</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={getChartData()} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => formatCurrency(Number(value))}
                    contentStyle={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: '#374151',
                      color: '#fff'
                    }}
                    cursor={{ fill: 'var(--color-bg-tertiary)' }}
                  />
                  <Legend />
                  <Bar dataKey="Receitas" fill="#16A34A" />
                  <Bar dataKey="Despesas" fill="#DC2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-medium text-gray-600 mb-1">Caixa e Disponibilidade</h3>
            <p className="mb-4 text-sm text-gray-400">
              Cartões de crédito ficam fora deste saldo consolidado.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-gray-400 bg-elevated uppercase text-xs">
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
                      <td
                        className={`p-2 text-right ${
                          Number(account.balance) >= 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {formatCurrency(Number(account.balance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="font-bold">
                  <tr className="border-t">
                    <td className="p-2" colSpan={2}>
                      Total
                    </td>
                    <td
                      className={`p-2 text-right ${
                        summary.accounts.reduce((sum, account) => sum + Number(account.balance), 0) >= 0
                          ? 'text-success'
                          : 'text-danger'
                      }`}
                    >
                      {formatCurrency(
                        summary.accounts.reduce((sum, account) => sum + Number(account.balance), 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          {summary.topCategories && summary.topCategories.length > 0 && (
            <Card className="p-6">
              <h3 className="text-lg font-medium text-gray-600 mb-4">Despesas por Categoria</h3>
              <div className="flex flex-col md:flex-row md:items-start md:space-x-6">
                <div className="md:w-1/2 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={summary.topCategories} dataKey="amount" nameKey="name" outerRadius={80}>
                        {summary.topCategories.map((category) => (
                          <Cell key={category.id} fill={category.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => formatCurrency(Number(value))}
                        contentStyle={{
                          backgroundColor: 'var(--color-bg)',
                          borderColor: '#374151',
                          color: '#fff'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="md:w-1/2 space-y-3 mt-4 md:mt-0">
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
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function mapAccountType(type: string): string {
  const types: Record<string, string> = {
    CHECKING: 'Conta Corrente',
    SAVINGS: 'Poupança',
    CREDIT_CARD: 'Cartão de Crédito',
    INVESTMENT: 'Investimento',
    CASH: 'Dinheiro'
  };

  return types[type] || type;
}
