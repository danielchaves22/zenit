import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import { useToast } from '@/components/ui/ToastContext';
import { CreditCard, Edit2, Receipt } from 'lucide-react';
import api from '@/lib/api';
import { formatTransactionDescription } from '@/utils/transactions';
import {
  getAvailableCreditLimit,
  getInvoiceDisplayStatusClasses,
  getInvoiceDisplayStatusLabel,
  getInvoiceReferenceLabel,
  getUsedCreditLimit
} from '@/utils/creditCards';

interface PaymentTransaction {
  id: number;
  description: string;
  status: string;
  effectiveDate?: string | null;
  date?: string | null;
  amount: string;
  fromAccount?: {
    id: number;
    name: string;
  } | null;
}

interface CreditCardInvoiceListItem {
  id: number;
  referenceYear: number;
  referenceMonth: number;
  closingDate: string;
  dueDate: string;
  totalAmount: string;
  status: string;
  displayStatus?: string;
  itemCount: number;
  paymentTransaction?: PaymentTransaction | null;
}

interface CreditCardAccount {
  id: number;
  name: string;
  balance: string;
  bankName?: string | null;
  accountNumber?: string | null;
  creditLimit?: string | null;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
}

interface InvoiceTransactionItem {
  id: number;
  description: string;
  amount: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  dueDate?: string | null;
  category?: {
    id: number;
    name: string;
    color: string;
  } | null;
}

interface CreditCardInvoiceDetail extends CreditCardInvoiceListItem {
  account: CreditCardAccount;
  transactions: InvoiceTransactionItem[];
  paymentTransaction?: PaymentTransaction | null;
}

interface FinancialAccount {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function InvoicesPageInner() {
  const router = useRouter();
  const { addToast } = useToast();
  const accountId = Number(router.query.accountId);
  const selectedInvoiceFromQuery = Number(router.query.invoiceId);

