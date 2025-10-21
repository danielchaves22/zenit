// frontend/pages/financial/credit-cards/invoices/[invoiceId]/payment.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { PageGuard } from '@/components/ui/AccessGuard';
import { ArrowLeft, DollarSign, CheckCircle, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';

interface Invoice {
  id: number;
  referenceMonth: number;
  referenceYear: number;
  dueDate: string;
  totalAmount: string;
  minimumPayment: string;
  remainingAmount: string;
  financialAccount: {
    id: number;
    name: string;
  };
}

interface Account {
  id: number;
  name: string;
  type: string;
  balance: string;
}

type PaymentType = 'full' | 'minimum' | 'partial';

function PaymentPageInner() {
  const router = useRouter();
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  const { invoiceId } = router.query;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);

  const [paymentType, setPaymentType] = useState<PaymentType>('full');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [partialAmount, setPartialAmount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (invoiceId) {
      fetchData();
    }
  }, [invoiceId]);

  async function fetchData() {
    if (!invoiceId) return;

    setLoading(true);
    try {
      // Buscar fatura
      const invoiceResponse = await api.get(`/financial/credit-cards/invoices/${invoiceId}`);
      setInvoice(invoiceResponse.data);

      // Buscar contas disponíveis (exceto cartões de crédito)
      const accountsResponse = await api.get('/financial/accounts');
      const availableAccounts = accountsResponse.data.filter(
        (acc: Account) => acc.type !== 'CREDIT_CARD' && acc.id !== invoiceResponse.data.financialAccount.id
      );
      setAccounts(availableAccounts);

      // Selecionar primeira conta por padrão
      if (availableAccounts.length > 0) {
        setSelectedAccountId(availableAccounts[0].id.toString());
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar dados', 'error');
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

  function getPaymentAmount(): number {
    if (!invoice) return 0;

    switch (paymentType) {
      case 'full':
        return parseFloat(invoice.remainingAmount);
      case 'minimum':
        return parseFloat(invoice.minimumPayment);
      case 'partial':
        return parseFloat(partialAmount || '0');
      default:
        return 0;
    }
  }

  function validatePayment(): { valid: boolean; error?: string } {
    if (!selectedAccountId) {
      return { valid: false, error: 'Selecione uma conta para pagamento' };
    }

    if (!invoice) {
      return { valid: false, error: 'Fatura não encontrada' };
    }

    const paymentAmount = getPaymentAmount();
    const minimumPayment = parseFloat(invoice.minimumPayment);
    const totalAmount = parseFloat(invoice.remainingAmount);

    if (paymentAmount <= 0) {
      return { valid: false, error: 'Valor de pagamento inválido' };
    }

    if (paymentType === 'partial') {
      if (paymentAmount < minimumPayment) {
        return {
          valid: false,
          error: `Valor mínimo para pagamento parcial: ${formatCurrency(minimumPayment)}`
        };
      }

      if (paymentAmount > totalAmount) {
        return {
          valid: false,
          error: `Valor não pode ser maior que o total: ${formatCurrency(totalAmount)}`
        };
      }
    }

    return { valid: true };
  }

  async function handlePayment() {
    const validation = validatePayment();
    if (!validation.valid) {
      addToast(validation.error || 'Erro na validação', 'error');
      return;
    }

    if (!invoice || !selectedAccountId) return;

    const paymentAmount = getPaymentAmount();
    const selectedAccount = accounts.find(acc => acc.id.toString() === selectedAccountId);

    confirmation.confirm(
      {
        title: 'Confirmar Pagamento',
        message: `Confirma o pagamento de ${formatCurrency(paymentAmount)} da fatura de ${formatMonth(invoice.referenceMonth, invoice.referenceYear)}?`,
        confirmText: 'Confirmar Pagamento',
        cancelText: 'Cancelar',
        type: 'info'
      },
      async () => {
        setPaying(true);
        try {
          const paymentData = {
            fromAccountId: parseInt(selectedAccountId),
            paymentDate: new Date().toISOString(),
            notes
          };

          let endpoint = '';
          let body: any = paymentData;

          switch (paymentType) {
            case 'full':
              endpoint = `/financial/credit-cards/invoices/${invoiceId}/payments/full`;
              break;
            case 'minimum':
              endpoint = `/financial/credit-cards/invoices/${invoiceId}/payments/minimum`;
              break;
            case 'partial':
              endpoint = `/financial/credit-cards/invoices/${invoiceId}/payments/partial`;
              body = { ...paymentData, amount: paymentAmount };
              break;
          }

          await api.post(endpoint, body);

          addToast('Pagamento realizado com sucesso!', 'success');
          router.push(`/financial/credit-cards/invoices/${invoiceId}`);
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao processar pagamento', 'error');
          throw error;
        } finally {
          setPaying(false);
        }
      }
    );
  }

  if (loading || !invoice) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-text-secondary">Carregando...</div>
      </div>
    );
  }

  const paymentAmount = getPaymentAmount();
  const remainingAfterPayment = parseFloat(invoice.remainingAmount) - paymentAmount;

  return (
    <>
      <ConfirmationModal />
      <div className="p-6 max-w-3xl mx-auto">
        <Breadcrumb
          items={[
            { label: 'Financeiro', href: '/financial' },
            { label: 'Cartões de Crédito', href: '/financial/credit-cards' },
            { label: 'Faturas', href: `/financial/credit-cards/invoices?accountId=${invoice.financialAccount.id}` },
            { label: 'Detalhes', href: `/financial/credit-cards/invoices/${invoiceId}` },
            { label: 'Pagamento' }
          ]}
        />

        <div className="mt-6 mb-6 flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text">Pagar Fatura</h1>
            <p className="text-sm text-text-secondary mt-1">
              {formatMonth(invoice.referenceMonth, invoice.referenceYear)} - {invoice.financialAccount.name}
            </p>
          </div>
        </div>

        {/* Resumo da Fatura */}
        <Card className="mb-6">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-text mb-4">Resumo da Fatura</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-text-secondary mb-1">Valor Total</p>
                <p className="text-xl font-bold text-text">
                  {formatCurrency(invoice.remainingAmount)}
                </p>
              </div>

              <div>
                <p className="text-xs text-text-secondary mb-1">Pagamento Mínimo</p>
                <p className="text-xl font-bold text-orange-600">
                  {formatCurrency(invoice.minimumPayment)}
                </p>
              </div>

              <div>
                <p className="text-xs text-text-secondary mb-1">Vencimento</p>
                <p className="text-text font-medium">
                  {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Tipo de Pagamento */}
        <Card className="mb-6">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-text mb-4">Tipo de Pagamento</h2>

            <div className="space-y-3">
              {/* Pagamento Total */}
              <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                paymentType === 'full' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
              }`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="paymentType"
                    value="full"
                    checked={paymentType === 'full'}
                    onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium text-text">Pagamento Total</p>
                    <p className="text-sm text-text-secondary">
                      Pagar o valor total da fatura
                    </p>
                  </div>
                </div>
                <p className="text-lg font-bold text-accent">
                  {formatCurrency(invoice.remainingAmount)}
                </p>
              </label>

              {/* Pagamento Mínimo */}
              <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-all ${
                paymentType === 'minimum' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
              }`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="paymentType"
                    value="minimum"
                    checked={paymentType === 'minimum'}
                    onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium text-text">Pagamento Mínimo</p>
                    <p className="text-sm text-text-secondary">
                      Pagar apenas o valor mínimo (incide juros)
                    </p>
                  </div>
                </div>
                <p className="text-lg font-bold text-orange-600">
                  {formatCurrency(invoice.minimumPayment)}
                </p>
              </label>

              {/* Pagamento Parcial */}
              <label className={`flex items-col p-4 border-2 rounded-lg cursor-pointer transition-all ${
                paymentType === 'partial' ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <input
                    type="radio"
                    name="paymentType"
                    value="partial"
                    checked={paymentType === 'partial'}
                    onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                    className="w-4 h-4"
                  />
                  <div>
                    <p className="font-medium text-text">Pagamento Parcial</p>
                    <p className="text-sm text-text-secondary">
                      Pagar um valor personalizado (mínimo: {formatCurrency(invoice.minimumPayment)})
                    </p>
                  </div>
                </div>

                {paymentType === 'partial' && (
                  <div className="ml-7 mt-2">
                    <label className="block text-sm font-medium text-text mb-2">
                      Valor a Pagar
                    </label>
                    <CurrencyInput
                      value={partialAmount}
                      onChange={setPartialAmount}
                      placeholder="Digite o valor"
                    />
                  </div>
                )}
              </label>
            </div>
          </div>
        </Card>

        {/* Conta de Pagamento */}
        <Card className="mb-6">
          <div className="p-6">
            <h2 className="text-lg font-semibold text-text mb-4">Conta de Pagamento</h2>

            {accounts.length === 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-2 text-yellow-800">
                  <AlertTriangle className="w-5 h-5" />
                  <p className="text-sm">
                    Nenhuma conta disponível para pagamento. Crie uma conta primeiro.
                  </p>
                </div>
              </div>
            ) : (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text"
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} - {formatCurrency(account.balance)}
                  </option>
                ))}
              </select>
            )}

            <div className="mt-4">
              <label className="block text-sm font-medium text-text mb-2">
                Observações (opcional)
              </label>
              <Input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Digite observações sobre o pagamento"
              />
            </div>
          </div>
        </Card>

        {/* Resumo do Pagamento */}
        {paymentAmount > 0 && (
          <Card className="mb-6 bg-accent/5 border-accent">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-text mb-4">Resumo do Pagamento</h2>

              <div className="space-y-2">
                <div className="flex justify-between text-text">
                  <span>Valor a Pagar:</span>
                  <span className="font-bold text-xl">{formatCurrency(paymentAmount)}</span>
                </div>

                {remainingAfterPayment > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Saldo Devedor Restante:</span>
                    <span className="font-semibold">{formatCurrency(remainingAfterPayment)}</span>
                  </div>
                )}

                {remainingAfterPayment <= 0 && (
                  <div className="flex items-center gap-2 text-green-600 mt-2">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Fatura será quitada completamente</span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Botões de Ação */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="secondary"
            onClick={() => router.back()}
            disabled={paying}
          >
            Cancelar
          </Button>

          <Button
            onClick={handlePayment}
            disabled={paying || accounts.length === 0 || paymentAmount <= 0}
          >
            <DollarSign className="w-4 h-4 mr-2" />
            {paying ? 'Processando...' : 'Confirmar Pagamento'}
          </Button>
        </div>
      </div>
    </>
  );
}

export default function PaymentPage() {
  return (
    <PageGuard requiredPermissions={[]}>
      <DashboardLayout>
        <PaymentPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
