import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Edit2,
  Receipt,
  Scale
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import api from '@/lib/api';
import { buildCreditCardInvoiceCsv } from '@/utils/creditCardCsv';
import {
  FinancialBank,
  getCreditCardReconciliationSourceType
} from '@/utils/banks';
import { downloadCsvFile } from '@/utils/csv';
import { formatAccountDisplayName } from '@/utils/accounts';
import {
  getAvailableCreditLimit,
  getInvoiceDisplayStatus,
  getInvoiceDisplayStatusClasses,
  getInvoiceDisplayStatusLabel,
  getInvoiceReferenceLabel,
  getInvoiceSettlementLabel,
  getUsedCreditLimit
} from '@/utils/creditCards';
import {
  compareCalendarDateValues,
  formatCalendarDate,
  getTodayDateValue,
  toIsoDateString
} from '@/utils/financialStatus';
import { formatTransactionDescription } from '@/utils/transactions';

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
  id: number | null;
  referenceYear: number;
  referenceMonth: number;
  closingDate: string;
  dueDate: string;
  totalAmount: string;
  status: string;
  displayStatus?: string;
  settlementType?: string | null;
  settledAt?: string | null;
  itemCount: number;
  fixedItemCount?: number;
  itemsSubtotal?: string;
  fixedSubtotal?: string;
  isProjected?: boolean;
  hasProjectedTransactions?: boolean;
  projectionKey?: string;
  externalSettledAmount?: string;
  hasExternalSettlements?: boolean;
  paymentTransaction?: PaymentTransaction | null;
}

interface CreditCardAccount {
  id: number;
  name: string;
  balance: string;
  bank?: FinancialBank | null;
  bankName?: string | null;
  bankCode?: string | null;
  accountNumber?: string | null;
  creditLimit?: string | null;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
}

