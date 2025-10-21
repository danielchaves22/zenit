// frontend/pages/financial/credit-cards/invoices.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { PageGuard } from '@/components/ui/AccessGuard';
import {
  ArrowLeft,
  FileText,
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  Eye,
  CreditCard
} from 'lucide-react';
import api from '@/lib/api';

interface Invoice {
  id: number;
  referenceMonth: number;
  referenceYear: number;
  closingDate: string;
  dueDate: string;
  previousBalance: string;
  purchasesAmount: string;
  paymentsAmount: string;
  interestAmount: string;
  feesAmount: string;
  totalAmount: string;
  minimumPayment: string;
  paidAmount: string;
  remainingAmount: string;
  status: 'OPEN' | 'CLOSED' | 'PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'CANCELED';
  isPaid: boolean;
  paidAt: string | null;
  isOverdue: boolean;
}

interface Account {
  id: number;
  name: string;
}

const statusConfig = {
  OPEN: {
    label: 'Aberta',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: Clock
  },
  CLOSED: {
    label: 'Fechada',
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    icon: FileText
  },
  PAID: {
    label: 'Paga',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: CheckCircle
  },
  PARTIALLY_PAID: {
    label: 'Paga Parcialmente',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    icon: AlertCircle
  },
  OVERDUE: {
    label: 'Vencida',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: AlertCircle
  },
  CANCELED: {
    label: 'Cancelada',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    icon: XCircle
  }
};

function InvoicesPageInner() {
  const router = useRouter();
  const { addToast } = useToast();
  const { accountId } = router.query;

  const [account, setAccount] = useState<Account | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    if (accountId) {
      fetchData();
    }
  }, [accountId, filterStatus]);

  async function fetchData() {
    if (!accountId) return;

    setLoading(true);
    try {
      // Buscar conta
      const accountResponse = await api.get(`/financial/accounts/${accountId}`);
      setAccount(accountResponse.data);

      // Buscar faturas
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);

      const invoicesResponse = await api.get(
        `/financial/credit-cards/${accountId}/invoices?${params}`
      );
      setInvoices(invoicesResponse.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar faturas', 'error');
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
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${monthNames[month - 1]} ${year}`;
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR');
  }

  function getStatusBadge(status: Invoice['status']) {
    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-text-secondary">Carregando faturas...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <Breadcrumb
        items={[
          { label: 'Financeiro', href: '/financial' },
          { label: 'Cartões de Crédito', href: '/financial/credit-cards' },
          { label: 'Faturas' }
        ]}
      />

      <div className="mt-6 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => router.push('/financial/credit-cards')}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text">Faturas do Cartão</h1>
            {account && (
              <p className="text-sm text-text-secondary mt-1">
                {account.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="p-4">
          <div className="flex gap-4 items-center">
            <label className="text-sm font-medium text-text">Filtrar por status:</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-surface border border-border rounded-md text-text text-sm"
            >
              <option value="">Todos</option>
              <option value="OPEN">Aberta</option>
              <option value="CLOSED">Fechada</option>
              <option value="PAID">Paga</option>
              <option value="PARTIALLY_PAID">Paga Parcialmente</option>
              <option value="OVERDUE">Vencida</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Lista de Faturas */}
      {invoices.length === 0 ? (
        <Card>
          <div className="p-12 text-center">
            <FileText className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <p className="text-text-secondary">
              Nenhuma fatura encontrada
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {invoices.map((invoice) => (
            <Card key={invoice.id} className="hover:shadow-lg transition-shadow">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-accent/10 rounded-lg">
                      <CreditCard className="w-6 h-6 text-accent" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-text">
                        {formatMonth(invoice.referenceMonth, invoice.referenceYear)}
                      </h3>
                      <p className="text-sm text-text-secondary">
                        Fatura #{invoice.id}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {getStatusBadge(invoice.status)}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-xs text-text-secondary mb-1">Valor Total</p>
                    <p className="text-lg font-bold text-text">
                      {formatCurrency(invoice.totalAmount)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-text-secondary mb-1">Valor Pago</p>
                    <p className="text-lg font-semibold text-green-600">
                      {formatCurrency(invoice.paidAmount)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-text-secondary mb-1">Saldo Devedor</p>
                    <p className={`text-lg font-semibold ${parseFloat(invoice.remainingAmount) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(invoice.remainingAmount)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-text-secondary mb-1">Pagamento Mínimo</p>
                    <p className="text-lg font-medium text-orange-600">
                      {formatCurrency(invoice.minimumPayment)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 mb-4 text-sm text-text-secondary">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>Fechamento: {formatDate(invoice.closingDate)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>Vencimento: {formatDate(invoice.dueDate)}</span>
                  </div>
                  {invoice.paidAt && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>Pago em: {formatDate(invoice.paidAt)}</span>
                    </div>
                  )}
                </div>

                {/* Breakdown de valores */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 p-3 bg-surface-dark rounded-lg text-sm">
                  <div>
                    <span className="text-text-secondary">Compras:</span>
                    <span className="ml-2 font-medium text-text">
                      {formatCurrency(invoice.purchasesAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Juros:</span>
                    <span className="ml-2 font-medium text-text">
                      {formatCurrency(invoice.interestAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Taxas:</span>
                    <span className="ml-2 font-medium text-text">
                      {formatCurrency(invoice.feesAmount)}
                    </span>
                  </div>
                  <div>
                    <span className="text-text-secondary">Saldo Anterior:</span>
                    <span className="ml-2 font-medium text-text">
                      {formatCurrency(invoice.previousBalance)}
                    </span>
                  </div>
                </div>

                {/* Botões de Ação */}
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => router.push(`/financial/credit-cards/invoices/${invoice.id}`)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Ver Detalhes
                  </Button>

                  {!invoice.isPaid && parseFloat(invoice.remainingAmount) > 0 && (
                    <Button
                      size="sm"
                      onClick={() => router.push(`/financial/credit-cards/invoices/${invoice.id}/payment`)}
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      Pagar Fatura
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <PageGuard requiredPermissions={[]}>
      <DashboardLayout>
        <InvoicesPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
