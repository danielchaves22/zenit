// frontend/pages/financial/credit-cards/invoices/[invoiceId].tsx
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
  Download,
  DollarSign,
  Calendar,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Tag,
  CheckCircle,
  Clock
} from 'lucide-react';
import api from '@/lib/api';

interface Transaction {
  id: number;
  description: string;
  amount: string;
  date: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  category?: {
    id: number;
    name: string;
    color: string;
  };
  isInstallment: boolean;
  installmentInfo?: {
    id: number;
    description: string;
    numberOfInstallments: number;
  };
}

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
  status: string;
  isPaid: boolean;
  financialAccount: {
    id: number;
    name: string;
  };
}

interface Payment {
  id: number;
  amount: string;
  paymentType: 'FULL_PAYMENT' | 'MINIMUM_PAYMENT' | 'PARTIAL_PAYMENT';
  paymentDate: string;
  notes?: string;
  createdByUser: {
    name: string;
  };
}

function InvoiceDetailsPageInner() {
  const router = useRouter();
  const { addToast } = useToast();
  const { invoiceId } = router.query;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoiceDetails();
    }
  }, [invoiceId]);

  async function fetchInvoiceDetails() {
    if (!invoiceId) return;

    setLoading(true);
    try {
      // Buscar fatura
      const invoiceResponse = await api.get(`/financial/credit-cards/invoices/${invoiceId}`);
      setInvoice(invoiceResponse.data);

      // Buscar transações da fatura
      const transactionsResponse = await api.get(
        `/financial/credit-cards/invoices/${invoiceId}/transactions`
      );
      setTransactions(transactionsResponse.data);

      // Buscar pagamentos da fatura
      const paymentsResponse = await api.get(
        `/financial/credit-cards/invoices/${invoiceId}/payments`
      );
      setPayments(paymentsResponse.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar detalhes', 'error');
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

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR');
  }

  function formatMonth(month: number, year: number): string {
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    return `${monthNames[month - 1]} ${year}`;
  }

  const paymentTypeLabels = {
    FULL_PAYMENT: 'Pagamento Total',
    MINIMUM_PAYMENT: 'Pagamento Mínimo',
    PARTIAL_PAYMENT: 'Pagamento Parcial'
  };

  if (loading || !invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-text-secondary">Carregando detalhes...</div>
      </div>
    );
  }

  const expenses = transactions.filter(t => t.type === 'EXPENSE');
  const income = transactions.filter(t => t.type === 'INCOME');

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Breadcrumb
        items={[
          { label: 'Financeiro', href: '/financial' },
          { label: 'Cartões de Crédito', href: '/financial/credit-cards' },
          { label: 'Faturas', href: `/financial/credit-cards/invoices?accountId=${invoice.financialAccount.id}` },
          { label: 'Detalhes da Fatura' }
        ]}
      />

      <div className="mt-6 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text">
              Fatura de {formatMonth(invoice.referenceMonth, invoice.referenceYear)}
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              {invoice.financialAccount.name}
            </p>
          </div>
        </div>

        <Button variant="secondary">
          <Download className="w-4 h-4 mr-2" />
          Exportar PDF
        </Button>
      </div>

      {/* Resumo da Fatura */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <div className="p-4">
            <p className="text-xs text-text-secondary mb-1">Valor Total</p>
            <p className="text-2xl font-bold text-text">
              {formatCurrency(invoice.totalAmount)}
            </p>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <p className="text-xs text-text-secondary mb-1">Pagamento Mínimo</p>
            <p className="text-2xl font-bold text-orange-600">
              {formatCurrency(invoice.minimumPayment)}
            </p>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <p className="text-xs text-text-secondary mb-1">Valor Pago</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(invoice.paidAmount)}
            </p>
          </div>
        </Card>

        <Card>
          <div className="p-4">
            <p className="text-xs text-text-secondary mb-1">Saldo Devedor</p>
            <p className={`text-2xl font-bold ${parseFloat(invoice.remainingAmount) > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(invoice.remainingAmount)}
            </p>
          </div>
        </Card>
      </div>

      {/* Informações da Fatura */}
      <Card className="mb-6">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-text mb-4">Informações da Fatura</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-sm text-text-secondary mb-1">Data de Fechamento</p>
              <p className="text-text font-medium">{formatDate(invoice.closingDate)}</p>
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-1">Data de Vencimento</p>
              <p className="text-text font-medium">{formatDate(invoice.dueDate)}</p>
            </div>
            <div>
              <p className="text-sm text-text-secondary mb-1">Status</p>
              <p className={`font-medium ${invoice.isPaid ? 'text-green-600' : 'text-orange-600'}`}>
                {invoice.isPaid ? 'Paga' : 'Pendente'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-surface-dark rounded-lg">
            <div>
              <p className="text-xs text-text-secondary mb-1">Saldo Anterior</p>
              <p className="text-text font-medium">{formatCurrency(invoice.previousBalance)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">Compras</p>
              <p className="text-text font-medium">{formatCurrency(invoice.purchasesAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">Juros</p>
              <p className="text-text font-medium">{formatCurrency(invoice.interestAmount)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary mb-1">Taxas</p>
              <p className="text-text font-medium">{formatCurrency(invoice.feesAmount)}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Transações */}
      <Card className="mb-6">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-text mb-4">
            Transações ({transactions.length})
          </h2>

          {transactions.length === 0 ? (
            <p className="text-text-secondary text-center py-8">
              Nenhuma transação nesta fatura
            </p>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between p-4 bg-surface-dark rounded-lg hover:bg-surface transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${transaction.type === 'EXPENSE' ? 'bg-red-100' : 'bg-green-100'}`}>
                      {transaction.type === 'EXPENSE' ? (
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      ) : (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      )}
                    </div>

                    <div className="flex-1">
                      <p className="text-text font-medium">
                        {transaction.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-text-secondary mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(transaction.date)}
                        </span>
                        {transaction.category && (
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {transaction.category.name}
                          </span>
                        )}
                        {transaction.isInstallment && transaction.installmentInfo && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <ShoppingBag className="w-3 h-3" />
                            Parcelamento
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className={`text-lg font-bold ${transaction.type === 'EXPENSE' ? 'text-red-600' : 'text-green-600'}`}>
                      {transaction.type === 'EXPENSE' ? '-' : '+'} {formatCurrency(transaction.amount)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Pagamentos */}
      {payments.length > 0 && (
        <Card className="mb-6">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-text mb-4">
              Pagamentos Realizados ({payments.length})
            </h2>

            <div className="space-y-3">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-4 bg-green-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="text-text font-medium">
                        {paymentTypeLabels[payment.paymentType]}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {formatDate(payment.paymentDate)} • Por {payment.createdByUser.name}
                      </p>
                      {payment.notes && (
                        <p className="text-xs text-text-secondary mt-1">
                          {payment.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-lg font-bold text-green-600">
                    {formatCurrency(payment.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Botão de Pagamento */}
      {!invoice.isPaid && parseFloat(invoice.remainingAmount) > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() => router.push(`/financial/credit-cards/invoices/${invoiceId}/payment`)}
            size="lg"
          >
            <DollarSign className="w-5 h-5 mr-2" />
            Pagar Fatura
          </Button>
        </div>
      )}
    </div>
  );
}

export default function InvoiceDetailsPage() {
  return (
    <PageGuard requiredPermissions={[]}>
      <DashboardLayout>
        <InvoiceDetailsPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
