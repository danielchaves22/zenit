// frontend/pages/financial/credit-cards/index.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { PageGuard } from '@/components/ui/AccessGuard';
import {
  CreditCard,
  Settings,
  FileText,
  DollarSign,
  TrendingUp,
  AlertCircle,
  Plus,
  Eye
} from 'lucide-react';
import api from '@/lib/api';

interface CreditCard {
  id: number;
  financialAccountId: number;
  creditLimit: string;
  usedLimit: string;
  availableLimit: string;
  closingDay: number;
  dueDay: number;
  interestRate: string | null;
  minimumPaymentPercent: string;
  enableLimitAlerts: boolean;
  alertLimitPercent: string;
  isActive: boolean;
  financialAccount: {
    id: number;
    name: string;
    balance: string;
    isActive: boolean;
  };
}

function CreditCardsPageInner() {
  const router = useRouter();
  const { addToast } = useToast();

  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCards();
  }, []);

  async function fetchCards() {
    setLoading(true);
    try {
      const response = await api.get('/financial/credit-cards/company/all');
      setCards(response.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar cartões', 'error');
    } finally {
      setLoading(false);
    }
  }

  function formatCurrency(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return num.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function calculateUsagePercent(used: string, total: string): number {
    const usedNum = parseFloat(used);
    const totalNum = parseFloat(total);
    if (totalNum === 0) return 0;
    return (usedNum / totalNum) * 100;
  }

  function getUsageColor(percent: number, alertPercent: number): string {
    if (percent >= alertPercent) return 'bg-red-500';
    if (percent >= alertPercent * 0.8) return 'bg-yellow-500';
    return 'bg-green-500';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-text-secondary">Carregando cartões...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Breadcrumb
        items={[
          { label: 'Financeiro', href: '/financial' },
          { label: 'Cartões de Crédito' }
        ]}
      />

      <div className="mt-6 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Cartões de Crédito</h1>
          <p className="text-sm text-text-secondary mt-1">
            Gerencie seus cartões de crédito e faturas
          </p>
        </div>

        <Button onClick={() => router.push('/financial/accounts')}>
          <Plus className="w-4 h-4 mr-2" />
          Adicionar Cartão
        </Button>
      </div>

      {cards.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <CreditCard className="w-16 h-16 text-text-secondary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text mb-2">
              Nenhum cartão de crédito configurado
            </h3>
            <p className="text-text-secondary mb-6">
              Crie uma conta do tipo &quot;Cartão de Crédito&quot; e configure os detalhes para começar
            </p>
            <Button onClick={() => router.push('/financial/accounts')}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Cartão de Crédito
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const usagePercent = calculateUsagePercent(card.usedLimit, card.creditLimit);
            const alertPercent = parseFloat(card.alertLimitPercent);
            const isNearLimit = usagePercent >= alertPercent;

            return (
              <Card
                key={card.id}
                className="hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg">
                        <CreditCard className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-text">
                          {card.financialAccount.name}
                        </h3>
                        <p className="text-xs text-text-secondary">
                          Fechamento dia {card.closingDay}
                        </p>
                      </div>
                    </div>

                    {isNearLimit && card.enableLimitAlerts && (
                      <div className="p-1 bg-red-100 rounded-full">
                        <AlertCircle className="w-5 h-5 text-red-600" />
                      </div>
                    )}
                  </div>

                  {/* Limite */}
                  <div className="mb-4">
                    <div className="flex justify-between items-end mb-2">
                      <div>
                        <p className="text-xs text-text-secondary mb-1">Limite Disponível</p>
                        <p className="text-2xl font-bold text-text">
                          {formatCurrency(card.availableLimit)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-text-secondary">de {formatCurrency(card.creditLimit)}</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-surface-dark rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getUsageColor(usagePercent, alertPercent)}`}
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-text-secondary">
                        {usagePercent.toFixed(1)}% utilizado
                      </p>
                      <p className="text-xs text-text-secondary">
                        Usado: {formatCurrency(card.usedLimit)}
                      </p>
                    </div>
                  </div>

                  {/* Informações */}
                  <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-surface-dark rounded-lg text-sm">
                    <div>
                      <p className="text-xs text-text-secondary mb-1">Vencimento</p>
                      <p className="text-text font-medium">Dia {card.dueDay}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary mb-1">Juros</p>
                      <p className="text-text font-medium">
                        {card.interestRate ? `${parseFloat(card.interestRate).toFixed(2)}%` : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary mb-1">Pag. Mínimo</p>
                      <p className="text-text font-medium">
                        {parseFloat(card.minimumPaymentPercent).toFixed(0)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-secondary mb-1">Status</p>
                      <p className={`font-medium ${card.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                        {card.isActive ? 'Ativo' : 'Inativo'}
                      </p>
                    </div>
                  </div>

                  {/* Alertas */}
                  {isNearLimit && card.enableLimitAlerts && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-800">
                        <AlertCircle className="w-4 h-4" />
                        <p className="text-xs font-medium">
                          Limite próximo de {alertPercent.toFixed(0)}%
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/financial/credit-cards/invoices?accountId=${card.financialAccountId}`)}
                      className="w-full"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      Faturas
                    </Button>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/financial/credit-cards/config?accountId=${card.financialAccountId}`)}
                      className="w-full"
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Config
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cards de Resumo (se houver cartões) */}
      {cards.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-sm text-text-secondary">Total de Cartões</p>
              </div>
              <p className="text-3xl font-bold text-text">{cards.length}</p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-sm text-text-secondary">Limite Total</p>
              </div>
              <p className="text-3xl font-bold text-text">
                {formatCurrency(
                  cards.reduce((sum, card) => sum + parseFloat(card.creditLimit), 0)
                )}
              </p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <DollarSign className="w-5 h-5 text-orange-600" />
                </div>
                <p className="text-sm text-text-secondary">Total Utilizado</p>
              </div>
              <p className="text-3xl font-bold text-text">
                {formatCurrency(
                  cards.reduce((sum, card) => sum + parseFloat(card.usedLimit), 0)
                )}
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function CreditCardsPage() {
  return (
    <PageGuard requiredPermissions={[]}>
      <DashboardLayout>
        <CreditCardsPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
