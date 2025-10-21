// frontend/pages/financial/credit-cards/dashboard.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { PageGuard } from '@/components/ui/AccessGuard';
import { InstallmentModal } from '@/components/financial/InstallmentModal';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Calendar,
  FileText,
  ShoppingBag,
  CheckCircle,
  Clock
} from 'lucide-react';
import api from '@/lib/api';

interface CreditCard {
  id: number;
  financialAccountId: number;
  creditLimit: string;
  usedLimit: string;
  availableLimit: string;
  financialAccount: {
    name: string;
  };
}

interface Invoice {
  id: number;
  referenceMonth: number;
  referenceYear: number;
  dueDate: string;
  totalAmount: string;
  remainingAmount: string;
  status: string;
  isPaid: boolean;
  financialAccount: {
    id: number;
    name: string;
  };
}

interface Installment {
  id: number;
  description: string;
  totalAmount: string;
  numberOfInstallments: number;
  installmentAmount: string;
  purchaseDate: string;
  financialAccount: {
    name: string;
  };
}

function DashboardPageInner() {
  const router = useRouter();
  const { addToast } = useToast();

  const [cards, setCards] = useState<CreditCard[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      // Buscar cartões
      const cardsResponse = await api.get('/financial/credit-cards/company/all');
      setCards(cardsResponse.data);

      // Buscar faturas recentes (não pagas)
      const invoicesPromises = cardsResponse.data.map((card: CreditCard) =>
        api.get(`/financial/credit-cards/${card.financialAccountId}/invoices?status=CLOSED&limit=5`)
          .catch(() => ({ data: [] }))
      );
      const invoicesResponses = await Promise.all(invoicesPromises);
      const allInvoices = invoicesResponses.flatMap(r => r.data);
      setInvoices(allInvoices.filter((inv: Invoice) => !inv.isPaid).slice(0, 5));

      // Buscar parcelamentos ativos
      const installmentsPromises = cardsResponse.data.map((card: CreditCard) =>
        api.get(`/financial/credit-cards/${card.financialAccountId}/installments`)
          .catch(() => ({ data: [] }))
      );
      const installmentsResponses = await Promise.all(installmentsPromises);
      const allInstallments = installmentsResponses.flatMap(r => r.data);
      setInstallments(allInstallments.slice(0, 5));
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar dashboard', 'error');
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

  function formatMonth(month: number, year: number): string {
    const monthNames = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];
    return `${monthNames[month - 1]}/${year}`;
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  const totalLimit = cards.reduce((sum, card) => sum + parseFloat(card.creditLimit), 0);
  const totalUsed = cards.reduce((sum, card) => sum + parseFloat(card.usedLimit), 0);
  const totalAvailable = cards.reduce((sum, card) => sum + parseFloat(card.availableLimit), 0);
  const totalPendingInvoices = invoices.reduce((sum, inv) => sum + parseFloat(inv.remainingAmount), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-text-secondary">Carregando dashboard...</div>
      </div>
    );
  }

  return (
    <>
      <InstallmentModal
        isOpen={showInstallmentModal}
        onClose={() => setShowInstallmentModal(false)}
        onSuccess={() => fetchDashboardData()}
      />

      <div className="p-6">
        <Breadcrumb
          items={[
            { label: 'Financeiro', href: '/financial' },
            { label: 'Cartões de Crédito', href: '/financial/credit-cards' },
            { label: 'Dashboard' }
          ]}
        />

        <div className="mt-6 mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Dashboard de Cartões</h1>
            <p className="text-sm text-text-secondary mt-1">
              Visão geral dos seus cartões de crédito
            </p>
          </div>

          <Button onClick={() => setShowInstallmentModal(true)}>
            <ShoppingBag className="w-4 h-4 mr-2" />
            Nova Compra Parcelada
          </Button>
        </div>

        {/* Cards de Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-text-secondary">Limite Total</p>
              </div>
              <p className="text-2xl font-bold text-text">
                {formatCurrency(totalLimit)}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {cards.length} {cards.length === 1 ? 'cartão' : 'cartões'}
              </p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <p className="text-sm font-medium text-text-secondary">Disponível</p>
              </div>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totalAvailable)}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {((totalAvailable / totalLimit) * 100).toFixed(1)}% do limite
              </p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingDown className="w-5 h-5 text-orange-600" />
                </div>
                <p className="text-sm font-medium text-text-secondary">Utilizado</p>
              </div>
              <p className="text-2xl font-bold text-orange-600">
                {formatCurrency(totalUsed)}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {((totalUsed / totalLimit) * 100).toFixed(1)}% do limite
              </p>
            </div>
          </Card>

          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <p className="text-sm font-medium text-text-secondary">A Pagar</p>
              </div>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(totalPendingInvoices)}
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {invoices.length} {invoices.length === 1 ? 'fatura' : 'faturas'} pendentes
              </p>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Faturas Pendentes */}
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text">Faturas Pendentes</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push('/financial/credit-cards')}
                >
                  Ver todas
                </Button>
              </div>

              {invoices.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
                  <p className="text-text-secondary text-sm">
                    Nenhuma fatura pendente
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="p-4 bg-surface-dark rounded-lg hover:bg-surface transition-colors cursor-pointer"
                      onClick={() => router.push(`/financial/credit-cards/invoices/${invoice.id}`)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-accent" />
                          <span className="font-medium text-text">
                            {invoice.financialAccount.name}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-text">
                          {formatMonth(invoice.referenceMonth, invoice.referenceYear)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-text-secondary">
                          <Calendar className="w-3 h-3" />
                          <span>Vence {formatDate(invoice.dueDate)}</span>
                        </div>
                        <span className="text-lg font-bold text-red-600">
                          {formatCurrency(invoice.remainingAmount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Parcelamentos Ativos */}
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text">Parcelamentos Ativos</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInstallmentModal(true)}
                >
                  Novo
                </Button>
              </div>

              {installments.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingBag className="w-12 h-12 text-text-secondary mx-auto mb-2" />
                  <p className="text-text-secondary text-sm mb-3">
                    Nenhum parcelamento ativo
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setShowInstallmentModal(true)}
                  >
                    Criar Parcelamento
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {installments.map((installment) => (
                    <div
                      key={installment.id}
                      className="p-4 bg-surface-dark rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-medium text-text mb-1">
                            {installment.description}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {installment.financialAccount.name}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-accent">
                            {installment.numberOfInstallments}x
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-secondary">
                          {formatCurrency(installment.installmentAmount)} por mês
                        </span>
                        <span className="text-sm font-medium text-text">
                          Total: {formatCurrency(installment.totalAmount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Cartões - Visão Rápida */}
        {cards.length > 0 && (
          <Card className="mt-6">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-text mb-4">Meus Cartões</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map((card) => {
                  const usagePercent = (parseFloat(card.usedLimit) / parseFloat(card.creditLimit)) * 100;

                  return (
                    <div
                      key={card.id}
                      className="p-4 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg text-white cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => router.push(`/financial/credit-cards/invoices?accountId=${card.financialAccountId}`)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <CreditCard className="w-6 h-6" />
                        <span className="text-xs opacity-80">
                          {usagePercent.toFixed(1)}% usado
                        </span>
                      </div>

                      <p className="text-sm opacity-80 mb-1">
                        {card.financialAccount.name}
                      </p>

                      <p className="text-2xl font-bold mb-3">
                        {formatCurrency(card.availableLimit)}
                      </p>

                      <div className="flex justify-between items-center text-xs opacity-80">
                        <span>Disponível</span>
                        <span>de {formatCurrency(card.creditLimit)}</span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-white/20 rounded-full h-1 mt-2">
                        <div
                          className="bg-white h-1 rounded-full"
                          style={{ width: `${Math.min(usagePercent, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

export default function DashboardPage() {
  return (
    <PageGuard requiredPermissions={[]}>
      <DashboardLayout>
        <DashboardPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