  const [card, setCard] = useState<CreditCardAccount | null>(null);
  const [invoices, setInvoices] = useState<CreditCardInvoiceListItem[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<CreditCardInvoiceDetail | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [payerAccounts, setPayerAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentData, setPaymentData] = useState({
    fromAccountId: '',
    paymentDate: new Date().toISOString().split('T')[0],
    notes: ''
  });

  const availableLimit = useMemo(
    () => (card ? getAvailableCreditLimit(card) : null),
    [card]
  );
  const usedLimit = useMemo(
    () => (card ? getUsedCreditLimit(card) : 0),
    [card]
  );

  useEffect(() => {
    if (!router.isReady || Number.isNaN(accountId)) {
      return;
    }

    void fetchPageData();
  }, [accountId, router.isReady]);

  useEffect(() => {
    if (!selectedInvoiceId) {
      setInvoiceDetail(null);
      return;
    }

    void fetchInvoiceDetail(selectedInvoiceId);
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (!selectedInvoiceFromQuery || selectedInvoiceFromQuery === selectedInvoiceId) {
      return;
    }

    setSelectedInvoiceId(selectedInvoiceFromQuery);
  }, [selectedInvoiceFromQuery, selectedInvoiceId]);

  async function fetchPageData(preferredInvoiceId?: number) {
    setLoading(true);

    try {
      const [cardsResponse, invoicesResponse, accountsResponse] = await Promise.all([
        api.get('/financial/credit-cards'),
        api.get(`/financial/credit-cards/${accountId}/invoices`),
        api.get('/financial/accounts')
      ]);

      const nextCard = (cardsResponse.data || []).find((item: CreditCardAccount) => item.id === accountId) || null;
      const nextInvoices = invoicesResponse.data || [];
      const nextPayerAccounts = (accountsResponse.data || []).filter(
        (item: FinancialAccount) =>
          item.isActive &&
          item.id !== accountId &&
          item.type !== 'CREDIT_CARD'
      );

      setCard(nextCard);
      setInvoices(nextInvoices);
      setPayerAccounts(nextPayerAccounts);

      const nextSelectedInvoiceId =
        preferredInvoiceId ||
        (selectedInvoiceFromQuery > 0 ? selectedInvoiceFromQuery : null) ||
        nextInvoices[0]?.id ||
        null;

      setSelectedInvoiceId(nextSelectedInvoiceId);
      setPaymentData((prev) => ({
        ...prev,
        fromAccountId: prev.fromAccountId || nextPayerAccounts[0]?.id?.toString() || ''
      }));
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar faturas do cartão', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchInvoiceDetail(invoiceId: number) {
    setDetailLoading(true);

    try {
      const response = await api.get(`/financial/credit-card-invoices/${invoiceId}`);
      setInvoiceDetail(response.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar detalhes da fatura', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePayInvoice() {
    if (!selectedInvoiceId) {
      addToast('Selecione uma fatura para pagar', 'error');
      return;
    }

    if (!paymentData.fromAccountId) {
      addToast('Selecione a conta pagadora', 'error');
      return;
    }

    setPaying(true);

    try {
      await api.post(`/financial/credit-card-invoices/${selectedInvoiceId}/pay`, {
        fromAccountId: Number(paymentData.fromAccountId),
        paymentDate: paymentData.paymentDate ? new Date(paymentData.paymentDate).toISOString() : undefined,
        notes: paymentData.notes || undefined
      });

      addToast('Fatura paga com sucesso', 'success');
      await fetchPageData(selectedInvoiceId);
      await fetchInvoiceDetail(selectedInvoiceId);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao pagar fatura', 'error');
    } finally {
      setPaying(false);
    }
  }

  function handleSelectInvoice(invoiceId: number) {
    setSelectedInvoiceId(invoiceId);
    router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          invoiceId
        }
      },
      undefined,
      { shallow: true }
    );
  }

  return (
    <DashboardLayout title={card ? `Faturas de ${card.name}` : 'Faturas do Cartão'}>
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
          { label: card?.name || 'Faturas' }
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            {card ? `Faturas de ${card.name}` : 'Faturas do Cartão'}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            Pagamento integral, itens da fatura e histórico de compras agrupadas.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/financial/credit-cards">
            <Button variant="outline" className="flex items-center gap-2">
              <CreditCard size={16} />
              Todos os Cartões
            </Button>
          </Link>
          <Link href={`/financial/credit-cards/${accountId}`}>
            <Button variant="outline" className="flex items-center gap-2">
              <Edit2 size={16} />
              Editar Cartão
            </Button>
          </Link>
          <Link href={`/financial/transactions/new-credit-card-purchase?cardId=${accountId}`}>
            <Button variant="accent" className="flex items-center gap-2">
              <Receipt size={16} />
              Nova Compra
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card>
            <div className="h-80 animate-pulse rounded bg-[#1b212c]" />
          </Card>
          <Card className="lg:col-span-2">
            <div className="h-80 animate-pulse rounded bg-[#1b212c]" />
          </Card>
        </div>
      ) : (
        <>
          {card && (
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card>
                <div className="text-xs uppercase tracking-wide text-gray-400">Limite total</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {card.creditLimit ? formatCurrency(card.creditLimit) : 'Não configurado'}
                </div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-gray-400">Usado</div>
                <div className="mt-2 text-xl font-semibold text-white">{formatCurrency(usedLimit)}</div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-gray-400">Disponível</div>
                <div className={`mt-2 text-xl font-semibold ${availableLimit !== null && availableLimit < 0 ? 'text-orange-300' : 'text-white'}`}>
                  {availableLimit === null ? 'Não configurado' : formatCurrency(availableLimit)}
                </div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-gray-400">Ciclo</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {card.statementClosingDay || '-'} / {card.statementDueDay || '-'}
                </div>
                <div className="mt-1 text-xs text-gray-400">Fechamento / vencimento</div>
              </Card>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Faturas</h2>
                <span className="text-sm text-gray-400">{invoices.length}</span>
              </div>

              <div className="space-y-3">
                {invoices.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">
                    Nenhuma fatura encontrada para este cartão.
                  </div>
                ) : (
                  invoices.map((invoice) => {
                    const isSelected = invoice.id === selectedInvoiceId;
                    const displayStatus = invoice.displayStatus || invoice.status;

                    return (
                      <button
                        key={invoice.id}
                        type="button"
                        onClick={() => handleSelectInvoice(invoice.id)}
                        className={`w-full rounded-xl border p-4 text-left transition-colors ${
                          isSelected
                            ? 'border-accent bg-accent/10'
                            : 'border-gray-700 bg-[#11161d] hover:border-accent/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-white">
                              {getInvoiceReferenceLabel(invoice.referenceYear, invoice.referenceMonth)}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              Fecha {new Date(invoice.closingDate).toLocaleDateString('pt-BR')} • vence{' '}
                              {new Date(invoice.dueDate).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${getInvoiceDisplayStatusClasses(displayStatus)}`}>
                            {getInvoiceDisplayStatusLabel(displayStatus)}
                          </span>
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-wide text-gray-400">Valor</div>
                            <div className="mt-1 text-lg font-semibold text-white">
                              {formatCurrency(invoice.totalAmount)}
                            </div>
                          </div>
                          <div className="text-right text-xs text-gray-400">
                            {invoice.itemCount} item{invoice.itemCount === 1 ? '' : 's'}
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </Card>

            <Card className="lg:col-span-2">
              {detailLoading ? (
                <div className="h-80 animate-pulse rounded bg-[#1b212c]" />
              ) : !invoiceDetail ? (
                <div className="py-12 text-center text-gray-400">
                  Selecione uma fatura para visualizar os detalhes.
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-white">
                        Fatura {getInvoiceReferenceLabel(invoiceDetail.referenceYear, invoiceDetail.referenceMonth)}
                      </h2>
                      <div className="mt-1 text-sm text-gray-400">
                        Fechamento {new Date(invoiceDetail.closingDate).toLocaleDateString('pt-BR')} • vencimento{' '}
                        {new Date(invoiceDetail.dueDate).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-sm font-medium ${getInvoiceDisplayStatusClasses(invoiceDetail.displayStatus || invoiceDetail.status)}`}>
                      {getInvoiceDisplayStatusLabel(invoiceDetail.displayStatus || invoiceDetail.status)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Valor total</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {formatCurrency(invoiceDetail.totalAmount)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Itens</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {invoiceDetail.transactions.length}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Conta</div>
                      <div className="mt-2 text-xl font-semibold text-white">
                        {invoiceDetail.account.name}
                      </div>
                    </div>
                  </div>

                  {invoiceDetail.paymentTransaction ? (
                    <div className="rounded-xl border border-green-700/50 bg-green-900/10 p-4">
                      <div className="text-sm font-medium text-white">Pagamento registrado</div>
                      <div className="mt-2 text-sm text-gray-300">
                        {invoiceDetail.paymentTransaction.fromAccount?.name || 'Conta não identificada'} •{' '}
                        {formatCurrency(invoiceDetail.paymentTransaction.amount)} •{' '}
                        {invoiceDetail.paymentTransaction.effectiveDate
                          ? new Date(invoiceDetail.paymentTransaction.effectiveDate).toLocaleDateString('pt-BR')
                          : '-'}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-blue-700/50 bg-blue-900/10 p-4">
                      <div className="mb-4 text-sm font-medium text-white">Pagar fatura</div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-gray-300">
                            Conta pagadora
                          </label>
                          <select
                            value={paymentData.fromAccountId}
                            onChange={(event) =>
                              setPaymentData((prev) => ({
                                ...prev,
                                fromAccountId: event.target.value
                              }))
                            }
                            className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                            disabled={paying}
                          >
                            <option value="">Selecione uma conta</option>
                            {payerAccounts.map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <Input
                          label="Data do pagamento"
                          type="date"
                          value={paymentData.paymentDate}
                          onChange={(event) =>
                            setPaymentData((prev) => ({
                              ...prev,
                              paymentDate: event.target.value
                            }))
                          }
                          disabled={paying}
                        />
                      </div>

                      <div className="mt-4">
                        <label className="mb-1 block text-sm font-medium text-gray-300">
                          Observações
                        </label>
                        <textarea
                          value={paymentData.notes}
                          onChange={(event) =>
                            setPaymentData((prev) => ({
                              ...prev,
                              notes: event.target.value
                            }))
                          }
                          rows={3}
                          className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                          placeholder="Opcional"
                          disabled={paying}
                        />
                      </div>

                      <div className="mt-4 flex justify-end">
                        <Button variant="accent" onClick={handlePayInvoice} disabled={paying}>
                          {paying ? 'Pagando...' : 'Pagar Fatura'}
                        </Button>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-white">Itens da fatura</h3>
                      <Link href="/financial/transactions">
                        <Button variant="outline" className="flex items-center gap-2">
                          <Receipt size={16} />
                          Todas as Transações
                        </Button>
                      </Link>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-gray-700">
                      <table className="w-full">
                        <thead className="bg-[#0f1419] text-left text-xs uppercase text-gray-400">
                          <tr>
                            <th className="px-3 py-2">Descrição</th>
                            <th className="px-3 py-2">Categoria</th>
                            <th className="px-3 py-2">Parcela</th>
                            <th className="px-3 py-2 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceDetail.transactions.map((transaction) => (
                            <tr key={transaction.id} className="border-t border-gray-700 text-sm text-gray-300">
                              <td className="px-3 py-3">
                                <div className="font-medium text-white">
                                  {formatTransactionDescription(
                                    transaction.description,
                                    transaction.installmentNumber,
                                    transaction.totalInstallments
                                  )}
                                </div>
                                <Link
                                  href={`/financial/transactions/${transaction.id}`}
                                  className="mt-1 inline-block text-xs text-accent hover:text-accent-hover"
                                >
                                  Abrir compra
                                </Link>
                              </td>
                              <td className="px-3 py-3">
                                {transaction.category ? (
                                  <span className="rounded-full px-2 py-1 text-xs text-white" style={{ backgroundColor: transaction.category.color }}>
                                    {transaction.category.name}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-500">Sem categoria</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {transaction.installmentNumber && transaction.totalInstallments
                                  ? `${transaction.installmentNumber}/${transaction.totalInstallments}`
                                  : '-'}
                              </td>
                              <td className="px-3 py-3 text-right font-medium text-white">
                                {formatCurrency(transaction.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

export default function CreditCardInvoicesPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <InvoicesPageInner />
    </PageGuard>
  );
}