interface InvoiceTransactionItem {
  id: number | null;
  description: string;
  amount: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  date?: string | null;
  dueDate?: string | null;
  isExternalCreditCardSettlement?: boolean;
  isProjected?: boolean;
  isFixedProjection?: boolean;
  fixedTemplateId?: number | null;
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

function compareInvoicesAscending(a: CreditCardInvoiceListItem, b: CreditCardInvoiceListItem) {
  if (a.referenceYear !== b.referenceYear) {
    return a.referenceYear - b.referenceYear;
  }

  if (a.referenceMonth !== b.referenceMonth) {
    return a.referenceMonth - b.referenceMonth;
  }

  return compareCalendarDateValues(a.dueDate, b.dueDate);
}

function getInvoiceSelectionKey(invoice: Pick<CreditCardInvoiceListItem, 'id' | 'projectionKey' | 'referenceYear' | 'referenceMonth'>) {
  if (invoice.id !== null) {
    return `invoice:${invoice.id}`;
  }

  if (invoice.projectionKey) {
    return `projection:${invoice.projectionKey}`;
  }

  return `reference:${invoice.referenceYear}-${String(invoice.referenceMonth).padStart(2, '0')}`;
}

function buildVisibleInvoices(sortedInvoices: CreditCardInvoiceListItem[], showPaidInvoices: boolean) {
  if (!showPaidInvoices) {
    return sortedInvoices.filter((invoice) => invoice.status !== 'PAID');
  }

  const firstUnpaidIndex = sortedInvoices.findIndex((invoice) => invoice.status !== 'PAID');
  if (firstUnpaidIndex === -1) {
    return sortedInvoices.slice(-12);
  }

  const paidWindowStart = Math.max(0, firstUnpaidIndex - 12);
  return sortedInvoices.slice(paidWindowStart);
}

function InvoicesPageInner() {
  const router = useRouter();
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  const accountId = Number(router.query.accountId);
  const selectedInvoiceFromQuery =
    typeof router.query.invoiceKey === 'string'
      ? router.query.invoiceKey
      : null;

  const [card, setCard] = useState<CreditCardAccount | null>(null);
  const [invoices, setInvoices] = useState<CreditCardInvoiceListItem[]>([]);
  const [invoiceDetail, setInvoiceDetail] = useState<CreditCardInvoiceDetail | null>(null);
  const [selectedInvoiceKey, setSelectedInvoiceKey] = useState<string | null>(null);
  const [payerAccounts, setPayerAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showPaidInvoices, setShowPaidInvoices] = useState(false);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const invoiceItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [paymentData, setPaymentData] = useState({
    fromAccountId: '',
    paymentDate: getTodayDateValue(),
    notes: ''
  });

  const availableLimit = useMemo(() => (card ? getAvailableCreditLimit(card) : null), [card]);
  const usedLimit = useMemo(() => (card ? getUsedCreditLimit(card) : 0), [card]);
  const creditLimitValue = useMemo(() => Number(card?.creditLimit || 0), [card?.creditLimit]);
  const usedLimitPercentage = useMemo(() => {
    if (!card?.creditLimit || creditLimitValue <= 0) {
      return 0;
    }

    return Math.min(100, Math.max(0, (usedLimit / creditLimitValue) * 100));
  }, [card?.creditLimit, creditLimitValue, usedLimit]);
  const invoiceSettlementLabel = invoiceDetail ? getInvoiceSettlementLabel(invoiceDetail.settlementType) : null;
  const invoiceHasExternalSettlements = Boolean(
    invoiceDetail?.hasExternalSettlements && Number(invoiceDetail.externalSettledAmount || 0) > 0
  );
  const canPaySelectedInvoice = Boolean(
    invoiceDetail &&
    !invoiceDetail.isProjected &&
    !invoiceDetail.hasProjectedTransactions &&
    !invoiceDetail.paymentTransaction &&
    invoiceDetail.status !== 'PAID'
  );
  const canReopenSelectedInvoice = Boolean(
    invoiceDetail &&
    !invoiceDetail.isProjected &&
    invoiceDetail.status === 'PAID' &&
    invoiceDetail.settlementType === 'TRANSFER' &&
    !invoiceHasExternalSettlements &&
    invoiceDetail.paymentTransaction?.id
  );
  const reconciliationSourceType = useMemo(
    () => getCreditCardReconciliationSourceType(card?.bank, card?.bankCode, card?.bankName),
    [card]
  );
  const sortedInvoices = useMemo(() => [...invoices].sort(compareInvoicesAscending), [invoices]);
  const firstUnpaidInvoice = useMemo(
    () => sortedInvoices.find((invoice) => invoice.status !== 'PAID') || null,
    [sortedInvoices]
  );
  const visibleInvoices = useMemo(
    () => buildVisibleInvoices(sortedInvoices, showPaidInvoices),
    [showPaidInvoices, sortedInvoices]
  );
  const requestedInvoiceFromQuery = useMemo(
    () =>
      selectedInvoiceFromQuery
        ? sortedInvoices.find(
            (invoice) => getInvoiceSelectionKey(invoice) === selectedInvoiceFromQuery
          ) || null
        : null,
    [selectedInvoiceFromQuery, sortedInvoices]
  );
  const selectedVisibleInvoiceIndex = useMemo(
    () => visibleInvoices.findIndex((invoice) => getInvoiceSelectionKey(invoice) === selectedInvoiceKey),
    [selectedInvoiceKey, visibleInvoices]
  );
  const previousVisibleInvoice =
    selectedVisibleInvoiceIndex > 0 ? visibleInvoices[selectedVisibleInvoiceIndex - 1] : null;
  const nextVisibleInvoice =
    selectedVisibleInvoiceIndex >= 0 && selectedVisibleInvoiceIndex < visibleInvoices.length - 1
      ? visibleInvoices[selectedVisibleInvoiceIndex + 1]
      : null;

  useEffect(() => {
    if (!router.isReady || Number.isNaN(accountId)) {
      return;
    }

    void fetchPageData();
  }, [accountId, router.isReady]);

  useEffect(() => {
    const selectedInvoice = visibleInvoices.find(
      (invoice) => getInvoiceSelectionKey(invoice) === selectedInvoiceKey
    );

    if (!selectedInvoiceKey || !selectedInvoice) {
      setInvoiceDetail(null);
      return;
    }

    void fetchInvoiceDetail(selectedInvoice);
  }, [selectedInvoiceKey, visibleInvoices]);

  useEffect(() => {
    if (!requestedInvoiceFromQuery || showPaidInvoices || requestedInvoiceFromQuery.status !== 'PAID') {
      return;
    }

    setShowPaidInvoices(true);
  }, [requestedInvoiceFromQuery, showPaidInvoices]);

  useEffect(() => {
    if (requestedInvoiceFromQuery) {
      const requestedInvoiceKey = getInvoiceSelectionKey(requestedInvoiceFromQuery);
      if (selectedInvoiceKey !== requestedInvoiceKey) {
        setSelectedInvoiceKey(requestedInvoiceKey);
      }
      return;
    }

    const visibleInvoiceKeys = new Set(
      visibleInvoices.map((invoice) => getInvoiceSelectionKey(invoice))
    );

    if (selectedInvoiceKey && visibleInvoiceKeys.has(selectedInvoiceKey)) {
      return;
    }

    const fallbackInvoiceKey = firstUnpaidInvoice
      ? getInvoiceSelectionKey(firstUnpaidInvoice)
      : visibleInvoices[0]
        ? getInvoiceSelectionKey(visibleInvoices[0])
        : null;
    if (selectedInvoiceKey !== fallbackInvoiceKey) {
      setSelectedInvoiceKey(fallbackInvoiceKey);
    }
  }, [firstUnpaidInvoice, requestedInvoiceFromQuery, selectedInvoiceKey, visibleInvoices]);

  useEffect(() => {
    if (!detailScrollRef.current) {
      return;
    }

    detailScrollRef.current.scrollTop = 0;
    setIsPaymentModalOpen(false);
  }, [selectedInvoiceKey]);

  useEffect(() => {
    if (!selectedInvoiceKey) {
      return;
    }

    const selectedItem = invoiceItemRefs.current[selectedInvoiceKey];
    if (!selectedItem) {
      return;
    }

    selectedItem.scrollIntoView({
      block: 'nearest',
      inline: 'nearest'
    });
  }, [selectedInvoiceKey, visibleInvoices]);

  async function fetchPageData() {
    setLoading(true);

    try {
      const [cardsResponse, invoicesResponse, accountsResponse] = await Promise.all([
        api.get('/financial/credit-cards'),
        api.get(`/financial/credit-cards/${accountId}/invoices`),
        api.get('/financial/accounts')
      ]);

      const nextCard =
        (cardsResponse.data || []).find((item: CreditCardAccount) => item.id === accountId) ||
        null;
      const nextInvoices = invoicesResponse.data || [];
      const nextPayerAccounts = (accountsResponse.data || []).filter(
        (item: FinancialAccount) =>
          item.isActive && item.id !== accountId && item.type !== 'CREDIT_CARD'
      );

      setCard(nextCard);
      setInvoices(nextInvoices);
      setPayerAccounts(nextPayerAccounts);
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

  async function fetchInvoiceDetail(invoice: CreditCardInvoiceListItem) {
    setDetailLoading(true);

    try {
      const response = invoice.isProjected
        ? await api.get(
            `/financial/credit-cards/${accountId}/invoices/projected/${invoice.projectionKey}`
          )
        : await api.get(`/financial/credit-card-invoices/${invoice.id}`);
      setInvoiceDetail(response.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar detalhes da fatura', 'error');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handlePayInvoice() {
    if (!invoiceDetail?.id) {
      addToast('Selecione uma fatura para pagar', 'error');
      return;
    }

    if (!paymentData.fromAccountId) {
      addToast('Selecione a conta pagadora', 'error');
      return;
    }

    setPaying(true);

    try {
      await api.post(`/financial/credit-card-invoices/${invoiceDetail.id}/pay`, {
        fromAccountId: Number(paymentData.fromAccountId),
        paymentDate: toIsoDateString(paymentData.paymentDate) || undefined,
        notes: paymentData.notes || undefined
      });

      addToast('Fatura paga com sucesso', 'success');
      setIsPaymentModalOpen(false);
      setSelectedInvoiceKey(null);
      await router.replace(
        {
          pathname: router.pathname,
          query: {
            accountId
          }
        },
        undefined,
        { shallow: true }
      );
      await fetchPageData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao pagar fatura', 'error');
    } finally {
      setPaying(false);
    }
  }

  function handleReopenInvoice() {
    if (!invoiceDetail?.id || !invoiceDetail.paymentTransaction?.id) {
      addToast('Nao foi possivel localizar o pagamento desta fatura', 'error');
      return;
    }

    const payerAccountName = invoiceDetail.paymentTransaction.fromAccount?.name || 'a conta informada';
    const settledAtLabel = invoiceDetail.paymentTransaction.effectiveDate
      ? formatCalendarDate(invoiceDetail.paymentTransaction.effectiveDate)
      : invoiceDetail.settledAt
        ? formatCalendarDate(invoiceDetail.settledAt)
        : null;
    const paymentDetails = settledAtLabel
      ? ` O pagamento em ${payerAccountName} de ${formatCurrency(invoiceDetail.paymentTransaction.amount)} realizado em ${settledAtLabel} sera removido.`
      : ` O pagamento em ${payerAccountName} de ${formatCurrency(invoiceDetail.paymentTransaction.amount)} sera removido.`;

    confirmation.confirm(
      {
        title: 'Reabrir fatura paga',
        message:
          `A fatura ${getInvoiceReferenceLabel(invoiceDetail.referenceYear, invoiceDetail.referenceMonth)} voltara a ficar em aberto para um novo pagamento.` +
          paymentDetails,
        confirmText: 'Reabrir fatura',
        cancelText: 'Cancelar',
        type: 'warning'
      },
      async () => {
        await api.post(`/financial/credit-card-invoices/${invoiceDetail.id}/reopen`);
        addToast('Fatura reaberta com sucesso', 'success');
        await fetchPageData();
      }
    );
  }

  function handleSelectInvoice(invoice: CreditCardInvoiceListItem) {
    const invoiceKey = getInvoiceSelectionKey(invoice);
    setSelectedInvoiceKey(invoiceKey);
    router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          invoiceKey
        }
      },
      undefined,
      { shallow: true }
    );
  }

  function handleExportInvoiceCsv() {
    if (!invoiceDetail) {
      addToast('Selecione uma fatura para exportar', 'error');
      return;
    }

    try {
      const csv = buildCreditCardInvoiceCsv({
        cardName: card?.name || invoiceDetail.account.name,
        invoice: invoiceDetail
      });
      const referenceMonth = String(invoiceDetail.referenceMonth).padStart(2, '0');

      downloadCsvFile(
        `fatura-cartao-${accountId}-${invoiceDetail.referenceYear}-${referenceMonth}.csv`,
        csv
      );
      addToast('CSV da fatura exportado com sucesso', 'success');
    } catch (error) {
      addToast('Erro ao exportar CSV da fatura', 'error');
    }
  }

  return (
    <DashboardLayout title={card ? `Faturas de ${card.name}` : 'Faturas do Cartão'}>
      <div className="flex flex-col gap-6 lg:h-full lg:min-h-0">
        <div className="shrink-0">
          <Breadcrumb
            items={[
              { label: 'Dashboard', href: '/' },
              { label: 'Financeiro' },
              { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
              { label: card?.name || 'Faturas' }
            ]}
          />
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white">
              {card ? `Faturas de ${card.name}` : 'Faturas do Cartão'}
            </h1>
            {card && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                  {`Ciclo ${card.statementClosingDay || '-'} / ${card.statementDueDay || '-'}`}
                </span>
                <span className="text-gray-400">
                  {`Fecha dia ${card.statementClosingDay || '-'} • vence dia ${card.statementDueDay || '-'}`}
                </span>
              </div>
            )}{/*
              Pagamento integral, itens da fatura e histórico de compras agrupadas.
            */}
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
            {reconciliationSourceType && (
              <Link href={`/financial/credit-cards/${accountId}/reconciliation`}>
                <Button variant="outline" className="flex items-center gap-2">
                  <Scale size={16} />
                  Conciliar Fatura
                </Button>
              </Link>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-3">
            <Card>
              <div className="h-80 animate-pulse rounded bg-[#1b212c]" />
            </Card>
            <Card className="lg:col-span-2">
              <div className="h-80 animate-pulse rounded bg-[#1b212c]" />
            </Card>
          </div>
        ) : (
          <>
            {/* Legacy summary layout kept commented during compact header refactor
              <div className="shrink-0 grid grid-cols-1 gap-3 lg:grid-cols-3">
                <Card className="p-0 lg:col-span-2">
                  <div className="space-y-4 p-4 md:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.2em] text-gray-400">
                          Limite do cartão
                        </div>
                        <div className="mt-2 text-xl font-semibold text-white">
                    {card.creditLimit ? formatCurrency(card.creditLimit) : 'Não configurado'}
                        </div>
                      </div>
                      {card.creditLimit && (
                        <div className="rounded-full border border-gray-700 bg-[#11161d] px-3 py-1 text-xs font-medium text-gray-300">
                          {`${usedLimitPercentage.toFixed(0)}% usado`}
                        </div>
                      )}
                    </div>

                    {card.creditLimit ? (
                      <div className="space-y-3">
                        <div className="h-3 overflow-hidden rounded-full bg-[#0f1419] ring-1 ring-gray-700">
                          <div
                            className={`h-full rounded-full transition-[width] duration-300 ${
                              availableLimit !== null && availableLimit < 0
                                ? 'bg-orange-400'
                                : 'bg-accent'
                            }`}
                            style={{ width: `${usedLimitPercentage}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="rounded-lg border border-gray-700/70 bg-[#11161d] px-3 py-2.5">
                  <div className="text-xs uppercase tracking-wide text-gray-400">Usado</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {formatCurrency(usedLimit)}
                  </div>
                          </div>
                          <div className="rounded-lg border border-gray-700/70 bg-[#11161d] px-3 py-2.5">
                  <div className="text-xs uppercase tracking-wide text-gray-400">Disponível</div>
                  <div
                    className={`mt-2 text-xl font-semibold ${
                      availableLimit !== null && availableLimit < 0
                        ? 'text-orange-300'
                        : 'text-white'
                    }`}
                  >
                    {availableLimit === null
                      ? 'Não configurado'
                      : formatCurrency(availableLimit)}
                  </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-700 bg-[#11161d] px-4 py-3 text-sm text-gray-400">
                        Defina um limite para acompanhar a ocupacao do cartao e o saldo disponivel.
                      </div>
                    )}
                  </div>
                </Card>
                <Card className="p-0">
                  <div className="flex h-full flex-col justify-between gap-4 p-4 md:p-5">
                    <div className="text-xs uppercase tracking-[0.2em] text-gray-400">Ciclo</div>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <div className="text-2xl font-semibold text-white">
                          {card.statementClosingDay || '-'} / {card.statementDueDay || '-'}
                        </div>
                        <div className="mt-1 text-xs text-gray-400">Fechamento / vencimento</div>
                      </div>
                      <div className="rounded-lg border border-gray-700 bg-[#11161d] px-3 py-2 text-right text-xs text-gray-300">
                        <div>Fecha dia {card.statementClosingDay || '-'}</div>
                        <div className="mt-1">Vence dia {card.statementDueDay || '-'}</div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            */}

            {card ? (
              <div className="shrink-0">
                <Card className="p-0">
                  <div className="space-y-2.5 p-3.5 md:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-400">
                        Limite do cartao
                      </div>
                      <div className="hidden">
                        <span className="uppercase tracking-[0.18em]">Ciclo</span>
                        <span className="font-semibold text-white">
                          {card.statementClosingDay || '-'} / {card.statementDueDay || '-'}
                        </span>
                        <span>
                          Fecha dia {card.statementClosingDay || '-'} • vence dia{' '}
                          {card.statementDueDay || '-'}
                        </span>
                      </div>
                    </div>

                    {card.creditLimit ? (
                      <>
                        <div className="relative h-4 overflow-hidden rounded-full bg-[#0f1419] ring-1 ring-gray-700">
                          <div
                            className={`h-full rounded-full transition-[width] duration-300 ${
                              availableLimit !== null && availableLimit < 0
                                ? 'bg-orange-400'
                                : 'bg-accent'
                            }`}
                            style={{ width: `${usedLimitPercentage}%` }}
                          />
                          <div
                            className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white"
                            style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.85)' }}
                          >
                            {`${usedLimitPercentage.toFixed(0)}%`}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2.5 text-sm">
                          <div className="min-w-0 text-left">
                            <div className="text-[11px] uppercase tracking-wide text-gray-400">
                              Utilizado
                            </div>
                            <div className="mt-1 font-semibold text-white">
                              {formatCurrency(usedLimit)}
                            </div>
                          </div>
                          <div className="min-w-0 text-center">
                            <div className="text-[11px] uppercase tracking-wide text-gray-400">
                              Disponivel
                            </div>
                            <div
                              className={`mt-1 font-semibold ${
                                availableLimit !== null && availableLimit < 0
                                  ? 'text-orange-300'
                                  : 'text-white'
                              }`}
                            >
                              {availableLimit === null
                                ? 'Nao configurado'
                                : formatCurrency(availableLimit)}
                            </div>
                          </div>
                          <div className="min-w-0 text-right">
                            <div className="text-[11px] uppercase tracking-wide text-gray-400">
                              Total
                            </div>
                            <div className="mt-1 font-semibold text-white">
                              {formatCurrency(card.creditLimit)}
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed border-gray-700 bg-[#11161d] px-4 py-3 text-sm text-gray-400">
                        Defina um limite para acompanhar a ocupacao do cartao e o saldo disponivel.
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            ) : null}

            <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:flex-row lg:overflow-hidden">
              <Card className="p-0 [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:flex-col lg:flex lg:h-full lg:min-h-0 lg:basis-0 lg:flex-1 lg:flex-col">
                <div className="flex h-full min-h-0 flex-col p-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">Faturas</h2>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        checked={showPaidInvoices}
                        onChange={(event) => setShowPaidInvoices(event.target.checked)}
                        className="h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
                      />
                      Mostrar pagas
                    </label>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-scroll overscroll-contain lg:pr-2">
                    <div className="space-y-3">
                      {visibleInvoices.length === 0 ? (
                        <div className="py-8 text-center text-sm text-gray-400">
                          {showPaidInvoices
                            ? 'Nenhuma fatura encontrada para este cartão.'
                            : 'Nenhuma fatura em aberto. Marque "Mostrar pagas" para ver o histórico.'}
                        </div>
                      ) : (
                        visibleInvoices.map((invoice) => {
                          const invoiceKey = getInvoiceSelectionKey(invoice);
                          const isSelected = invoiceKey === selectedInvoiceKey;
                          const displayStatus = getInvoiceDisplayStatus(invoice.status, invoice.dueDate);

                          return (
                            <button
                              key={invoiceKey}
                              type="button"
                              ref={(node) => {
                                invoiceItemRefs.current[invoiceKey] = node;
                              }}
                              onClick={() => handleSelectInvoice(invoice)}
                              className={`w-full rounded-xl border p-4 text-left transition-colors ${
                                isSelected
                                  ? 'border-accent bg-accent/10'
                                  : 'border-gray-700 bg-[#11161d] hover:border-accent/50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-white">
                                    {getInvoiceReferenceLabel(
                                      invoice.referenceYear,
                                      invoice.referenceMonth
                                    )}
                                  </div>
                                  <div className="mt-1 text-xs text-gray-400">
                                    Fecha{' '}
                                    {formatCalendarDate(invoice.closingDate)} •
                                    vence {formatCalendarDate(invoice.dueDate)}
                                  </div>
                                </div>
                                <span
                                  className={`rounded-full px-2 py-1 text-xs font-medium ${getInvoiceDisplayStatusClasses(
                                    displayStatus
                                  )}`}
                                >
                                  {getInvoiceDisplayStatusLabel(displayStatus)}
                                </span>
                              </div>

                              <div className="mt-4 flex items-end justify-between gap-3">
                                <div>
                                  <div className="text-xs uppercase tracking-wide text-gray-400">
                                    Valor
                                  </div>
                                  <div className="mt-1 text-lg font-semibold text-white">
                                    {formatCurrency(invoice.totalAmount)}
                                  </div>
                                  <div className="mt-1 space-y-1 text-xs text-gray-400">
                                    <div>Itens: {formatCurrency(invoice.itemsSubtotal || 0)}</div>
                                    <div>Fixas: {formatCurrency(invoice.fixedSubtotal || 0)}</div>
                                  </div>
                                  {invoice.hasExternalSettlements &&
                                    Number(invoice.externalSettledAmount || 0) > 0 && (
                                      <div className="mt-1 text-xs text-amber-300">
                                        {`${formatCurrency(invoice.externalSettledAmount || 0)} liquidado fora do sistema`}
                                      </div>
                                    )}
                                </div>
                                <div className="text-right text-xs text-gray-400">
                                  <div>
                                    {invoice.itemCount} item
                                    {invoice.itemCount === 1 ? '' : 's'}
                                  </div>
                                  <div>
                                    {invoice.fixedItemCount || 0} fixa
                                    {(invoice.fixedItemCount || 0) === 1 ? '' : 's'}
                                  </div>
                                  {invoice.isProjected && (
                                    <div className="mt-1 text-blue-300">Fatura projetada</div>
                                  )}
                                  {!invoice.isProjected && invoice.hasProjectedTransactions && (
                                    <div className="mt-1 text-blue-300">Com itens projetados</div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-0 [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:flex-col lg:flex lg:h-full lg:min-h-0 lg:basis-0 lg:flex-[2] lg:flex-col">
                <div className="flex h-full min-h-0 flex-col p-6">
                  <div
                    ref={detailScrollRef}
                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll overscroll-contain lg:pr-2"
                  >
                    {detailLoading ? (
                      <div className="h-80 animate-pulse rounded bg-[#1b212c]" />
                    ) : !invoiceDetail ? (
                      <div className="py-12 text-center text-gray-400">
                        Selecione uma fatura para visualizar os detalhes.
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="sticky top-0 z-10 -mx-6 border-b border-gray-700 bg-surface px-6 pb-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-3">
                              <h2 className="text-xl font-semibold text-white">
                                Fatura{' '}
                                {getInvoiceReferenceLabel(
                                  invoiceDetail.referenceYear,
                                  invoiceDetail.referenceMonth
                                )}
                              </h2>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    previousVisibleInvoice &&
                                    handleSelectInvoice(previousVisibleInvoice)
                                  }
                                  disabled={!previousVisibleInvoice}
                                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap border-0 px-2.5 py-1 text-sm font-medium leading-none hover:border-0 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <ChevronLeft size={14} />
                                  Anterior
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    nextVisibleInvoice && handleSelectInvoice(nextVisibleInvoice)
                                  }
                                  disabled={!nextVisibleInvoice}
                                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap border-0 px-2.5 py-1 text-sm font-medium leading-none hover:border-0 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {'Pr\u00F3xima'}
                                  <ChevronRight size={14} />
                                </Button>
                              </div>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-400">
                                <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-medium ${getInvoiceDisplayStatusClasses(
                                    getInvoiceDisplayStatus(invoiceDetail.status, invoiceDetail.dueDate)
                                  )}`}
                                >
                                  {getInvoiceDisplayStatusLabel(
                                    getInvoiceDisplayStatus(invoiceDetail.status, invoiceDetail.dueDate)
                                  )}
                                </span>
                                {invoiceDetail.isProjected && (
                                  <span className="rounded-full border border-blue-700 bg-blue-900/20 px-3 py-1 text-xs font-medium text-blue-200">
                                    Projetada
                                  </span>
                                )}
                                {!invoiceDetail.isProjected && invoiceDetail.hasProjectedTransactions && (
                                  <span className="rounded-full border border-blue-700 bg-blue-900/20 px-3 py-1 text-xs font-medium text-blue-200">
                                    Com fixas projetadas
                                  </span>
                                )}
                                <span>
                                  Fechamento{' '}
                                {formatCalendarDate(invoiceDetail.closingDate)}{' '}
                                • vencimento{' '}
                                {formatCalendarDate(invoiceDetail.dueDate)}
                                </span>
                              </div>
                            </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleExportInvoiceCsv}
                                className="flex items-center gap-2"
                              >
                                <Download size={16} />
                                Exportar CSV
                              </Button>
                              {canReopenSelectedInvoice && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={handleReopenInvoice}
                                  disabled={confirmation.loading}
                                  className="disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Reabrir fatura
                                </Button>
                              )}
                              {canPaySelectedInvoice && (
                                <Button
                                  type="button"
                                  variant="accent"
                                  onClick={() => setIsPaymentModalOpen(true)}
                                  disabled={paying}
                                  className="disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {paying ? 'Pagando...' : 'Pagar fatura'}
                                </Button>
                              )}
                            </div>
                            <div className="hidden">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  previousVisibleInvoice &&
                                  handleSelectInvoice(previousVisibleInvoice)
                                }
                                disabled={!previousVisibleInvoice}
                                className="flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <ChevronLeft size={16} />
                                Anterior
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  nextVisibleInvoice && handleSelectInvoice(nextVisibleInvoice)
                                }
                                disabled={!nextVisibleInvoice}
                                className="flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Próxima
                                <ChevronRight size={16} />
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                          <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-gray-400">
                              Valor total
                            </div>
                            <div className="mt-1.5 text-lg font-semibold text-white">
                              {formatCurrency(invoiceDetail.totalAmount)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-gray-400">
                              Subtotal itens
                            </div>
                            <div className="mt-1.5 text-lg font-semibold text-white">
                              {formatCurrency(invoiceDetail.itemsSubtotal || 0)}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              {invoiceDetail.itemCount} item{invoiceDetail.itemCount === 1 ? '' : 's'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-gray-400">
                              Subtotal fixas
                            </div>
                            <div className="mt-1.5 text-lg font-semibold text-white">
                              {formatCurrency(invoiceDetail.fixedSubtotal || 0)}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              {invoiceDetail.fixedItemCount || 0} fixa
                              {(invoiceDetail.fixedItemCount || 0) === 1 ? '' : 's'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-gray-700 bg-[#11161d] px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-gray-400">
                              Conta
                            </div>
                            <div className="mt-1.5 text-lg font-semibold text-white">
                              {invoiceDetail.account.name}
                            </div>
                          </div>
                        </div>

                        {invoiceDetail.paymentTransaction ? (
                          <div className="space-y-3">
                            <div className="rounded-xl border border-green-700/50 bg-green-900/10 p-4">
                              <div className="text-sm font-medium text-white">
                                Pagamento registrado
                              </div>
                              <div className="mt-2 text-sm text-gray-300">
                                {invoiceDetail.paymentTransaction.fromAccount?.name ||
                                  'Conta não identificada'}{' '}
                                • {formatCurrency(invoiceDetail.paymentTransaction.amount)} •{' '}
                                {invoiceDetail.paymentTransaction.effectiveDate
                                  ? formatCalendarDate(invoiceDetail.paymentTransaction.effectiveDate)
                                  : '-'}
                              </div>
                            </div>
                            {invoiceHasExternalSettlements && (
                              <div className="rounded-xl border border-amber-700/50 bg-amber-900/10 p-4">
                                <div className="text-sm font-medium text-white">
                                  Complemento histórico
                                </div>
                                <div className="mt-2 text-sm text-gray-300">
                                  {`${formatCurrency(invoiceDetail.externalSettledAmount || 0)} liquidado fora do sistema`}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : invoiceDetail.status === 'PAID' ? (
                          <div className="rounded-xl border border-amber-700/50 bg-amber-900/10 p-4">
                            <div className="text-sm font-medium text-white">
                              {invoiceSettlementLabel || 'Fatura liquidada fora do sistema'}
                            </div>
                            <div className="mt-2 text-sm text-gray-300">
                              {invoiceDetail.settledAt
                                ? `Liquidada em ${formatCalendarDate(invoiceDetail.settledAt)}`
                                : 'Liquidação histórica sem transferência registrada'}
                            </div>
                            {invoiceHasExternalSettlements && (
                              <div className="mt-2 text-sm text-amber-200">
                                {`${formatCurrency(invoiceDetail.externalSettledAmount || 0)} em itens históricos`}
                              </div>
                            )}
                          </div>
                        ) : invoiceDetail.isProjected || invoiceDetail.hasProjectedTransactions ? (
                          <div className="rounded-xl border border-blue-700/50 bg-blue-900/10 p-4">
                            <div className="text-sm font-medium text-white">
                              Visualização projetada
                            </div>
                            <div className="mt-2 text-sm text-gray-300">
                              Esta fatura inclui despesas fixas projetadas e fica somente para consulta até a materialização no fechamento.
                            </div>
                          </div>
                        ) : false && (
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
                                      {formatAccountDisplayName(account)}
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
                              <Button
                                variant="accent"
                                onClick={handlePayInvoice}
                                disabled={paying}
                              >
                                {paying ? 'Pagando...' : 'Pagar Fatura'}
                              </Button>
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="mb-3">
                            <h3 className="text-lg font-semibold text-white">Itens da fatura</h3>
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
                                  <tr
                                    key={transaction.id ?? `projected-${transaction.fixedTemplateId}-${transaction.description}`}
                                    className="border-t border-gray-700 text-sm text-gray-300"
                                  >
                                    <td className="px-3 py-3">
                                      <div className="font-medium text-white">
                                        {formatTransactionDescription(
                                          transaction.description,
                                          transaction.installmentNumber,
                                          transaction.totalInstallments
                                        )}
                                      </div>
                                      {transaction.isExternalCreditCardSettlement && (
                                        <div className="mt-1 text-xs text-amber-300">
                                          Liquidada fora do sistema
                                        </div>
                                      )}
                                      {transaction.isFixedProjection && (
                                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                                          <span className="rounded-full border border-blue-700 bg-blue-900/20 px-2 py-0.5 text-blue-200">
                                            Fixa
                                          </span>
                                          <span className="rounded-full border border-blue-700 bg-blue-900/20 px-2 py-0.5 text-blue-200">
                                            Projetada
                                          </span>
                                        </div>
                                      )}
                                      {!transaction.isProjected && transaction.id !== null && (
                                        <Link
                                          href={`/financial/transactions/${transaction.id}`}
                                          className="mt-1 inline-block text-xs text-accent hover:text-accent-hover"
                                        >
                                          Abrir compra
                                        </Link>
                                      )}
                                    </td>
                                    <td className="px-3 py-3">
                                      {transaction.category ? (
                                        <span
                                          className="rounded-full px-2 py-1 text-xs text-white"
                                          style={{
                                            backgroundColor: transaction.category.color
                                          }}
                                        >
                                          {transaction.category.name}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-gray-500">
                                          Sem categoria
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3">
                                      {transaction.installmentNumber &&
                                      transaction.totalInstallments
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
                  </div>
                </div>
              </Card>
            </div>

            <Modal
              isOpen={Boolean(isPaymentModalOpen && canPaySelectedInvoice)}
              onClose={() => setIsPaymentModalOpen(false)}
              title="Pagar fatura"
              loading={paying}
              footer={
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsPaymentModalOpen(false)}
                    disabled={paying}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="accent"
                    onClick={handlePayInvoice}
                    disabled={paying}
                  >
                    {paying ? 'Pagando...' : 'Pagar fatura'}
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
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
                        {formatAccountDisplayName(account)}
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
                  className="mb-0"
                />

                <div>
                  <label style={{ display: 'none' }}>
                    Observações
                  </label>
                  <div className="mb-1 text-sm font-medium text-gray-300">
                    {'Observa\u00E7\u00F5es'}
                  </div>
                  <textarea
                    value={paymentData.notes}
                    onChange={(event) =>
                      setPaymentData((prev) => ({
                        ...prev,
                        notes: event.target.value
                      }))
                    }
                    rows={4}
                    className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                    placeholder="Opcional"
                    disabled={paying}
                  />
                </div>
              </div>
            </Modal>

            <ConfirmationModal
              isOpen={confirmation.isOpen}
              onClose={confirmation.handleClose}
              onConfirm={confirmation.handleConfirm}
              title={confirmation.options.title}
              message={confirmation.options.message}
              confirmText={confirmation.options.confirmText}
              cancelText={confirmation.options.cancelText}
              type={confirmation.options.type}
              loading={confirmation.loading}
            />
          </>
        )}
      </div>
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
