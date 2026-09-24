import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Edit2,
  FastForward,
  RefreshCw,
  Maximize,
  Minimize,
  Plus,
  Receipt,
  Scale,
  Trash2
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  CreditCardCreditModal,
  type CreditCardCreditPayload
} from '@/components/financial/CreditCardCreditModal';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
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

interface InvoicePayment {
  id: number;
  transactionId: number;
  amount: string;
  paymentDate: string;
  transaction: PaymentTransaction;
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
  chargeAmount?: string;
  creditAmount?: string;
  fixedSubtotal?: string;
  isProjected?: boolean;
  hasProjectedTransactions?: boolean;
  projectionKey?: string;
  externalSettledAmount?: string;
  hasExternalSettlements?: boolean;
  paymentTransaction?: PaymentTransaction | null;
  payments?: InvoicePayment[];
  paymentAmount?: string;
  outstandingAmount?: string;
  hasPayments?: boolean;
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
  type?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  creditCardCreditKind?: 'REFUND' | 'CASHBACK' | 'ADJUSTMENT' | 'ANTICIPATION_DISCOUNT' | null;
  refundedAmount?: string;
  refundStatus?: 'REFUNDED' | 'PARTIALLY_REFUNDED' | null;
  refundOfTransaction?: {
    id: number;
    description: string;
  } | null;
  creditCardAnticipationItem?: {
    originalReferenceYear: number;
    originalReferenceMonth: number;
    anticipation: {
      id: number;
      anticipatedAt: string;
      discountAmount: string;
    };
  } | null;
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

interface FixedMaterializationOccurrence {
  templateId: number;
  description: string;
  amount: string;
  occurrenceKey: string;
  occurrenceDate: string;
}

interface MaterializedFixedOccurrence extends FixedMaterializationOccurrence {
  transactionId?: number | null;
  isIgnored: boolean;
  archivedAt?: string | null;
}

type FixedMaterializationIssue =
  | 'OCCURRENCE_KEY_WITHOUT_INVOICE'
  | 'OCCURRENCE_KEY_WRONG_INVOICE'
  | 'AMBIGUOUS_LEGACY_OCCURRENCES'
  | 'DUPLICATE_EXACT_AND_LEGACY_OCCURRENCES';

interface FixedMaterializationInconsistency extends FixedMaterializationOccurrence {
  issue: FixedMaterializationIssue;
  transactionIds: number[];
  message: string;
}

interface FixedMaterializationError {
  templateId: number;
  description?: string;
  occurrenceKey?: string;
  error: string;
}

type FixedMaterializationReason =
  | 'READY'
  | 'INVOICE_OPEN'
  | 'INVOICE_PAID'
  | 'ACCOUNT_INACTIVE'
  | 'NOTHING_TO_MATERIALIZE';

interface FixedMaterializationReport {
  accountId: number;
  invoiceId: number | null;
  referenceYear: number;
  referenceMonth: number;
  status: 'OPEN' | 'CLOSED' | 'PAID';
  canMaterialize: boolean;
  reason: FixedMaterializationReason;
  expectedCount: number;
  materializedCount: number;
  ignoredCount: number;
  missingCount: number;
  inconsistencyCount: number;
  excludedUnboundedInactiveTemplateCount: number;
  warnings: string[];
  missingOccurrences: FixedMaterializationOccurrence[];
  materializedOccurrences: MaterializedFixedOccurrence[];
  inconsistentOccurrences: FixedMaterializationInconsistency[];
  attemptedCount?: number;
  createdCount?: number;
  failedCount?: number;
  errors?: FixedMaterializationError[];
}

interface FinancialAccount {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
}

interface AnticipationCandidate {
  id: number;
  description: string;
  amount: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  purchaseGroupId: string;
  scheduledDate?: string | null;
  category?: {
    id: number;
    name: string;
    color: string;
  } | null;
  creditCardInvoice: {
    id: number;
    referenceYear: number;
    referenceMonth: number;
    dueDate: string;
  };
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function getFixedMaterializationReasonMessage(reason?: FixedMaterializationReason | null) {
  switch (reason) {
    case 'INVOICE_OPEN':
      return 'A fatura ainda está aberta e será materializada automaticamente no fechamento.';
    case 'INVOICE_PAID':
      return 'Faturas pagas não podem receber novas materializações.';
    case 'ACCOUNT_INACTIVE':
      return 'Este cartão está inativo e não pode receber novas materializações.';
    case 'NOTHING_TO_MATERIALIZE':
      return 'Todas as ocorrências fixas esperadas já estão materializadas ou ignoradas.';
    case 'READY':
      return null;
    default:
      return reason || 'Esta fatura não permite materialização manual.';
  }
}

function getFixedMaterializationIssueLabel(issue: FixedMaterializationIssue) {
  switch (issue) {
    case 'OCCURRENCE_KEY_WITHOUT_INVOICE':
      return 'Ocorrência sem fatura vinculada';
    case 'OCCURRENCE_KEY_WRONG_INVOICE':
      return 'Ocorrência vinculada a outra fatura';
    case 'AMBIGUOUS_LEGACY_OCCURRENCES':
      return 'Múltiplas ocorrências legadas';
    case 'DUPLICATE_EXACT_AND_LEGACY_OCCURRENCES':
      return 'Ocorrências exata e legada duplicadas';
  }
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

interface InvoiceDetailViewToggleProps {
  expanded: boolean;
  onToggle: () => void;
}

function InvoiceDetailViewToggle({ expanded, onToggle }: InvoiceDetailViewToggleProps) {
  const label = expanded
    ? 'Voltar à visualização normal'
    : 'Ampliar detalhes da fatura';

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={expanded}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gray-600 p-0 text-gray-300 transition-colors hover:border-accent hover:bg-elevated hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      {expanded ? (
        <Minimize size={18} aria-hidden="true" />
      ) : (
        <Maximize size={18} aria-hidden="true" />
      )}
    </button>
  );
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
  const [isCreditModalOpen, setIsCreditModalOpen] = useState(false);
  const [creditSubmitting, setCreditSubmitting] = useState(false);
  const [isAnticipationModalOpen, setIsAnticipationModalOpen] = useState(false);
  const [anticipationCandidates, setAnticipationCandidates] = useState<AnticipationCandidate[]>([]);
  const [selectedAnticipationIds, setSelectedAnticipationIds] = useState<number[]>([]);
  const [anticipationLoading, setAnticipationLoading] = useState(false);
  const [anticipationSubmitting, setAnticipationSubmitting] = useState(false);
  const [anticipationData, setAnticipationData] = useState({
    anticipatedAt: getTodayDateValue(),
    discountAmount: '0',
    notes: ''
  });
  const [isFixedMaterializationModalOpen, setIsFixedMaterializationModalOpen] = useState(false);
  const [fixedMaterializationLoading, setFixedMaterializationLoading] = useState(false);
  const [fixedMaterializationSubmitting, setFixedMaterializationSubmitting] = useState(false);
  const [fixedMaterializationReport, setFixedMaterializationReport] = useState<FixedMaterializationReport | null>(null);
  const [fixedMaterializationError, setFixedMaterializationError] = useState<string | null>(null);
  const [isInvoiceDetailExpanded, setIsInvoiceDetailExpanded] = useState(false);
  const [showPaidInvoices, setShowPaidInvoices] = useState(false);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);
  const invoiceItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const internalInvoiceSelectionRef = useRef<string | null>(null);
  const [paymentData, setPaymentData] = useState({
    fromAccountId: '',
    amount: '0',
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
  const visibleInvoicePayments = useMemo<InvoicePayment[]>(() => {
    if (invoiceDetail?.payments?.length) {
      return invoiceDetail.payments;
    }
    if (!invoiceDetail?.paymentTransaction) {
      return [];
    }
    const transaction = invoiceDetail.paymentTransaction;
    return [{
      id: transaction.id,
      transactionId: transaction.id,
      amount: transaction.amount,
      paymentDate: transaction.effectiveDate || transaction.date || invoiceDetail.settledAt || '',
      transaction
    }];
  }, [invoiceDetail]);
  const invoiceHasExternalSettlements = Boolean(
    invoiceDetail?.hasExternalSettlements && Number(invoiceDetail.externalSettledAmount || 0) > 0
  );
  const canPaySelectedInvoice = Boolean(
    invoiceDetail &&
    !invoiceDetail.isProjected &&
    !(invoiceDetail.status === 'CLOSED' && invoiceDetail.hasProjectedTransactions) &&
    invoiceDetail.status !== 'PAID' &&
    Number(invoiceDetail.outstandingAmount ?? invoiceDetail.totalAmount ?? 0) > 0
  );
  const canAnticipateSelectedInvoice = Boolean(
    invoiceDetail &&
    invoiceDetail.id &&
    !invoiceDetail.isProjected &&
    invoiceDetail.status === 'OPEN'
  );
  const canAddCreditToSelectedInvoice = Boolean(
    invoiceDetail &&
    invoiceDetail.id &&
    !invoiceDetail.isProjected &&
    invoiceDetail.status !== 'PAID'
  );
  const canReopenSelectedInvoice = Boolean(
    invoiceDetail &&
    !invoiceDetail.isProjected &&
    invoiceDetail.status === 'PAID' &&
    invoiceDetail.settlementType === 'TRANSFER' &&
    !invoiceHasExternalSettlements &&
    (invoiceDetail.payments?.length || invoiceDetail.paymentTransaction?.id)
  );
  const canInspectFixedMaterialization = Boolean(
    invoiceDetail && invoiceDetail.status === 'CLOSED'
  );
  const selectedAnticipationTotal = useMemo(
    () => anticipationCandidates
      .filter((candidate) => selectedAnticipationIds.includes(candidate.id))
      .reduce((sum, candidate) => sum + Number(candidate.amount || 0), 0),
    [anticipationCandidates, selectedAnticipationIds]
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
  }, [accountId, router.isReady, showPaidInvoices]);

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
  }, [isInvoiceDetailExpanded, selectedInvoiceKey, visibleInvoices]);

  async function fetchPageData(preferredInvoiceReference?: {
    referenceYear: number;
    referenceMonth: number;
  }) {
    setLoading(true);

    try {
      const includePaidInvoices =
        showPaidInvoices ||
        Boolean(
          selectedInvoiceFromQuery &&
          internalInvoiceSelectionRef.current !== selectedInvoiceFromQuery
        );
      const [cardsResponse, invoicesResponse, accountsResponse] = await Promise.all([
        api.get('/financial/credit-cards'),
        api.get(
          `/financial/credit-cards/${accountId}/invoices?includePaid=${includePaidInvoices}`
        ),
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

      if (preferredInvoiceReference) {
        const preferredInvoice = nextInvoices.find(
          (invoice: CreditCardInvoiceListItem) =>
            invoice.referenceYear === preferredInvoiceReference.referenceYear &&
            invoice.referenceMonth === preferredInvoiceReference.referenceMonth
        );

        if (preferredInvoice) {
          const preferredInvoiceKey = getInvoiceSelectionKey(preferredInvoice);
          internalInvoiceSelectionRef.current = preferredInvoiceKey;
          setSelectedInvoiceKey(preferredInvoiceKey);

          await router.replace(
            {
              pathname: router.pathname,
              query: {
                ...router.query,
                accountId,
                invoiceKey: preferredInvoiceKey
              }
            },
            undefined,
            { shallow: true }
          );
        }
      }
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

  function handleOpenPaymentModal() {
    const outstandingAmount = Math.max(
      0,
      Number(invoiceDetail?.outstandingAmount ?? invoiceDetail?.totalAmount ?? 0)
    );
    setPaymentData((current) => ({
      ...current,
      amount: outstandingAmount.toFixed(2),
      paymentDate: getTodayDateValue(),
      notes: ''
    }));
    setIsPaymentModalOpen(true);
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
    const numericAmount = Number(paymentData.amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      addToast('Informe um valor de pagamento maior que zero', 'error');
      return;
    }

    setPaying(true);

    try {
      const response = await api.post(`/financial/credit-card-invoices/${invoiceDetail.id}/pay`, {
        fromAccountId: Number(paymentData.fromAccountId),
        amount: numericAmount,
        paymentDate: toIsoDateString(paymentData.paymentDate) || undefined,
        notes: paymentData.notes || undefined
      });

      addToast(
        response.data.status === 'OPEN'
          ? 'Pagamento registrado. A fatura continua aberta.'
          : 'Pagamento registrado com sucesso',
        'success'
      );
      setIsPaymentModalOpen(false);
      await Promise.all([
        fetchInvoiceDetail(invoiceDetail),
        fetchPageData({
          referenceYear: invoiceDetail.referenceYear,
          referenceMonth: invoiceDetail.referenceMonth
        })
      ]);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao pagar fatura', 'error');
    } finally {
      setPaying(false);
    }
  }

  function handleDeleteInvoicePayment(payment: InvoicePayment) {
    if (!invoiceDetail?.id) {
      return;
    }

    confirmation.confirm(
      {
        title: 'Excluir pagamento',
        message: `Deseja excluir o pagamento de ${formatCurrency(payment.amount)} realizado em ${formatCalendarDate(payment.paymentDate)}? O saldo da fatura e das contas sera recalculado.`,
        confirmText: 'Excluir pagamento',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/transactions/${payment.transactionId}`);
          addToast('Pagamento excluido e saldos recalculados', 'success');
          await Promise.all([
            fetchInvoiceDetail(invoiceDetail),
            fetchPageData({
              referenceYear: invoiceDetail.referenceYear,
              referenceMonth: invoiceDetail.referenceMonth
            })
          ]);
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir pagamento', 'error');
          throw error;
        }
      }
    );
  }

  async function handleOpenAnticipationModal() {
    if (!invoiceDetail?.id) {
      return;
    }

    setIsAnticipationModalOpen(true);
    setAnticipationLoading(true);
    setAnticipationCandidates([]);
    setSelectedAnticipationIds([]);
    setAnticipationData({
      anticipatedAt: getTodayDateValue(),
      discountAmount: '0',
      notes: ''
    });

    try {
      const response = await api.get(
        `/financial/credit-card-invoices/${invoiceDetail.id}/anticipation-candidates`
      );
      const candidates = response.data || [];
      setAnticipationCandidates(candidates);
      setSelectedAnticipationIds(candidates.map((candidate: AnticipationCandidate) => candidate.id));
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar parcelas futuras', 'error');
      setIsAnticipationModalOpen(false);
    } finally {
      setAnticipationLoading(false);
    }
  }

  async function handleAnticipateInstallments() {
    if (!invoiceDetail?.id || selectedAnticipationIds.length === 0) {
      addToast('Selecione ao menos uma parcela para antecipar', 'error');
      return;
    }

    const discountAmount = Number(anticipationData.discountAmount || 0);
    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      addToast('Informe um desconto válido', 'error');
      return;
    }
    if (discountAmount > selectedAnticipationTotal) {
      addToast('O desconto não pode exceder o total antecipado', 'error');
      return;
    }

    setAnticipationSubmitting(true);
    try {
      await api.post(`/financial/credit-card-invoices/${invoiceDetail.id}/anticipations`, {
        transactionIds: selectedAnticipationIds,
        anticipatedAt: toIsoDateString(anticipationData.anticipatedAt) || undefined,
        discountAmount,
        notes: anticipationData.notes || undefined
      });
      addToast(
        `${selectedAnticipationIds.length} parcela${selectedAnticipationIds.length === 1 ? '' : 's'} antecipada${selectedAnticipationIds.length === 1 ? '' : 's'} com sucesso`,
        'success'
      );
      setIsAnticipationModalOpen(false);
      await Promise.all([
        fetchInvoiceDetail(invoiceDetail),
        fetchPageData({
          referenceYear: invoiceDetail.referenceYear,
          referenceMonth: invoiceDetail.referenceMonth
        })
      ]);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao antecipar parcelas', 'error');
    } finally {
      setAnticipationSubmitting(false);
    }
  }

  async function handleAddInvoiceCredit(payload: CreditCardCreditPayload) {
    if (!invoiceDetail?.id) {
      addToast('Selecione uma fatura real para adicionar o crédito', 'error');
      return;
    }

    setCreditSubmitting(true);
    try {
      await api.post(`/financial/credit-card-invoices/${invoiceDetail.id}/credits`, {
        ...payload,
        date: toIsoDateString(payload.date)
      });
      addToast('Crédito adicionado à fatura', 'success');
      setIsCreditModalOpen(false);
      await Promise.all([
        fetchInvoiceDetail(invoiceDetail),
        fetchPageData({
          referenceYear: invoiceDetail.referenceYear,
          referenceMonth: invoiceDetail.referenceMonth
        })
      ]);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao adicionar crédito à fatura', 'error');
    } finally {
      setCreditSubmitting(false);
    }
  }

  function handleReopenInvoice() {
    if (!invoiceDetail?.id || !(invoiceDetail.payments?.length || invoiceDetail.paymentTransaction?.id)) {
      addToast('Nao foi possivel localizar o pagamento desta fatura', 'error');
      return;
    }

    const paymentCount = invoiceDetail.payments?.length || 1;
    const payerAccountName = invoiceDetail.payments?.[0]?.transaction.fromAccount?.name ||
      invoiceDetail.paymentTransaction?.fromAccount?.name ||
      'a conta informada';
    const settledAtLabel = invoiceDetail.settledAt
      ? formatCalendarDate(invoiceDetail.settledAt)
      : null;
    const paymentDetails = settledAtLabel
      ? ` ${paymentCount === 1 ? 'O pagamento' : `Os ${paymentCount} pagamentos`} em ${payerAccountName}, no total de ${formatCurrency(invoiceDetail.paymentAmount || invoiceDetail.paymentTransaction?.amount || 0)}, ${paymentCount === 1 ? 'realizado' : 'realizados'} ate ${settledAtLabel}, ${paymentCount === 1 ? 'sera removido' : 'serao removidos'}.`
      : ` ${paymentCount === 1 ? 'O pagamento sera removido' : `Os ${paymentCount} pagamentos serao removidos`}.`;

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
    internalInvoiceSelectionRef.current = invoiceKey;
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

  function getFixedMaterializationEndpoint(referenceYear: number, referenceMonth: number) {
    return `/financial/credit-cards/${accountId}/invoices/${referenceYear}/${referenceMonth}/fixed-materialization`;
  }

  async function handleOpenFixedMaterialization() {
    if (!invoiceDetail || invoiceDetail.status !== 'CLOSED') {
      return;
    }

    const { referenceYear, referenceMonth } = invoiceDetail;
    setIsFixedMaterializationModalOpen(true);
    setFixedMaterializationReport(null);
    setFixedMaterializationError(null);
    setFixedMaterializationLoading(true);

    try {
      const response = await api.get(
        getFixedMaterializationEndpoint(referenceYear, referenceMonth)
      );
      setFixedMaterializationReport(response.data);
    } catch (error: any) {
      const message =
        error.response?.data?.error || 'Erro ao verificar a materialização das fixas';
      setFixedMaterializationError(message);
      addToast(message, 'error');
    } finally {
      setFixedMaterializationLoading(false);
    }
  }

  async function handleMaterializeMissingFixed() {
    if (!fixedMaterializationReport || !fixedMaterializationReport.canMaterialize) {
      return;
    }

    const { referenceYear, referenceMonth } = fixedMaterializationReport;
    setFixedMaterializationSubmitting(true);
    setFixedMaterializationError(null);

    try {
      const response = await api.post(
        getFixedMaterializationEndpoint(referenceYear, referenceMonth)
      );
      const report = response.data as FixedMaterializationReport;
      setFixedMaterializationReport(report);

      if ((report.failedCount || 0) > 0) {
        addToast(
          `Correção parcial: ${report.createdCount || 0} criada(s) e ${report.failedCount} falha(s)`,
          'error'
        );
      } else if ((report.createdCount || 0) > 0) {
        addToast(
          `${report.createdCount} item(ns) fixo(s) materializado(s) com sucesso`,
          'success'
        );
      } else {
        addToast('Nenhum item fixo pendente para materializar', 'success');
      }

      await fetchPageData({ referenceYear, referenceMonth });
    } catch (error: any) {
      const message =
        error.response?.data?.error || 'Erro ao corrigir a materialização das fixas';
      setFixedMaterializationError(message);
      addToast(message, 'error');
    } finally {
      setFixedMaterializationSubmitting(false);
    }
  }

  function handleCloseFixedMaterializationModal() {
    if (fixedMaterializationLoading || fixedMaterializationSubmitting) {
      return;
    }

    setIsFixedMaterializationModalOpen(false);
    setFixedMaterializationReport(null);
    setFixedMaterializationError(null);
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
              Pagamentos, antecipação de parcelas, itens da fatura e histórico de compras agrupadas.
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

            {card && !isInvoiceDetailExpanded ? (
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
              {!isInvoiceDetailExpanded && (
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
              )}

              <Card
                className={`p-0 [&>div]:flex [&>div]:h-full [&>div]:min-h-0 [&>div]:flex-col lg:flex lg:h-full lg:min-h-0 lg:basis-0 lg:flex-col ${
                  isInvoiceDetailExpanded ? 'lg:flex-1' : 'lg:flex-[2]'
                }`}
              >
                <div className="flex h-full min-h-0 flex-col p-6">
                  <div
                    ref={detailScrollRef}
                    className="min-h-0 flex-1 overflow-x-hidden overflow-y-scroll overscroll-contain lg:pr-2"
                  >
                    {isInvoiceDetailExpanded && (detailLoading || !invoiceDetail) && (
                      <div className="sticky top-0 z-10 flex justify-end pb-4">
                        <InvoiceDetailViewToggle
                          expanded
                          onToggle={() => setIsInvoiceDetailExpanded(false)}
                        />
                      </div>
                    )}
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
                              {canInspectFixedMaterialization && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => void handleOpenFixedMaterialization()}
                                  disabled={fixedMaterializationLoading || fixedMaterializationSubmitting}
                                  className="flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <RefreshCw
                                    size={16}
                                    className={fixedMaterializationLoading ? 'animate-spin' : ''}
                                  />
                                  {invoiceDetail.hasProjectedTransactions
                                    ? 'Corrigir materialização'
                                    : 'Verificar fixas'}
                                </Button>
                              )}
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
                              {canAnticipateSelectedInvoice && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => void handleOpenAnticipationModal()}
                                  disabled={anticipationLoading || anticipationSubmitting}
                                  className="flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <FastForward size={16} />
                                  Antecipar parcelas
                                </Button>
                              )}
                              {canPaySelectedInvoice && (
                                <Button
                                  type="button"
                                  variant="accent"
                                  onClick={handleOpenPaymentModal}
                                  disabled={paying}
                                  className="disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {paying ? 'Registrando...' : 'Registrar pagamento'}
                                </Button>
                              )}
                              <InvoiceDetailViewToggle
                                expanded={isInvoiceDetailExpanded}
                                onToggle={() =>
                                  setIsInvoiceDetailExpanded((current) => !current)
                                }
                              />
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

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                              Compras
                            </div>
                            <div className="mt-1.5 text-lg font-semibold text-white">
                              {formatCurrency(invoiceDetail.chargeAmount || invoiceDetail.itemsSubtotal || 0)}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              {invoiceDetail.itemCount} item{invoiceDetail.itemCount === 1 ? '' : 's'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-green-800/70 bg-green-950/20 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-green-300">
                              Créditos
                            </div>
                            <div className="mt-1.5 text-lg font-semibold text-green-300">
                              - {formatCurrency(invoiceDetail.creditAmount || 0)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-blue-800/70 bg-blue-950/20 px-4 py-3">
                            <div className="text-xs uppercase tracking-wide text-blue-300">
                              Pagamentos
                            </div>
                            <div className="mt-1.5 text-lg font-semibold text-blue-200">
                              - {formatCurrency(invoiceDetail.paymentAmount || 0)}
                            </div>
                          </div>
                          <div className={`rounded-lg border px-4 py-3 ${
                            Number(invoiceDetail.outstandingAmount ?? invoiceDetail.totalAmount ?? 0) <= 0
                              ? 'border-green-800/70 bg-green-950/20'
                              : 'border-amber-800/70 bg-amber-950/20'
                          }`}>
                            <div className={`text-xs uppercase tracking-wide ${
                              Number(invoiceDetail.outstandingAmount ?? invoiceDetail.totalAmount ?? 0) <= 0
                                ? 'text-green-300'
                                : 'text-amber-300'
                            }`}>
                              {Number(invoiceDetail.outstandingAmount ?? invoiceDetail.totalAmount ?? 0) < 0
                                ? 'Crédito excedente'
                                : 'Saldo atual'}
                            </div>
                            <div className="mt-1.5 text-lg font-semibold text-white">
                              {formatCurrency(Math.abs(Number(invoiceDetail.outstandingAmount ?? invoiceDetail.totalAmount ?? 0)))}
                            </div>
                            {invoiceDetail.status === 'OPEN' && Number(invoiceDetail.outstandingAmount ?? invoiceDetail.totalAmount ?? 0) <= 0 && (
                              <div className="mt-1 text-xs text-green-300">
                                Fatura aberta com o valor atual coberto
                              </div>
                            )}
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

                        {visibleInvoicePayments.length > 0 ? (
                          <div className="space-y-3">
                            <div className="rounded-xl border border-green-700/50 bg-green-900/10 p-4">
                              <div className="text-sm font-medium text-white">
                                {visibleInvoicePayments.length === 1
                                  ? 'Pagamento registrado'
                                  : `${visibleInvoicePayments.length} pagamentos registrados`}
                              </div>
                              <div className="mt-3 space-y-2">
                                {visibleInvoicePayments.map((payment) => (
                                  <div
                                    key={payment.id}
                                    className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-300"
                                  >
                                    <span>
                                      {payment.transaction.fromAccount?.name || 'Conta não identificada'}
                                    </span>
                                    <span className="flex items-center gap-2">
                                      <span>
                                        {formatCurrency(payment.amount)} •{' '}
                                        {payment.paymentDate
                                          ? formatCalendarDate(payment.paymentDate)
                                          : '-'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteInvoicePayment(payment)}
                                        className="rounded p-1 text-gray-400 transition-colors hover:bg-red-950/40 hover:text-red-300"
                                        title="Excluir pagamento"
                                        aria-label={`Excluir pagamento de ${formatCurrency(payment.amount)}`}
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {invoiceDetail.status === 'OPEN' && (
                                <div className="mt-3 text-xs text-green-200">
                                  A fatura continua aberta e novos lançamentos recalculam o saldo pendente.
                                </div>
                              )}
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
                          <div
                            className={`rounded-xl border p-4 ${
                              invoiceDetail.status === 'CLOSED'
                                ? 'border-amber-700/50 bg-amber-900/10'
                                : 'border-blue-700/50 bg-blue-900/10'
                            }`}
                          >
                            <div className="text-sm font-medium text-white">
                              {invoiceDetail.status === 'CLOSED'
                                ? 'Materialização incompleta'
                                : 'Visualização projetada'}
                            </div>
                            <div className="mt-2 text-sm text-gray-300">
                              {invoiceDetail.status === 'CLOSED'
                                ? 'Esta fatura já fechou e ainda possui despesas fixas projetadas. Use “Corrigir materialização” para verificar e criar somente os itens ausentes.'
                                : 'Esta fatura inclui despesas fixas projetadas e fica somente para consulta até a materialização no fechamento.'}
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
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-lg font-semibold text-white">Itens da fatura</h3>
                            {canAddCreditToSelectedInvoice && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsCreditModalOpen(true)}
                                className="flex items-center gap-2"
                              >
                                <Plus size={16} />
                                Adicionar crédito
                              </Button>
                            )}
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
                                    className={`border-t border-gray-700 text-sm ${
                                      transaction.creditCardCreditKind
                                        ? 'bg-green-950/10 text-green-100'
                                        : 'text-gray-300'
                                    }`}
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
                                      {transaction.creditCardAnticipationItem && (
                                        <div className="mt-1 text-xs text-blue-300">
                                          Antecipada da fatura{' '}
                                          {getInvoiceReferenceLabel(
                                            transaction.creditCardAnticipationItem.originalReferenceYear,
                                            transaction.creditCardAnticipationItem.originalReferenceMonth
                                          )}{' '}
                                          em{' '}
                                          {formatCalendarDate(
                                            transaction.creditCardAnticipationItem.anticipation.anticipatedAt
                                          )}
                                        </div>
                                      )}
                                      {transaction.creditCardCreditKind && (
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                                          <span className="rounded-full border border-green-700 bg-green-900/20 px-2 py-0.5 text-green-200">
                                            {transaction.creditCardCreditKind === 'REFUND'
                                              ? 'Estorno'
                                              : transaction.creditCardCreditKind === 'CASHBACK'
                                                ? 'Cashback'
                                                : transaction.creditCardCreditKind === 'ANTICIPATION_DISCOUNT'
                                                  ? 'Desconto de antecipação'
                                                  : 'Ajuste de crédito'}
                                          </span>
                                          {transaction.refundOfTransaction && (
                                            <span className="text-gray-400">
                                              de {transaction.refundOfTransaction.description}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {transaction.refundStatus && (
                                        <div className="mt-1 text-xs text-green-300">
                                          {transaction.refundStatus === 'REFUNDED'
                                            ? 'Compra totalmente estornada'
                                            : `Compra parcialmente estornada (${formatCurrency(transaction.refundedAmount || 0)})`}
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
                                          {transaction.creditCardCreditKind ? 'Abrir crédito' : 'Abrir compra'}
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
                                    <td className={`px-3 py-3 text-right font-medium ${
                                      transaction.creditCardCreditKind ? 'text-green-300' : 'text-white'
                                    }`}>
                                      {transaction.creditCardCreditKind ? '- ' : ''}{formatCurrency(transaction.amount)}
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
              isOpen={isFixedMaterializationModalOpen}
              onClose={handleCloseFixedMaterializationModal}
              title={`Materialização das fixas — Fatura ${getInvoiceReferenceLabel(
                fixedMaterializationReport?.referenceYear || invoiceDetail?.referenceYear || 0,
                fixedMaterializationReport?.referenceMonth || invoiceDetail?.referenceMonth || 0
              )}`}
              loading={fixedMaterializationLoading || fixedMaterializationSubmitting}
              footer={
                <div className="flex flex-wrap justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={handleCloseFixedMaterializationModal}
                    disabled={fixedMaterializationLoading || fixedMaterializationSubmitting}
                  >
                    Fechar
                  </Button>
                  {fixedMaterializationReport?.canMaterialize &&
                    fixedMaterializationReport.missingCount > 0 && (
                      <Button
                        variant="accent"
                        onClick={() => void handleMaterializeMissingFixed()}
                        disabled={fixedMaterializationSubmitting || fixedMaterializationLoading}
                        className="flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw
                          size={16}
                          className={fixedMaterializationSubmitting ? 'animate-spin' : ''}
                        />
                        Materializar {fixedMaterializationReport.missingCount}{' '}
                        {fixedMaterializationReport.missingCount === 1
                          ? 'item faltante'
                          : 'itens faltantes'}
                      </Button>
                    )}
                </div>
              }
            >
              {fixedMaterializationLoading ? (
                <div className="space-y-3" aria-label="Verificando materialização das fixas">
                  <div className="h-16 animate-pulse rounded-lg bg-[#1b212c]" />
                  <div className="h-24 animate-pulse rounded-lg bg-[#1b212c]" />
                </div>
              ) : !fixedMaterializationReport ? (
                <div className="rounded-lg border border-red-700/60 bg-red-900/10 p-4 text-sm text-red-200">
                  {fixedMaterializationError ||
                    'Não foi possível carregar a verificação das transações fixas.'}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-700 bg-[#11161d] p-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-gray-400">
                        Situação da fatura
                      </div>
                      <div className="mt-1 text-sm text-gray-300">
                        {getInvoiceReferenceLabel(
                          fixedMaterializationReport.referenceYear,
                          fixedMaterializationReport.referenceMonth
                        )}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${getInvoiceDisplayStatusClasses(
                        getInvoiceDisplayStatus(fixedMaterializationReport.status)
                      )}`}
                    >
                      {getInvoiceDisplayStatusLabel(
                        getInvoiceDisplayStatus(fixedMaterializationReport.status)
                      )}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
                    {[
                      ['Esperadas', fixedMaterializationReport.expectedCount],
                      ['Materializadas (inclui ignoradas)', fixedMaterializationReport.materializedCount],
                      ['Ignoradas', fixedMaterializationReport.ignoredCount],
                      ['Ausentes', fixedMaterializationReport.missingCount],
                      ['Inconsistências', fixedMaterializationReport.inconsistencyCount]
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg border border-gray-700 bg-[#11161d] p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">{label}</div>
                        <div className="mt-1 text-lg font-semibold text-white">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-lg border border-blue-700/50 bg-blue-900/10 p-3 text-xs leading-relaxed text-blue-200">
                    Esta verificação usa o estado atual dos templates fixos. Alterações ou
                    exclusões históricas podem não ser reconstruídas integralmente.
                  </div>

                  {fixedMaterializationReport.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-700/60 bg-amber-900/10 p-3 text-sm text-amber-100">
                      <div className="font-medium">Avisos da verificação</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-200">
                        {fixedMaterializationReport.warnings.map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                      {fixedMaterializationReport.excludedUnboundedInactiveTemplateCount > 0 && (
                        <p className="mt-2 text-xs leading-relaxed text-amber-200">
                          {fixedMaterializationReport.excludedUnboundedInactiveTemplateCount}{' '}
                          {fixedMaterializationReport.excludedUnboundedInactiveTemplateCount === 1
                            ? 'template foi excluído'
                            : 'templates foram excluídos'}{' '}
                          da expectativa histórica e{' '}
                          {fixedMaterializationReport.excludedUnboundedInactiveTemplateCount === 1
                            ? 'não será materializado'
                            : 'não serão materializados'}{' '}
                          por esta correção.
                        </p>
                      )}
                    </div>
                  )}

                  {fixedMaterializationReport.inconsistentOccurrences.length > 0 && (
                    <div className="rounded-lg border border-orange-700/60 bg-orange-900/10 p-3">
                      <div className="text-sm font-medium text-orange-100">
                        Inconsistências encontradas
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-orange-200">
                        Estes registros já existem, mas a vinculação precisa de análise. Eles não
                        são considerados ausentes e não serão corrigidos nem duplicados por esta ação.
                      </p>
                      <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                        {fixedMaterializationReport.inconsistentOccurrences.map((occurrence) => (
                          <div
                            key={`${occurrence.occurrenceKey}-${occurrence.issue}`}
                            className="rounded border border-orange-900/60 bg-[#11161d] p-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-medium text-white">{occurrence.description}</div>
                                <div className="mt-0.5 text-orange-200">
                                  {getFixedMaterializationIssueLabel(occurrence.issue)}
                                </div>
                              </div>
                              <div className="shrink-0 text-gray-300">
                                {formatCurrency(occurrence.amount)}
                              </div>
                            </div>
                            <p className="mt-1 leading-relaxed text-gray-300">{occurrence.message}</p>
                            {occurrence.transactionIds.length > 0 && (
                              <div className="mt-1 text-gray-500">
                                Transações relacionadas: {occurrence.transactionIds.join(', ')}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {fixedMaterializationError && (
                    <div className="rounded-lg border border-red-700/60 bg-red-900/10 p-3 text-sm text-red-200">
                      {fixedMaterializationError}
                    </div>
                  )}

                  {fixedMaterializationReport.errors &&
                    fixedMaterializationReport.errors.length > 0 && (
                      <div
                        className="rounded-lg border border-red-700/60 bg-red-900/10 p-3"
                        role="alert"
                      >
                        <div className="text-sm font-medium text-red-200">
                          Falhas da última tentativa
                        </div>
                        <div className="mt-2 space-y-2">
                          {fixedMaterializationReport.errors.map((item) => (
                            <div
                              key={item.occurrenceKey || `${item.templateId}-${item.description || 'erro'}`}
                              className="rounded border border-red-900/60 bg-[#11161d] p-2 text-xs"
                            >
                              <div className="font-medium text-white">
                                {item.description || `Template ${item.templateId}`}
                              </div>
                              <div className="mt-1 text-red-200">{item.error}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {fixedMaterializationReport.missingCount === 0 &&
                  fixedMaterializationReport.inconsistencyCount === 0 &&
                  fixedMaterializationReport.warnings.length === 0 ? (
                    <div className="rounded-lg border border-green-700/60 bg-green-900/10 p-3 text-sm text-green-200">
                      Todas as ocorrências fixas esperadas já estão materializadas ou ignoradas.
                    </div>
                  ) : fixedMaterializationReport.missingCount === 0 ? (
                    <div className="rounded-lg border border-gray-700 bg-[#11161d] p-3 text-sm text-gray-300">
                      Não há itens ausentes seguros para materializar. Os avisos e inconsistências
                      acima permanecem somente para análise e não serão alterados por esta ação.
                    </div>
                  ) : !fixedMaterializationReport.canMaterialize ? (
                    <div className="rounded-lg border border-amber-700/60 bg-amber-900/10 p-3 text-sm text-amber-200">
                      {getFixedMaterializationReasonMessage(fixedMaterializationReport.reason)}
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2 text-sm font-medium text-white">
                        Itens que ainda serão materializados
                      </div>
                      <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                        {fixedMaterializationReport.missingOccurrences.map((occurrence) => (
                          <div
                            key={occurrence.occurrenceKey}
                            className="rounded-lg border border-amber-800/60 bg-amber-900/10 p-3"
                          >
                            <div className="flex items-start justify-between gap-3 text-sm">
                              <div className="font-medium text-white">{occurrence.description}</div>
                              <div className="shrink-0 text-gray-200">
                                {formatCurrency(occurrence.amount)}
                              </div>
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              Ocorrência {formatCalendarDate(occurrence.occurrenceDate)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Modal>

            <Modal
              isOpen={Boolean(isAnticipationModalOpen && canAnticipateSelectedInvoice)}
              onClose={() => setIsAnticipationModalOpen(false)}
              title="Antecipar parcelas"
              loading={anticipationSubmitting}
              footer={
                <div className="flex justify-end gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setIsAnticipationModalOpen(false)}
                    disabled={anticipationSubmitting}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="accent"
                    onClick={() => void handleAnticipateInstallments()}
                    disabled={
                      anticipationLoading ||
                      anticipationSubmitting ||
                      selectedAnticipationIds.length === 0
                    }
                  >
                    {anticipationSubmitting
                      ? 'Antecipando...'
                      : `Antecipar ${selectedAnticipationIds.length || ''} parcela${selectedAnticipationIds.length === 1 ? '' : 's'}`}
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-700/50 bg-blue-900/10 p-3 text-sm text-blue-100">
                  As parcelas escolhidas sairão das faturas futuras e entrarão nesta fatura aberta.
                  A compra, a numeração das parcelas e a referência original permanecerão registradas.
                </div>

                {anticipationLoading ? (
                  <div className="space-y-2" aria-label="Carregando parcelas futuras">
                    <div className="h-14 animate-pulse rounded bg-[#1b212c]" />
                    <div className="h-14 animate-pulse rounded bg-[#1b212c]" />
                  </div>
                ) : anticipationCandidates.length === 0 ? (
                  <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4 text-sm text-gray-300">
                    Não há parcelas futuras disponíveis para antecipação.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={selectedAnticipationIds.length === anticipationCandidates.length}
                        onChange={(event) =>
                          setSelectedAnticipationIds(
                            event.target.checked
                              ? anticipationCandidates.map((candidate) => candidate.id)
                              : []
                          )
                        }
                        disabled={anticipationSubmitting}
                        className="rounded border-gray-600 bg-background text-accent focus:ring-accent"
                      />
                      Selecionar todas as parcelas futuras
                    </label>
                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                      {anticipationCandidates.map((candidate) => {
                        const selected = selectedAnticipationIds.includes(candidate.id);
                        return (
                          <label
                            key={candidate.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                              selected
                                ? 'border-blue-600 bg-blue-950/20'
                                : 'border-gray-700 bg-[#11161d]'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                setSelectedAnticipationIds((current) =>
                                  selected
                                    ? current.filter((id) => id !== candidate.id)
                                    : [...current, candidate.id]
                                )
                              }
                              disabled={anticipationSubmitting}
                              className="mt-1 rounded border-gray-600 bg-background text-accent focus:ring-accent"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-white">
                                {formatTransactionDescription(
                                  candidate.description,
                                  candidate.installmentNumber,
                                  candidate.totalInstallments
                                )}
                              </span>
                              <span className="mt-1 block text-xs text-gray-400">
                                Fatura{' '}
                                {getInvoiceReferenceLabel(
                                  candidate.creditCardInvoice.referenceYear,
                                  candidate.creditCardInvoice.referenceMonth
                                )}
                              </span>
                            </span>
                            <span className="shrink-0 font-medium text-gray-100">
                              {formatCurrency(candidate.amount)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Data da antecipação"
                    type="date"
                    value={anticipationData.anticipatedAt}
                    onChange={(event) =>
                      setAnticipationData((current) => ({
                        ...current,
                        anticipatedAt: event.target.value
                      }))
                    }
                    disabled={anticipationSubmitting}
                    className="mb-0"
                  />
                  <CurrencyInput
                    id="credit-card-anticipation-discount"
                    label="Desconto recebido"
                    value={anticipationData.discountAmount}
                    onChange={(discountAmount) =>
                      setAnticipationData((current) => ({ ...current, discountAmount }))
                    }
                    disabled={anticipationSubmitting}
                    className="mb-0"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-700 bg-[#11161d] p-3 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400">Parcelas</div>
                    <div className="mt-1 font-semibold text-white">
                      {formatCurrency(selectedAnticipationTotal)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400">Desconto</div>
                    <div className="mt-1 font-semibold text-green-300">
                      - {formatCurrency(Number(anticipationData.discountAmount || 0))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400">Impacto líquido</div>
                    <div className="mt-1 font-semibold text-white">
                      {formatCurrency(
                        Math.max(0, selectedAnticipationTotal - Number(anticipationData.discountAmount || 0))
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Observações
                  </label>
                  <textarea
                    value={anticipationData.notes}
                    onChange={(event) =>
                      setAnticipationData((current) => ({
                        ...current,
                        notes: event.target.value
                      }))
                    }
                    rows={3}
                    maxLength={1000}
                    placeholder="Opcional"
                    disabled={anticipationSubmitting}
                    className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  />
                </div>
              </div>
            </Modal>

            <Modal
              isOpen={Boolean(isPaymentModalOpen && canPaySelectedInvoice)}
              onClose={() => setIsPaymentModalOpen(false)}
              title="Registrar pagamento"
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
                    {paying ? 'Registrando...' : 'Registrar pagamento'}
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                <div>
                  <label htmlFor="credit-card-payment-account" className="mb-1 block text-sm font-medium text-gray-300">
                    Conta pagadora
                  </label>
                  <select
                    id="credit-card-payment-account"
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

                <CurrencyInput
                  id="credit-card-payment-amount"
                  label="Valor do pagamento"
                  value={paymentData.amount}
                  onChange={(amount) =>
                    setPaymentData((prev) => ({ ...prev, amount }))
                  }
                  disabled={paying}
                  required
                  className="mb-0"
                />

                {invoiceDetail && (
                  <div className="rounded-lg border border-gray-700 bg-[#11161d] px-3 py-2 text-xs text-gray-300">
                    Saldo atual: {formatCurrency(Math.max(0, Number(invoiceDetail.outstandingAmount ?? invoiceDetail.totalAmount ?? 0)))}.
                    {invoiceDetail.status === 'OPEN' && ' A fatura continuará aberta após o pagamento.'}
                  </div>
                )}

                <Input
                  id="credit-card-payment-date"
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

            <CreditCardCreditModal
              isOpen={Boolean(isCreditModalOpen && canAddCreditToSelectedInvoice)}
              accountId={accountId}
              submitting={creditSubmitting}
              onClose={() => setIsCreditModalOpen(false)}
              onSubmit={handleAddInvoiceCredit}
            />

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
