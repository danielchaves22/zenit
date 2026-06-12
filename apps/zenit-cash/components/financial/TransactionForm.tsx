import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { AutocompleteInput } from '@/components/ui/AutoCompleteInput';
import type { AutocompleteSuggestion } from '@/components/ui/AutoCompleteInput';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import CategorySelect from '@/components/financial/CategorySelect';
import TransactionSettlementModal from '@/components/financial/TransactionSettlementModal';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Save,
  Trash2,
  X
} from 'lucide-react';
import api from '@/lib/api';
import { formatTransactionDescription } from '@/utils/transactions';
import { formatAccountDisplayName } from '@/utils/accounts';
import { useAuth } from '@/contexts/AuthContext';
import {
  buildCreditCardInvoicePreview,
  formatInvoiceDate,
  getAvailableCreditLimit,
  getInvoiceDisplayStatus,
  getInvoiceDisplayStatusClasses,
  getInvoiceDisplayStatusLabel,
  getInvoiceReferenceLabel,
  getUsedCreditLimit
} from '@/utils/creditCards';
import {
  formatCalendarDate,
  getTodayDateValue,
  isCalendarDateAfter,
  isCalendarDateBefore,
  normalizeDateInputValue
} from '@/utils/financialStatus';
import { buildTransactionUpsertPayload } from '@/utils/transactionPayload';
import { resolveTransactionListPath } from '@/utils/transactionNavigation';

type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER';
type TransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELED';
type PurchaseScope = 'SINGLE' | 'FUTURE' | 'PURCHASE';
type CreateFlow = 'standard' | 'credit-card-purchase';
type PostCreateAction = 'default' | 'create-another';
type TransactionFormMode = 'simple' | 'detailed';

const TRANSACTION_FORM_MODE_STORAGE_KEY = 'transactionFormMode';

interface Account {
  id: number;
  name: string;
  type: string;
  balance?: string;
  creditLimit?: string | null;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
  isDefault: boolean;
  isActive: boolean;
}

interface Category {
  id: number;
  name: string;
  type: string;
  color: string;
  icon?: string;
  isDefault: boolean;
}

interface InvoiceSummary {
  id: number;
  referenceYear: number;
  referenceMonth: number;
  dueDate?: string | null;
  status: string;
  settlementType?: string | null;
  paymentTransactionId?: number | null;
}

interface CreditCardInvoicePreviewStatus {
  id: number;
  referenceYear: number;
  referenceMonth: number;
  dueDate: string;
  status: string;
  displayStatus?: string;
  settlementType?: string | null;
}

interface PurchaseGroupTransaction {
  id: number;
  description: string;
  amount: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  dueDate?: string;
  scheduledDate?: string;
  status: TransactionStatus;
  isExternalCreditCardSettlement?: boolean;
  creditCardInvoice?: InvoiceSummary | null;
}

interface Transaction {
  id: number;
  description: string;
  amount: string;
  date: string;
  dueDate?: string;
  effectiveDate?: string;
  type: TransactionKind;
  status: TransactionStatus;
  notes?: string;
  repeatTimes?: number | null;
  fromAccount?: { id: number; name: string; type?: string };
  toAccount?: { id: number; name: string; type?: string };
  category?: {
    id: number;
    name: string;
    color: string;
    icon?: string;
  };
  tags: { id: number; name: string }[];
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  purchaseGroupId?: string | null;
  creditCardInvoice?: InvoiceSummary | null;
  purchaseGroupTransactions?: PurchaseGroupTransaction[];
}

interface TransactionFormProps {
  mode: 'create' | 'edit';
  transactionId?: string;
  initialType?: TransactionKind;
  isTypeLocked?: boolean;
  createFlow?: CreateFlow;
  defaultCreditCardId?: string | null;
  defaultFinancialAccountId?: string | null;
  returnTo?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onTransactionLoaded?: (transaction: Transaction) => void;
}

function getTodayValue() {
  return getTodayDateValue();
}

function readStoredTransactionFormMode(): TransactionFormMode {
  if (typeof window === 'undefined') {
    return 'detailed';
  }

  const storedMode = window.localStorage.getItem(TRANSACTION_FORM_MODE_STORAGE_KEY);
  return storedMode === 'simple' || storedMode === 'detailed' ? storedMode : 'detailed';
}

function storeTransactionFormMode(nextMode: TransactionFormMode) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(TRANSACTION_FORM_MODE_STORAGE_KEY, nextMode);
}

function formatCurrency(value: string | number) {
  const amount = typeof value === 'number' ? value : Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number.isNaN(amount) ? 0 : amount);
}

function toInputDate(value?: string | null) {
  return normalizeDateInputValue(value);
}

function isFutureInstallment(transaction?: PurchaseGroupTransaction | null) {
  if (!transaction) {
    return false;
  }

  const invoicePaid = transaction.creditCardInvoice?.status === 'PAID';
  if (invoicePaid) {
    return false;
  }

  const referenceDate = transaction.scheduledDate || transaction.dueDate;
  if (!referenceDate) {
    return false;
  }

  return isCalendarDateAfter(referenceDate);
}

function getPrimaryDateLabel(type: TransactionKind, isCreditCardContext: boolean) {
  if (isCreditCardContext) {
    return 'Data da Compra';
  }

  switch (type) {
    case 'INCOME':
      return 'Data da Receita';
    case 'TRANSFER':
      return 'Data da Transferencia';
    case 'EXPENSE':
    default:
      return 'Data da Despesa';
  }
}

function getSettlementToggleLabel(type: TransactionKind) {
  switch (type) {
    case 'INCOME':
      return 'Ja foi recebida?';
    case 'TRANSFER':
      return 'Ja foi efetivada?';
    case 'EXPENSE':
    default:
      return 'Ja foi paga?';
  }
}

function getSettlementDateLabel(type: TransactionKind) {
  switch (type) {
    case 'INCOME':
      return 'Data do recebimento';
    case 'TRANSFER':
      return 'Data da efetivacao';
    case 'EXPENSE':
    default:
      return 'Data do pagamento';
  }
}

function getSettlementActionLabel(type: Extract<TransactionKind, 'EXPENSE' | 'INCOME'>) {
  return type === 'EXPENSE' ? 'Liquidar despesa' : 'Liquidar receita';
}

function getCompletionHint(type: TransactionKind, isCompleted: boolean, liquidationDate: string) {
  if (!isCompleted) {
    return '(pendente)';
  }

  const action = type === 'INCOME' ? 'recebida' : type === 'TRANSFER' ? 'efetivada' : 'paga';

  if (!liquidationDate) {
    return `(${action} hoje)`;
  }

  return `(${action} em ${formatCalendarDate(liquidationDate)})`;
}

export default function TransactionForm({
  mode,
  transactionId,
  initialType = 'EXPENSE',
  isTypeLocked = false,
  createFlow = 'standard',
  defaultCreditCardId = null,
  defaultFinancialAccountId = null,
  returnTo = null,
  onSuccess,
  onCancel,
  onTransactionLoaded
}: TransactionFormProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  const { userRole } = useAuth();
  const isSuperuser = userRole === 'SUPERUSER';

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [shouldFocusAmount, setShouldFocusAmount] = useState(mode === 'create');
  const [formMode, setFormMode] = useState<TransactionFormMode>(readStoredTransactionFormMode);
  const [isInvoicePreviewExpanded, setIsInvoicePreviewExpanded] = useState(false);
  const [existingCreditCardInvoices, setExistingCreditCardInvoices] = useState<CreditCardInvoicePreviewStatus[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const postCreateActionRef = useRef<PostCreateAction>('default');
  const lastCreateTransactionDateRef = useRef(getTodayValue());

  const [formData, setFormData] = useState({
    description: '',
    amount: '0.00',
    date: getTodayValue(),
    dueDate: getTodayValue(),
    liquidationDate: getTodayValue(),
    type: initialType,
    status: 'COMPLETED' as TransactionStatus,
    notes: '',
    fromAccountId: '',
    toAccountId: '',
    categoryId: '',
    tags: '',
    repeatTimes: '',
    installmentCount: '1',
    purchaseScope: 'PURCHASE' as PurchaseScope
  });

  const [isRecurring, setIsRecurring] = useState(false);
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);
  const [settlementAccountId, setSettlementAccountId] = useState('');
  const [settlementDate, setSettlementDate] = useState(getTodayValue());
  const [settlementNotes, setSettlementNotes] = useState('');
  const isCreditCardPurchaseFlow = mode === 'create' && createFlow === 'credit-card-purchase';

  const selectedFromAccount = useMemo(
    () => accounts.find((account) => account.id.toString() === formData.fromAccountId) || null,
    [accounts, formData.fromAccountId]
  );
  const selectedToAccount = useMemo(
    () => accounts.find((account) => account.id.toString() === formData.toAccountId) || null,
    [accounts, formData.toAccountId]
  );

  const filterSelectableAccounts = (selectedAccountId: string, allowCreditCard: boolean) => {
    return accounts.filter((account) => {
      const isSelected = account.id.toString() === selectedAccountId;

      if (mode === 'edit' && isSelected) {
        return true;
      }

      if (!account.isActive) {
        return false;
      }

      return allowCreditCard ? account.type === 'CREDIT_CARD' : account.type !== 'CREDIT_CARD';
    });
  };

  const availableFromAccounts = useMemo(() => {
    if (isCreditCardPurchaseFlow) {
      return filterSelectableAccounts(formData.fromAccountId, true);
    }

    return filterSelectableAccounts(formData.fromAccountId, false);
  }, [accounts, formData.fromAccountId, isCreditCardPurchaseFlow, mode]);

  const availableToAccounts = useMemo(() => {
    return filterSelectableAccounts(formData.toAccountId, false);
  }, [accounts, formData.toAccountId, mode]);
  const settlementAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const isSelected = account.id.toString() === settlementAccountId;
      return account.type !== 'CREDIT_CARD' && (account.isActive || isSelected);
    });
  }, [accounts, settlementAccountId]);

  const isCreditCardExpense =
    formData.type === 'EXPENSE' &&
    selectedFromAccount?.type === 'CREDIT_CARD' &&
    isCreditCardPurchaseFlow;

  const installmentCountValue = Math.max(Number(formData.installmentCount || 1), 1);
  const amountValue = Number(formData.amount || 0) || 0;
  const totalCommittedAmount = isCreditCardExpense
    ? amountValue * installmentCountValue
    : amountValue;
  const invoicePreview = useMemo(
    () => buildCreditCardInvoicePreview(selectedFromAccount, formData.date, installmentCountValue),
    [formData.date, installmentCountValue, selectedFromAccount]
  );
  const existingCreditCardInvoicesByReference = useMemo(() => {
    return new Map(
      existingCreditCardInvoices.map((invoice) => [
        `${invoice.referenceYear}-${invoice.referenceMonth}`,
        invoice
      ])
    );
  }, [existingCreditCardInvoices]);
  const resolvedInvoicePreview = useMemo(() => {
    return invoicePreview.map((item) => {
      const referenceLabel = getInvoiceReferenceLabel(item.referenceYear, item.referenceMonth);
      const existingInvoice =
        existingCreditCardInvoicesByReference.get(`${item.referenceYear}-${item.referenceMonth}`) || null;
      const shouldSettleExternally = existingInvoice
        ? existingInvoice.status === 'PAID'
        : isCalendarDateBefore(item.dueDate);

      return {
        ...item,
        existingInvoice,
        shouldSettleExternally,
        destinationLabel: shouldSettleExternally
          ? existingInvoice?.status === 'PAID'
            ? `Fatura ${referenceLabel} ja paga - liquidada fora do sistema`
            : 'Historica liquidada fora do sistema'
          : `Entrara na fatura ${referenceLabel}`
      };
    });
  }, [existingCreditCardInvoicesByReference, invoicePreview]);
  const currentLimitImpactAmount = isCreditCardExpense
    ? amountValue * resolvedInvoicePreview.filter((item) => !item.shouldSettleExternally).length
    : amountValue;
  const currentLimitImpactInstallmentCount = resolvedInvoicePreview.filter(
    (item) => !item.shouldSettleExternally
  ).length;
  const impactedInvoicesCount = new Set(
    resolvedInvoicePreview
      .filter((item) => !item.shouldSettleExternally)
      .map((item) => `${item.referenceYear}-${item.referenceMonth}`)
  ).size;
  const availableLimit = isCreditCardExpense ? getAvailableCreditLimit(selectedFromAccount) : null;
  const projectedAvailableLimit = availableLimit === null ? null : availableLimit - currentLimitImpactAmount;
  const projectedUsedLimit = isCreditCardExpense
    ? getUsedCreditLimit(selectedFromAccount) + currentLimitImpactAmount
    : 0;

  const purchaseGroupTransactions = transaction?.purchaseGroupTransactions || [];
  const isGroupedCreditCardPurchase = Boolean(transaction?.purchaseGroupId);
  const isCreditCardContext = isCreditCardPurchaseFlow || isGroupedCreditCardPurchase;
  const currentGroupTransaction = purchaseGroupTransactions.find((item) => item.id === transaction?.id) || null;
  const currentGroupTransactionIndex = purchaseGroupTransactions.findIndex((item) => item.id === transaction?.id);
  const futureScopeTransactions =
    currentGroupTransactionIndex >= 0
      ? purchaseGroupTransactions.slice(currentGroupTransactionIndex)
      : [];
  const hasPaidInvoiceInGroup = purchaseGroupTransactions.some((item) => item.creditCardInvoice?.status === 'PAID');
  const canEditPurchaseScope = isGroupedCreditCardPurchase && !hasPaidInvoiceInGroup;
  const canEditSingleScope = isGroupedCreditCardPurchase && isFutureInstallment(currentGroupTransaction);
  const canEditFutureScope =
    isGroupedCreditCardPurchase &&
    canEditSingleScope &&
    futureScopeTransactions.length > 1 &&
    futureScopeTransactions.every((item) => item.creditCardInvoice?.status !== 'PAID');
  const activePurchaseScope = isGroupedCreditCardPurchase ? formData.purchaseScope : 'SINGLE';
  const currentScopeBlocked =
    isGroupedCreditCardPurchase &&
    ((activePurchaseScope === 'PURCHASE' && !canEditPurchaseScope) ||
      (activePurchaseScope === 'FUTURE' && !canEditFutureScope) ||
      (activePurchaseScope === 'SINGLE' && !canEditSingleScope));
  const isCompletedReadOnly =
    mode === 'edit' &&
    transaction?.status === 'COMPLETED' &&
    !transaction?.purchaseGroupId;
  const isReadOnly = currentScopeBlocked || (isCompletedReadOnly && !isSuperuser);
  const showActions = isGroupedCreditCardPurchase ? true : !isCompletedReadOnly || isSuperuser;
  const actionDisabled = saving || isReadOnly;
  const isPending = formData.status === 'PENDING';
  const isSimpleMode = formMode === 'simple';
  const isCompleted = formData.status === 'COMPLETED';
  const isCanceled = formData.status === 'CANCELED';
  const isExpense = formData.type === 'EXPENSE';
  const isIncome = formData.type === 'INCOME';
  const isTransfer = formData.type === 'TRANSFER';
  const availableCategories = useMemo(
    () =>
      categories.filter((category) => category.type === formData.type),
    [categories, formData.type]
  );
  const showCreditCardPurchasePreview = mode === 'create' && isCreditCardPurchaseFlow;
  const listReturnPath = useMemo(
    () =>
      resolveTransactionListPath({
        explicitReturnTo: returnTo,
        createFlow,
        defaultCreditCardId,
        fromAccountId: formData.fromAccountId,
        selectedFromAccountType: selectedFromAccount?.type ?? null,
        transactionFromAccountId: transaction?.fromAccount?.id ?? null,
        transactionFromAccountType: transaction?.fromAccount?.type ?? null
      }),
    [
      returnTo,
      createFlow,
      defaultCreditCardId,
      formData.fromAccountId,
      selectedFromAccount?.type,
      transaction?.fromAccount?.id,
      transaction?.fromAccount?.type
    ]
  );
  const completionHint = getCompletionHint(formData.type, isCompleted, formData.liquidationDate);
  const primaryDateLabel = getPrimaryDateLabel(formData.type, isCreditCardContext);
  const settlementToggleLabel = getSettlementToggleLabel(formData.type);
  const settlementDateLabel = getSettlementDateLabel(formData.type);
  const settlementActionLabel = isExpense
    ? getSettlementActionLabel('EXPENSE')
    : isIncome
      ? getSettlementActionLabel('INCOME')
      : 'Liquidar transacao';
  const requiresFromAccount = isTransfer || (isExpense && isCompleted);
  const requiresToAccount = isTransfer || (isIncome && isCompleted);
  const canOpenSettlementModal =
    mode === 'edit' &&
    isPending &&
    !isReadOnly &&
    !isCreditCardContext &&
    !isGroupedCreditCardPurchase &&
    (isExpense || isIncome);
  const showInlineSettlementControls = !isCreditCardPurchaseFlow && !canOpenSettlementModal;

  const accountFieldsDisabled = saving || isReadOnly || isGroupedCreditCardPurchase;
  const statusDisabled = saving || isReadOnly || isCreditCardPurchaseFlow || isGroupedCreditCardPurchase;
  const dueDateDisabled = saving || isReadOnly || isCreditCardPurchaseFlow || isGroupedCreditCardPurchase;
  const liquidationDateDisabled =
    saving ||
    isReadOnly ||
    isCreditCardPurchaseFlow ||
    isGroupedCreditCardPurchase;
  const transactionDateDisabled = saving || isReadOnly || isGroupedCreditCardPurchase;

  useEffect(() => {
    void fetchAccounts();
    void fetchCategories();

    if (mode === 'edit' && transactionId) {
      void fetchTransaction();
    }
  }, [mode, transactionId]);

  useEffect(() => {
    if (mode === 'create' && shouldFocusAmount && !loading) {
      const amountInput = document.getElementById('amount');
      if (amountInput) {
        setTimeout(() => {
          amountInput.focus();
          setShouldFocusAmount(false);
        }, 100);
      }
    }
  }, [loading, mode, shouldFocusAmount]);

  useEffect(() => {
    if (mode === 'create' && !defaultsLoaded && accounts.length > 0 && categories.length > 0) {
      autoSelectDefaults();
      setDefaultsLoaded(true);
    }
  }, [accounts, categories, defaultCreditCardId, defaultFinancialAccountId, defaultsLoaded, mode, formData.type]);

  useEffect(() => {
    if (!isGroupedCreditCardPurchase) {
      return;
    }

    setFormData((prev) => {
      const nextScope: PurchaseScope = canEditPurchaseScope
        ? 'PURCHASE'
        : canEditFutureScope
          ? 'FUTURE'
        : canEditSingleScope
          ? 'SINGLE'
          : prev.purchaseScope;

      if (prev.purchaseScope === nextScope) {
        return prev;
      }

      return { ...prev, purchaseScope: nextScope };
    });
  }, [canEditFutureScope, canEditPurchaseScope, canEditSingleScope, isGroupedCreditCardPurchase]);

  useEffect(() => {
    if (!isCreditCardPurchaseFlow) {
      return;
    }

    setIsRecurring(false);
    setFormData((prev) => ({
      ...prev,
      type: 'EXPENSE',
      status: 'COMPLETED',
      repeatTimes: '',
      liquidationDate: prev.date || getTodayValue()
    }));
  }, [isCreditCardPurchaseFlow]);

  useEffect(() => {
    if (!isCreditCardPurchaseFlow) {
      return;
    }

    setFormData((prev) => {
      if (prev.liquidationDate === prev.date) {
        return prev;
      }

      return {
        ...prev,
        liquidationDate: prev.date
      };
    });
  }, [formData.date, isCreditCardPurchaseFlow]);

  useEffect(() => {
    if (lastCreateTransactionDateRef.current === formData.date) {
      return;
    }

    lastCreateTransactionDateRef.current = formData.date;

    if (mode !== 'create' || isCreditCardPurchaseFlow || formData.status !== 'COMPLETED') {
      return;
    }

    setFormData((prev) => {
      if (prev.dueDate === prev.date && prev.liquidationDate === prev.date) {
        return prev;
      }

      return {
        ...prev,
        dueDate: prev.date,
        liquidationDate: prev.date
      };
    });
  }, [formData.date, formData.status, isCreditCardPurchaseFlow, mode]);

  useEffect(() => {
    if (!isCreditCardPurchaseFlow || !defaultCreditCardId || accounts.length === 0 || formData.fromAccountId) {
      return;
    }

    const requestedCard = accounts.find(
      (account) =>
        account.id.toString() === defaultCreditCardId &&
        account.type === 'CREDIT_CARD' &&
        account.isActive
    );

    if (!requestedCard) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      fromAccountId: requestedCard.id.toString()
    }));
  }, [accounts, defaultCreditCardId, formData.fromAccountId, isCreditCardPurchaseFlow]);

  useEffect(() => {
    if (!isCreditCardPurchaseFlow || !selectedFromAccount || selectedFromAccount.type !== 'CREDIT_CARD') {
      setExistingCreditCardInvoices([]);
      return;
    }

    void fetchCreditCardInvoices(selectedFromAccount.id);
  }, [isCreditCardPurchaseFlow, selectedFromAccount?.id, selectedFromAccount?.type]);

  const fetchAutocompleteSuggestions = async (query: string): Promise<AutocompleteSuggestion[]> => {
    if (query.length < 3) {
      return [];
    }

    try {
      const response = await api.get('/financial/transactions/autocomplete', {
        params: {
          q: query,
          type: formData.type
        }
      });
      return response.data.suggestions || [];
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
      return [];
    }
  };

  async function fetchCreditCardInvoices(accountId: number) {
    try {
      const response = await api.get(`/financial/credit-cards/${accountId}/invoices`);
      setExistingCreditCardInvoices(response.data || []);
    } catch (error: any) {
      setExistingCreditCardInvoices([]);
      addToast(error.response?.data?.error || 'Erro ao carregar previsão de faturas do cartão', 'error');
    }
  }

  async function fetchTransaction() {
    if (!transactionId) {
      return;
    }

    try {
      const response = await api.get(`/financial/transactions/${transactionId}`);
      const rawTxn = response.data as Transaction;
      const normalizedStatus: TransactionStatus =
        rawTxn.status === 'CANCELED'
          ? 'CANCELED'
          : rawTxn.effectiveDate
            ? 'COMPLETED'
            : rawTxn.status;
      const txn = {
        ...rawTxn,
        status: normalizedStatus
      };

      setTransaction(txn);
      if (onTransactionLoaded) {
        onTransactionLoaded(txn);
      }

      setIsRecurring(Boolean(txn.repeatTimes && txn.repeatTimes > 0));
      setFormData({
        description: txn.description,
        amount: txn.amount,
        date: toInputDate(txn.date) || getTodayValue(),
        dueDate: toInputDate(txn.dueDate) || getTodayValue(),
        liquidationDate: toInputDate(txn.effectiveDate),
        type: txn.type,
        status: normalizedStatus,
        notes: txn.notes || '',
        fromAccountId: txn.fromAccount?.id.toString() || '',
        toAccountId: txn.toAccount?.id.toString() || '',
        categoryId: txn.category?.id.toString() || '',
        tags: txn.tags.map((tag) => tag.name).join(', '),
        repeatTimes: txn.repeatTimes?.toString() || '',
        installmentCount: txn.totalInstallments?.toString() || '1',
        purchaseScope: 'PURCHASE'
      });
    } catch (error: any) {
      console.error('Erro ao carregar transação:', error);
      addToast('Erro ao carregar dados da transação', 'error');
      handleCancel();
    } finally {
      setLoading(false);
    }
  }

  async function fetchAccounts() {
    try {
      const response = await api.get('/financial/accounts');
      setAccounts(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
      addToast('Erro ao carregar contas', 'error');
    }
  }

  async function fetchCategories() {
    try {
      const response = await api.get('/financial/categories');
      setCategories(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
      addToast('Erro ao carregar categorias', 'error');
    }
  }

  function getDefaultCategoryId(type: TransactionKind) {
    const defaultCategory = categories.find(
      (category) => category.isDefault && category.type === type
    );
    const fallbackCategory = categories.find((category) => category.type === type);

    return defaultCategory?.id.toString() || fallbackCategory?.id.toString() || '';
  }

  function resetCreditCardPurchaseForm(fromAccountId: string) {
    setFormData({
      description: '',
      amount: '0.00',
      date: getTodayValue(),
      dueDate: getTodayValue(),
      liquidationDate: getTodayValue(),
      type: 'EXPENSE',
      status: 'COMPLETED',
      notes: '',
      fromAccountId,
      toAccountId: '',
      categoryId: getDefaultCategoryId('EXPENSE'),
      tags: '',
      repeatTimes: '',
      installmentCount: '1',
      purchaseScope: 'PURCHASE'
    });
    setIsInvoicePreviewExpanded(false);
    setShouldFocusAmount(true);
  }

  function getCreateAnotherAccountsToKeep(type: TransactionKind) {
    switch (type) {
      case 'INCOME':
        return {
          fromAccountId: '',
          toAccountId: formData.toAccountId
        };
      case 'TRANSFER':
        return {
          fromAccountId: formData.fromAccountId,
          toAccountId: formData.toAccountId
        };
      case 'EXPENSE':
      default:
        return {
          fromAccountId: formData.fromAccountId,
          toAccountId: ''
        };
    }
  }

  function resetStandardTransactionForm(type: TransactionKind, status: TransactionStatus) {
    const today = getTodayValue();
    const nextStatus = status === 'CANCELED' ? 'PENDING' : status;
    const preservedAccounts = getCreateAnotherAccountsToKeep(type);

    setFormData({
      description: '',
      amount: '0.00',
      date: today,
      dueDate: today,
      liquidationDate: nextStatus === 'COMPLETED' ? today : '',
      type,
      status: nextStatus,
      notes: '',
      fromAccountId: preservedAccounts.fromAccountId,
      toAccountId: preservedAccounts.toAccountId,
      categoryId: type === 'TRANSFER' ? '' : getDefaultCategoryId(type),
      tags: '',
      repeatTimes: '',
      installmentCount: '1',
      purchaseScope: 'PURCHASE'
    });
    setIsRecurring(false);
    setShouldFocusAmount(true);
  }

  function autoSelectDefaults() {
    const updates: Partial<typeof formData> = {};

    if (!formData.fromAccountId && !formData.toAccountId) {
      if (isCreditCardPurchaseFlow) {
        const requestedCard = defaultCreditCardId
          ? accounts.find(
              (account) =>
                account.id.toString() === defaultCreditCardId &&
                account.type === 'CREDIT_CARD' &&
                account.isActive
            )
          : null;
        const fallbackCard = accounts.find(
          (account) => account.type === 'CREDIT_CARD' && account.isActive
        );
        const nextCard = requestedCard || fallbackCard;

        if (nextCard) {
          updates.fromAccountId = nextCard.id.toString();
        }
      } else {
        const requestedFinancialAccount = defaultFinancialAccountId
          ? accounts.find(
              (account) =>
                account.id.toString() === defaultFinancialAccountId &&
                account.isActive &&
                account.type !== 'CREDIT_CARD'
            )
          : null;
        const defaultAccount = accounts.find(
          (account) => account.isDefault && account.isActive && account.type !== 'CREDIT_CARD'
        );
        const fallbackAccount = accounts.find(
          (account) => account.isActive && account.type !== 'CREDIT_CARD'
        );
        const nextAccount = requestedFinancialAccount || defaultAccount || fallbackAccount;

        if (nextAccount) {
          if (formData.type === 'EXPENSE') {
            updates.fromAccountId = nextAccount.id.toString();
          } else if (formData.type === 'INCOME') {
            updates.toAccountId = nextAccount.id.toString();
          }
        }
      }
    }

    if (!formData.categoryId && formData.type !== 'TRANSFER') {
      const nextCategoryId = getDefaultCategoryId(formData.type);

      if (nextCategoryId) {
        updates.categoryId = nextCategoryId;
      }
    }

    if (!formData.date) {
      updates.date = getTodayValue();
    }

    if (!formData.dueDate) {
      updates.dueDate = getTodayValue();
    }

    if (!formData.liquidationDate && formData.status === 'COMPLETED') {
      updates.liquidationDate = getTodayValue();
    }

    if (Object.keys(updates).length > 0) {
      setFormData((prev) => ({ ...prev, ...updates }));
    }
  }

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;

    if (name === 'type' && !isTypeLocked) {
      const nextType = value as TransactionKind;

      setFormData((prev) => {
        const nextState = {
          ...prev,
          type: nextType,
          fromAccountId: nextType === 'INCOME' ? '' : prev.fromAccountId,
          toAccountId: nextType === 'EXPENSE' ? '' : prev.toAccountId,
          repeatTimes: nextType === 'TRANSFER' ? '' : prev.repeatTimes
        };

        return nextState;
      });

      setFormData((prev) => ({
        ...prev,
        categoryId: getDefaultCategoryId(nextType)
      }));

      return;
    }

    setFormData((prev) => {
      const updated = { ...prev, [name]: value };

      if (name === 'status') {
        if (value === 'COMPLETED') {
          updated.liquidationDate = prev.liquidationDate || prev.date || getTodayValue();
        }

        if (value === 'PENDING' || value === 'CANCELED') {
          updated.liquidationDate = '';
        }
      }

      if (name === 'date') {
        if (isCreditCardPurchaseFlow) {
          updated.liquidationDate = value;
        } else if (prev.status === 'COMPLETED') {
          updated.dueDate = value;
          updated.liquidationDate = value;
        }
      }

      return updated;
    });
  };

  const handleDescriptionChange = (value: string) => {
    setFormData((prev) => ({ ...prev, description: value }));
  };

  const handleSuggestionSelect = (suggestion: AutocompleteSuggestion) => {
    const nextCategoryId = suggestion.categoryId ? suggestion.categoryId.toString() : '';
    const hasKnownCategory = nextCategoryId
      ? categories.some((category) => category.id.toString() === nextCategoryId)
      : false;

    setFormData((prev) => ({
      ...prev,
      description: suggestion.description,
      categoryId: hasKnownCategory ? nextCategoryId : ''
    }));
  };

  const handleAmountChange = (value: string) => {
    setFormData((prev) => ({ ...prev, amount: value }));
  };

  const handleFormModeChange = (nextMode: TransactionFormMode) => {
    if (saving) {
      return;
    }

    setFormMode(nextMode);
    storeTransactionFormMode(nextMode);
  };

  const handleRecurringChange = (checked: boolean) => {
    setIsRecurring(checked);
    if (!checked) {
      setFormData((prev) => ({ ...prev, repeatTimes: '' }));
    }
  };

  const handleSimpleStatusChange = (checked: boolean) => {
    setFormData((prev) => {
      const today = getTodayValue();
      return {
        ...prev,
        status: checked ? 'COMPLETED' : 'PENDING',
        liquidationDate: checked ? (prev.liquidationDate || today) : ''
      };
    });
  };

  const handleOpenSettlementModal = () => {
    if (!(isExpense || isIncome)) {
      return;
    }

    setSettlementAccountId(isExpense ? formData.fromAccountId : formData.toAccountId);
    setSettlementDate(formData.liquidationDate || getTodayValue());
    setSettlementNotes(formData.notes || '');
    setIsSettlementModalOpen(true);
  };

  const handleCloseSettlementModal = () => {
    if (saving) {
      return;
    }

    setIsSettlementModalOpen(false);
  };

  const handleConfirmSettlement = async () => {
    if (!transactionId || !(isExpense || isIncome)) {
      return;
    }

    if (!settlementAccountId) {
      addToast(
        isExpense ? 'Selecione a conta do pagamento' : 'Selecione a conta do recebimento',
        'error'
      );
      return;
    }

    if (!settlementDate) {
      addToast(`Informe ${getSettlementDateLabel(formData.type).toLowerCase()}`, 'error');
      return;
    }

    if (formData.type === 'TRANSFER' && (!formData.fromAccountId || !formData.toAccountId)) {
      addToast('Informe as contas de origem e destino para a transferencia', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = buildTransactionUpsertPayload(formData, {
        status: 'COMPLETED',
        liquidationDate: settlementDate,
        notes: settlementNotes,
        fromAccountId: isExpense ? settlementAccountId : formData.fromAccountId,
        toAccountId: isIncome ? settlementAccountId : formData.toAccountId,
        repeatTimes: !isCreditCardPurchaseFlow && isRecurring ? Number(formData.repeatTimes || 0) : 0
      });

      await api.put(`/financial/transactions/${transactionId}`, payload);

      setFormData((prev) => ({
        ...prev,
        status: 'COMPLETED',
        liquidationDate: settlementDate,
        notes: settlementNotes,
        fromAccountId: isExpense ? settlementAccountId : prev.fromAccountId,
        toAccountId: isIncome ? settlementAccountId : prev.toAccountId
      }));
      setIsSettlementModalOpen(false);
      addToast(isExpense ? 'Despesa liquidada com sucesso' : 'Receita liquidada com sucesso', 'success');
      await fetchTransaction();
    } catch (error: any) {
      console.error('Erro ao liquidar transacao:', error);
      addToast(error.response?.data?.error || 'Erro ao liquidar transacao', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePurchaseScopeChange = (scope: PurchaseScope) => {
    setFormData((prev) => ({ ...prev, purchaseScope: scope }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const postCreateAction = postCreateActionRef.current;
    postCreateActionRef.current = 'default';

    if (mode === 'create' && isCreditCardPurchaseFlow && selectedFromAccount?.type !== 'CREDIT_CARD') {
      addToast('Selecione um cartão de crédito para registrar a compra', 'error');
      return;
    }

    if (mode === 'create' && !isCreditCardPurchaseFlow && selectedFromAccount?.type === 'CREDIT_CARD') {
      addToast('Use a tela de compra no cartão para lançamentos em cartão de crédito', 'error');
      return;
    }

    if (mode === 'create' && !isCreditCardPurchaseFlow && selectedToAccount?.type === 'CREDIT_CARD') {
      addToast('Operações com cartão devem ser feitas na área de cartões e faturas', 'error');
      return;
    }

    if (mode === 'create' && isCreditCardPurchaseFlow && !selectedFromAccount?.statementClosingDay) {
      addToast('Configure o fechamento e vencimento do cartão antes de lançar a compra', 'error');
      return;
    }

    if (mode === 'create' && isCreditCardPurchaseFlow && installmentCountValue < 1) {
      addToast('Quantidade de parcelas deve ser maior que zero', 'error');
      return;
    }

    const requiresSettlementAccount =
      formData.status === 'COMPLETED' || Boolean(formData.liquidationDate);

    if (formData.type === 'TRANSFER' && (!formData.fromAccountId || !formData.toAccountId)) {
      addToast('Informe as contas de origem e destino para a transferencia', 'error');
      return;
    }

    if (formData.type === 'EXPENSE' && requiresSettlementAccount && !formData.fromAccountId) {
      addToast('Informe a conta do pagamento para liquidar a despesa', 'error');
      return;
    }

    if (formData.type === 'INCOME' && requiresSettlementAccount && !formData.toAccountId) {
      addToast('Informe a conta do recebimento para liquidar a receita', 'error');
      return;
    }

    let normalizedStatus = formData.status;
    let normalizedLiquidationDate = formData.liquidationDate;

    if (normalizedStatus === 'PENDING' || normalizedStatus === 'CANCELED') {
      normalizedLiquidationDate = '';
    }

    if (normalizedStatus !== 'CANCELED' && normalizedLiquidationDate) {
      normalizedStatus = 'COMPLETED';
    }

    if (normalizedStatus === 'COMPLETED' && !normalizedLiquidationDate) {
      addToast('Informe a data de liquidação para transações concluídas', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = buildTransactionUpsertPayload(formData, {
        status: normalizedStatus,
        liquidationDate: normalizedLiquidationDate,
        repeatTimes: !isCreditCardPurchaseFlow && isRecurring ? Number(formData.repeatTimes || 0) : 0
      });

      if (mode === 'edit' && transaction?.purchaseGroupId) {
        payload.description = formData.description;
        payload.amount = parseFloat(formData.amount);
        payload.categoryId = formData.categoryId ? parseInt(formData.categoryId, 10) : null;
        payload.tags = formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean);
        payload.notes = formData.notes;
        payload.purchaseScope = formData.purchaseScope;

        delete payload.date;
        delete payload.dueDate;
        delete payload.effectiveDate;
        delete payload.type;
        delete payload.status;
        delete payload.fromAccountId;
        delete payload.toAccountId;
        delete payload.repeatTimes;
      }

      delete payload.installmentCount;
      if (mode === 'create' && isCreditCardPurchaseFlow) {
        payload.installmentCount = installmentCountValue;
      }

      if (mode === 'create') {
        await api.post('/financial/transactions', payload);
        addToast(
          isCreditCardPurchaseFlow ? 'Compra no cartão registrada com sucesso' : 'Transação criada com sucesso',
          'success'
        );
        if (postCreateAction === 'create-another') {
          if (isCreditCardPurchaseFlow) {
            resetCreditCardPurchaseForm(formData.fromAccountId);
          } else {
            resetStandardTransactionForm(formData.type, normalizedStatus);
          }
          return;
        }
      } else {
        await api.put(`/financial/transactions/${transactionId}`, payload);
        addToast('Transação atualizada com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push(listReturnPath);
      }
    } catch (error: any) {
      console.error('Erro ao salvar transação:', error);
      addToast(
        error.response?.data?.error || `Erro ao ${mode === 'create' ? 'criar' : 'atualizar'} transação`,
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!transaction) {
      return;
    }

    const isPurchaseDelete = transaction.purchaseGroupId && formData.purchaseScope === 'PURCHASE';
    const isFutureDelete = transaction.purchaseGroupId && formData.purchaseScope === 'FUTURE';
    const scopeLabel = isPurchaseDelete
      ? 'a compra inteira'
      : isFutureDelete
        ? 'esta parcela e as futuras'
        : 'esta parcela';

    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir ${scopeLabel} "${formatTransactionDescription(
          transaction.description,
          transaction.installmentNumber,
          transaction.totalInstallments
        )}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/transactions/${transactionId}`, {
            params: transaction.purchaseGroupId
              ? { scope: formData.purchaseScope.toLowerCase() }
              : undefined
          });

          addToast('Transação excluída com sucesso', 'success');

          if (onSuccess) {
            onSuccess();
          } else {
            router.push(listReturnPath);
          }
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir transação', 'error');
          throw error;
        }
      }
    );
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push(listReturnPath);
    }
  };

  const handleTopSave = (postCreateAction: PostCreateAction = 'default') => {
    postCreateActionRef.current = postCreateAction;

    if (formRef.current) {
      formRef.current.requestSubmit();
    }
  };

  const getHeaderLabel = () => {
    if (mode === 'edit') {
      if (loading) {
        return 'Carregando transação...';
      }

      return formatTransactionDescription(
        formData.description || transaction?.description || 'Transação',
        transaction?.installmentNumber,
        transaction?.totalInstallments
      );
    }

    if (isCreditCardPurchaseFlow) {
      return installmentCountValue > 1 ? 'Nova Compra Parcelada no Cartão' : 'Nova Compra no Cartão';
    }

    switch (formData.type) {
      case 'INCOME':
        return 'Nova Receita';
      case 'EXPENSE':
        return 'Nova Despesa';
      case 'TRANSFER':
        return 'Nova Transferência';
      default:
        return 'Nova Transação';
    }
  };

  const saveButtonLabel = saving
    ? 'Salvando...'
    : mode === 'create'
      ? isCreditCardPurchaseFlow
        ? 'Registrar Compra'
        : 'Criar Transação'
      : 'Salvar Alterações';

  const saveAndAddAnotherLabel = saving
    ? 'Salvando...'
    : isCreditCardPurchaseFlow
      ? 'Registrar e Adicionar Outra'
      : 'Salvar e Criar Nova';
  const showSaveAndAddAnotherAction = mode === 'create';

  const scopeMessage = currentScopeBlocked
    ? activePurchaseScope === 'PURCHASE'
      ? 'A compra inteira não pode mais ser alterada porque existe parcela em fatura paga.'
      : activePurchaseScope === 'FUTURE'
        ? 'Ajustes para esta parcela e as futuras só são permitidos quando todas elas ainda são futuras e não pagas.'
        : 'Ajustes individuais só são permitidos para parcelas futuras e não pagas.'
    : activePurchaseScope === 'PURCHASE'
      ? 'As alterações serão aplicadas em todas as parcelas desta compra.'
      : activePurchaseScope === 'FUTURE'
        ? 'As alterações serão aplicadas nesta parcela e em todas as futuras.'
        : 'As alterações serão aplicadas apenas nesta parcela futura.';
  const externalInstallmentsCount = resolvedInvoicePreview.filter((item) => item.shouldSettleExternally).length;
  const previewSummaryLabelLegacy = invoicePreview.length === 0
    ? 'Configure um cartão com fechamento e vencimento para ver a previsão.'
    : installmentCountValue === 1
      ? `1 fatura impactada - limite após a compra: ${
          projectedAvailableLimit === null ? 'não configurado' : formatCurrency(projectedAvailableLimit)
        }`
      : `${installmentCountValue} parcelas em ${invoicePreview.length} faturas - limite após a compra: ${
          projectedAvailableLimit === null ? 'não configurado' : formatCurrency(projectedAvailableLimit)
        }`;
  const previewSummaryLabel = resolvedInvoicePreview.length === 0
    ? previewSummaryLabelLegacy
    : impactedInvoicesCount === 0
      ? `${externalInstallmentsCount} parcela${externalInstallmentsCount === 1 ? '' : 's'} histórica${externalInstallmentsCount === 1 ? '' : 's'} sem impacto no limite atual`
      : impactedInvoicesCount === 1
        ? `1 fatura impactada - limite após a compra: ${
            projectedAvailableLimit === null ? 'não configurado' : formatCurrency(projectedAvailableLimit)
          }`
        : `${impactedInvoicesCount} faturas impactadas - limite após a compra: ${
            projectedAvailableLimit === null ? 'não configurado' : formatCurrency(projectedAvailableLimit)
          }`;

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex items-center gap-2"
            disabled={saving}
          >
            <ArrowLeft size={16} />
            Voltar
          </Button>
          <h1 className="text-2xl font-semibold text-white">{getHeaderLabel()}</h1>
          <div className="flex flex-wrap items-center gap-2 xl:ml-4">
            <button
              type="button"
              onClick={() => handleFormModeChange('simple')}
              className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                isSimpleMode
                  ? 'border-accent bg-accent text-white'
                  : 'border-gray-700 bg-transparent text-gray-300 hover:border-accent hover:text-accent'
              }`}
              disabled={saving}
              aria-pressed={isSimpleMode}
            >
              Simples
            </button>
            <button
              type="button"
              onClick={() => handleFormModeChange('detailed')}
              className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                !isSimpleMode
                  ? 'border-accent bg-accent text-white'
                  : 'border-gray-700 bg-transparent text-gray-300 hover:border-accent hover:text-accent'
              }`}
              disabled={saving}
              aria-pressed={!isSimpleMode}
            >
              Detalhado
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          {showActions && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={actionDisabled}
                className="flex items-center gap-2"
              >
                <X size={16} />
                Cancelar
              </Button>
              {showSaveAndAddAnotherAction && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleTopSave('create-another')}
                  disabled={actionDisabled}
                  className="flex items-center gap-2"
                >
                  <Save size={16} />
                  {saveAndAddAnotherLabel}
                </Button>
              )}
              {canOpenSettlementModal && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleOpenSettlementModal}
                  disabled={actionDisabled}
                  className="flex items-center gap-2"
                >
                  <Save size={16} />
                  {settlementActionLabel}
                </Button>
              )}
              <Button
                type="button"
                variant="accent"
                onClick={() => handleTopSave('default')}
                disabled={actionDisabled}
                className="flex items-center gap-2"
              >
                <Save size={16} />
                {saveButtonLabel}
              </Button>

              {mode === 'edit' && (
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  className="flex items-center gap-2"
                  disabled={actionDisabled}
                >
                  <Trash2 size={16} />
                  Excluir
                </Button>
              )}
            </>
          )}
        </div>
      </div>

          <Card>
        <form ref={formRef} id="transaction-form" onSubmit={handleSubmit} className="space-y-6">
          {mode === 'create' && isCreditCardPurchaseFlow ? (
            <div className="flex flex-wrap items-start gap-4">
              <div>
                <CurrencyInput
                  id="amount"
                  label={installmentCountValue > 1 ? 'Valor da Parcela *' : 'Valor *'}
                  value={formData.amount}
                  onChange={handleAmountChange}
                  required={requiresFromAccount}
                  disabled={saving || isReadOnly}
                  className="mb-0"
                  inputClassName="py-4 text-2xl"
                />
              </div>

              <div className="w-48">
                <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="date">
                  Data da Compra *
                </label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  value={formData.date}
                  onChange={handleChange}
                  disabled={transactionDateDisabled}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                />
              </div>

              <div className="w-36">
                <Input
                  id="installmentCount"
                  name="installmentCount"
                  type="number"
                  min="1"
                  label="Parcelas"
                  value={formData.installmentCount}
                  onChange={handleChange}
                  disabled={saving || isReadOnly}
                  className="mb-0"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              <div>
                <CurrencyInput
                  id="amount"
                  label={isCreditCardPurchaseFlow && installmentCountValue > 1 ? 'Valor da Parcela *' : 'Valor *'}
                  value={formData.amount}
                  onChange={handleAmountChange}
                  required={requiresToAccount}
                  disabled={saving || isReadOnly}
                  className="mb-0"
                  inputClassName="py-4 text-2xl"
                />
              </div>

              {mode === 'edit' &&
                transaction?.totalInstallments !== undefined &&
                transaction?.totalInstallments !== null &&
                transaction.totalInstallments > 1 && (
                  <div className="flex flex-col pt-8">
                    <span className="rounded-md border border-blue-500 bg-blue-900/70 px-4 py-2 font-semibold uppercase tracking-wide text-blue-100">
                      {`Parcela ${transaction.installmentNumber ?? 1} de ${transaction.totalInstallments}`}
                    </span>
                  </div>
                )}

              {mode === 'create' ? (
                <>
                  <div className="flex items-center pt-8">
                    <span className="mr-2 text-sm text-gray-300">Recorrente</span>
                    <label htmlFor="isRecurring" className="relative inline-flex cursor-pointer items-center">
                      <input
                        id="isRecurring"
                        type="checkbox"
                        checked={isRecurring}
                        onChange={(event) => handleRecurringChange(event.target.checked)}
                        className="peer sr-only"
                      />
                      <div className="h-5 w-10 rounded-full bg-gray-700 transition-colors peer-checked:bg-success" />
                      <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-5" />
                    </label>
                  </div>
                  {isRecurring && (
                    <div className="w-28">
                      <Input
                        id="repeatTimes"
                        name="repeatTimes"
                        type="number"
                        label="Repetir (meses)"
                        value={formData.repeatTimes}
                        onChange={handleChange}
                        placeholder="0"
                        disabled={saving || isReadOnly}
                      />
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center gap-3">
              <label className="block text-sm font-medium text-gray-300" htmlFor="description">
                Descrição *
              </label>
              <span className="text-xs text-gray-400">
                Digite pelo menos 3 caracteres para ver sugestões baseadas no seu histórico
              </span>
            </div>
            <AutocompleteInput
              id="description"
              value={formData.description}
              onChange={handleDescriptionChange}
              onSuggestionSelect={handleSuggestionSelect}
              fetchSuggestions={fetchAutocompleteSuggestions}
              required
              placeholder="Ex: Compra no supermercado, Recebimento de cliente..."
              disabled={saving || isReadOnly}
              minLength={3}
              maxSuggestions={10}
              className="mb-0"
            />
          </div>

          {mode === 'create' && isCreditCardPurchaseFlow && availableFromAccounts.length === 0 && (
            <div className="rounded-lg border border-yellow-700/60 bg-yellow-900/20 p-3 text-sm text-yellow-200">
              Nenhum cartão ativo disponível. Cadastre um cartão em Cartões e Faturas antes de registrar a compra.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {(formData.type === 'EXPENSE' || formData.type === 'TRANSFER') && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="fromAccountId">
                  {isCreditCardPurchaseFlow ? 'Cartão *' : 'Conta de Origem *'}
                </label>
                <select
                  id="fromAccountId"
                  name="fromAccountId"
                  value={formData.fromAccountId}
                  onChange={handleChange}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  required={requiresFromAccount}
                  disabled={accountFieldsDisabled}
                >
                  <option value="">
                    {isCreditCardPurchaseFlow ? 'Selecione um cartão' : 'Selecione uma conta'}
                  </option>
                  {availableFromAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatAccountDisplayName(account)}
                      {account.isDefault ? ' ⭐' : ''}
                    </option>
                  ))}
                </select>
                {!requiresFromAccount && !isCreditCardPurchaseFlow && (
                  <p className="mt-1 text-xs text-gray-400">
                    Opcional enquanto estiver pendente. A conta pode ser definida na liquidação.
                  </p>
                )}
              </div>
            )}

            {(formData.type === 'INCOME' || formData.type === 'TRANSFER') && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="toAccountId">
                  {`Conta de Destino${requiresToAccount ? ' *' : ''}`}
                </label>
                <select
                  id="toAccountId"
                  name="toAccountId"
                  value={formData.toAccountId}
                  onChange={handleChange}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  required={requiresToAccount}
                  disabled={accountFieldsDisabled}
                >
                  <option value="">Selecione uma conta</option>
                  {availableToAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatAccountDisplayName(account)}
                      {account.isDefault ? ' ⭐' : ''}
                    </option>
                  ))}
                </select>
                {!requiresToAccount && (
                  <p className="mt-1 text-xs text-gray-400">
                    Opcional enquanto estiver pendente. A conta pode ser definida na liquidação.
                  </p>
                )}
              </div>
            )}

            {formData.type !== 'TRANSFER' && (
              <div>
                <CategorySelect
                  label="Categoria"
                  categories={availableCategories}
                  value={formData.categoryId}
                  onChange={(categoryId) =>
                    setFormData((prev) => ({ ...prev, categoryId }))
                  }
                  placeholder="Sem categoria"
                  emptyLabel="Sem categoria"
                  disabled={saving || isReadOnly}
                />
              </div>
            )}
          </div>

          {isGroupedCreditCardPurchase && (
            <div className="rounded-xl border border-blue-700/50 bg-blue-950/20 p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-white">Escopo da alteração</div>
                  <div className="mt-1 text-sm text-gray-300">{scopeMessage}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handlePurchaseScopeChange('PURCHASE')}
                    disabled={saving || !canEditPurchaseScope}
                    className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      formData.purchaseScope === 'PURCHASE'
                        ? 'border-accent bg-accent text-white'
                        : 'border-gray-700 bg-transparent text-gray-300 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50'
                    }`}
                  >
                    Compra inteira
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePurchaseScopeChange('FUTURE')}
                    disabled={saving || !canEditFutureScope}
                    className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      formData.purchaseScope === 'FUTURE'
                        ? 'border-accent bg-accent text-white'
                        : 'border-gray-700 bg-transparent text-gray-300 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50'
                    }`}
                  >
                    Esta e futuras
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePurchaseScopeChange('SINGLE')}
                    disabled={saving || !canEditSingleScope}
                    className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${
                      formData.purchaseScope === 'SINGLE'
                        ? 'border-accent bg-accent text-white'
                        : 'border-gray-700 bg-transparent text-gray-300 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50'
                    }`}
                  >
                    Parcela atual
                  </button>
                </div>
              </div>

              {currentScopeBlocked && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-yellow-700/60 bg-yellow-900/20 p-3 text-sm text-yellow-200">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>{scopeMessage}</span>
                </div>
              )}

              <div className="overflow-hidden rounded-lg border border-gray-700">
                <table className="w-full">
                  <thead className="bg-[#0f1419] text-left text-xs uppercase text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Parcela</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Fatura</th>
                      <th className="px-3 py-2">Vencimento</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseGroupTransactions.map((item) => {
                      const invoiceStatus = item.creditCardInvoice
                        ? getInvoiceDisplayStatus(item.creditCardInvoice.status, item.creditCardInvoice.dueDate)
                        : 'OPEN';

                      return (
                        <tr key={item.id} className={`border-t border-gray-700 text-sm text-gray-300 ${item.id === transaction?.id ? 'bg-blue-900/20' : ''}`}>
                          <td className="px-3 py-2">
                            {item.installmentNumber ?? 1}
                            {item.totalInstallments ? ` / ${item.totalInstallments}` : ''}
                          </td>
                          <td className="px-3 py-2">{formatCurrency(item.amount)}</td>
                          <td className="px-3 py-2">
                            {item.creditCardInvoice
                              ? getInvoiceReferenceLabel(item.creditCardInvoice.referenceYear, item.creditCardInvoice.referenceMonth)
                              : '-'}
                          </td>
                          <td className="px-3 py-2">{item.dueDate ? formatCalendarDate(item.dueDate) : '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-1 text-xs font-medium ${getInvoiceDisplayStatusClasses(invoiceStatus)}`}>
                              {getInvoiceDisplayStatusLabel(invoiceStatus)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!isCreditCardPurchaseFlow && (false ? (isSimpleMode ? (
            <div className={`grid grid-cols-1 gap-6 ${isCreditCardPurchaseFlow ? 'md:grid-cols-1' : 'md:grid-cols-3'}`}>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300" htmlFor="date">
                  {isCreditCardContext ? 'Data da Compra' : 'Data da Competência'}
                </label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  value={formData.date}
                  onChange={handleChange}
                  disabled={transactionDateDisabled}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                />
              </div>
              {!isCreditCardPurchaseFlow && (
                <>
                  <div>
                    <div className="mb-2 flex items-center gap-3">
                      <label className="block text-sm font-medium text-gray-300" htmlFor="dueDate">
                        {isCreditCardContext ? 'Vencimento da Fatura' : 'Data de Vencimento'}
                      </label>
                    </div>
                    <input
                      id="dueDate"
                      name="dueDate"
                      type="date"
                      value={formData.dueDate}
                      onChange={handleChange}
                      disabled={dueDateDisabled}
                      className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                  <div className="flex flex-col justify-center gap-2">
                    <span className="text-sm font-medium text-gray-300">Transação concluída</span>
                    <label className="relative inline-flex h-6 w-12 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={isCompleted}
                        onChange={(event) => handleSimpleStatusChange(event.target.checked)}
                        className="peer sr-only"
                        disabled={statusDisabled}
                      />
                      <div className="h-full w-full rounded-full bg-gray-700 transition-colors peer-checked:bg-success" />
                      <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
                    </label>
                    <span className="text-xs text-gray-400">{completionHint}</span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className={`grid grid-cols-1 gap-6 ${isCreditCardPurchaseFlow ? 'md:grid-cols-1' : 'md:grid-cols-4'}`}>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="date">
                  {isCreditCardContext ? 'Data da Compra *' : 'Data da Competência *'}
                </label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  value={formData.date}
                  onChange={handleChange}
                  disabled={transactionDateDisabled}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                />
              </div>
              {!isCreditCardPurchaseFlow && (
                <>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="status">
                      Status *
                    </label>
                    <select
                      id="status"
                      name="status"
                      value={formData.status}
                      onChange={handleChange}
                      className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                      required
                      disabled={statusDisabled}
                    >
                      <option value="PENDING">Pendente</option>
                      <option value="COMPLETED">Concluída</option>
                      <option value="CANCELED">Cancelada</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="dueDate">
                      {isCreditCardContext ? 'Vencimento da Fatura' : 'Data de Vencimento'}
                    </label>
                    <input
                      id="dueDate"
                      name="dueDate"
                      type="date"
                      value={formData.dueDate}
                      onChange={handleChange}
                      disabled={dueDateDisabled}
                      className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="liquidationDate">
                      Data de Liquidação
                    </label>
                    <input
                      id="liquidationDate"
                      name="liquidationDate"
                      type="date"
                      value={formData.liquidationDate}
                      onChange={handleChange}
                      disabled={liquidationDateDisabled}
                      className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                </>
              )}
            </div>
          )) : (
            isSimpleMode ? (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300" htmlFor="date">
                    {primaryDateLabel}
                  </label>
                  <input
                    id="date"
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleChange}
                    disabled={transactionDateDisabled}
                    className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-3">
                    <label className="block text-sm font-medium text-gray-300" htmlFor="dueDate">
                      {isCreditCardContext ? 'Vencimento da Fatura' : 'Data de Vencimento'}
                    </label>
                  </div>
                  <input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={handleChange}
                    disabled={dueDateDisabled}
                    className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  />
                </div>

                {showInlineSettlementControls ? (
                  <div className="flex flex-col justify-center gap-2">
                    <span className="text-sm font-medium text-gray-300">{settlementToggleLabel}</span>
                    <label className="relative inline-flex h-6 w-12 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={isCompleted}
                        onChange={(event) => handleSimpleStatusChange(event.target.checked)}
                        className="peer sr-only"
                        disabled={statusDisabled}
                      />
                      <div className="h-full w-full rounded-full bg-gray-700 transition-colors peer-checked:bg-success" />
                      <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
                    </label>
                    <span className="text-xs text-gray-400">{completionHint}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-sky-800/60 bg-sky-950/20 p-4">
                    <div className="text-sm font-medium text-white">Transação pendente</div>
                    <p className="mt-1 text-xs text-sky-100/80">
                      Use o botão "{settlementActionLabel}" para informar conta e {settlementDateLabel.toLowerCase()}.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="date">
                    {`${primaryDateLabel} *`}
                  </label>
                  <input
                    id="date"
                    name="date"
                    type="date"
                    value={formData.date}
                    onChange={handleChange}
                    disabled={transactionDateDisabled}
                    className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="dueDate">
                    {isCreditCardContext ? 'Vencimento da Fatura' : 'Data de Vencimento'}
                  </label>
                  <input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    value={formData.dueDate}
                    onChange={handleChange}
                    disabled={dueDateDisabled}
                    className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  />
                </div>

                {showInlineSettlementControls ? (
                  <div className="flex flex-col justify-center gap-2">
                    <span className="text-sm font-medium text-gray-300">{settlementToggleLabel}</span>
                    <label className="relative inline-flex h-6 w-12 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={isCompleted}
                        onChange={(event) => handleSimpleStatusChange(event.target.checked)}
                        className="peer sr-only"
                        disabled={statusDisabled}
                      />
                      <div className="h-full w-full rounded-full bg-gray-700 transition-colors peer-checked:bg-success" />
                      <div className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-6" />
                    </label>
                    <span className="text-xs text-gray-400">{completionHint}</span>
                  </div>
                ) : (
                  <div className="rounded-lg border border-sky-800/60 bg-sky-950/20 p-4 md:col-span-2">
                    <div className="text-sm font-medium text-white">Transação pendente</div>
                    <p className="mt-1 text-sm text-sky-100/80">
                      Esta transação ainda não impactou o saldo. Use o botão "{settlementActionLabel}" para informar conta e {settlementDateLabel.toLowerCase()}.
                    </p>
                  </div>
                )}

                {showInlineSettlementControls && isCompleted && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="liquidationDate">
                      {settlementDateLabel}
                    </label>
                    <input
                      id="liquidationDate"
                      name="liquidationDate"
                      type="date"
                      value={formData.liquidationDate}
                      onChange={handleChange}
                      disabled={liquidationDateDisabled}
                      className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                )}
              </div>
            )
          ))}

          {isCreditCardContext && (
            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-3 text-sm text-gray-300">
              {isCreditCardPurchaseFlow
                ? 'A compra no cartão entra com status e data de liquidação preenchidos automaticamente. Expanda o painel final para conferir limite e previsão das faturas.'
                : 'A data da compra controla a competência da despesa. O vencimento e a liquidação da fatura são calculados automaticamente pelo cartão.'}
            </div>
          )}

          {!isSimpleMode && (
            <>
              <div>
                <Input
                  id="tags"
                  name="tags"
                  label="Tags (separadas por vírgula)"
                  value={formData.tags}
                  onChange={handleChange}
                  placeholder="Ex: alimentação, mercado, urgente"
                  disabled={saving || isReadOnly}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="notes">
                  Observações
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={4}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  placeholder="Informações adicionais sobre a transação..."
                  disabled={saving || isReadOnly}
                />
              </div>
            </>
          )}

          {showCreditCardPurchasePreview && (
            <div className="rounded-xl border border-purple-700/50 bg-purple-950/20">
              <button
                type="button"
                onClick={() => setIsInvoicePreviewExpanded((prev) => !prev)}
                className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <CreditCard size={18} className="mt-0.5 text-purple-300" />
                  <div>
                    <div className="font-medium text-white">Detalhes do cartão e previsão de faturas</div>
                    <div className="mt-1 text-sm text-gray-300">{previewSummaryLabel}</div>
                  </div>
                </div>
                <span className="mt-0.5 text-purple-200">
                  {isInvoicePreviewExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </span>
              </button>

              {isInvoicePreviewExpanded && (
                <div className="space-y-4 border-t border-purple-700/40 px-5 pb-5 pt-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div className="rounded-lg border border-gray-700 bg-[#12161d] p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Limite atual</div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {availableLimit === null ? 'Não configurado' : formatCurrency(availableLimit)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#12161d] p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Compra total</div>
                      <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(totalCommittedAmount)}</div>
                      {installmentCountValue > 1 && (
                        <div className="mt-1 text-xs text-gray-400">
                          {formatCurrency(amountValue)} por parcela
                        </div>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#12161d] p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Impacto atual no limite</div>
                      <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(currentLimitImpactAmount)}</div>
                      <div className="mt-1 text-xs text-gray-400">
                        {currentLimitImpactInstallmentCount} parcela{currentLimitImpactInstallmentCount === 1 ? '' : 's'} impactando o saldo atual
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#12161d] p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Limite após compra</div>
                      <div className={`mt-1 text-lg font-semibold ${projectedAvailableLimit !== null && projectedAvailableLimit < 0 ? 'text-orange-300' : 'text-white'}`}>
                        {projectedAvailableLimit === null ? 'Não configurado' : formatCurrency(projectedAvailableLimit)}
                      </div>
                      <div className="mt-1 text-xs text-gray-400">
                        Usado após compra: {formatCurrency(projectedUsedLimit)}
                      </div>
                    </div>
                  </div>

                  {projectedAvailableLimit !== null && projectedAvailableLimit < 0 && (
                    <div className="rounded-lg border border-orange-700/60 bg-orange-900/20 p-3 text-sm text-orange-200">
                      O limite disponível ficará negativo após esta compra. O lançamento ainda pode ser salvo.
                    </div>
                  )}

                  <div className="overflow-hidden rounded-lg border border-gray-700">
                    <table className="w-full">
                      <thead className="bg-[#0f1419] text-left text-xs uppercase text-gray-400">
                        <tr>
                          <th className="px-3 py-2">Parcela</th>
                          <th className="px-3 py-2">Fatura</th>
                          <th className="px-3 py-2">Fechamento</th>
                          <th className="px-3 py-2">Vencimento</th>
                          <th className="px-3 py-2">Destino</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resolvedInvoicePreview.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-sm text-gray-400">
                              Selecione um cartão com fechamento e vencimento configurados para visualizar a previsão.
                            </td>
                          </tr>
                        ) : (
                          resolvedInvoicePreview.map((item) => (
                            <tr key={`${item.referenceYear}-${item.referenceMonth}-${item.installmentNumber}`} className="border-t border-gray-700 text-sm text-gray-300">
                              <td className="px-3 py-2">{item.installmentNumber}</td>
                              <td className="px-3 py-2">{getInvoiceReferenceLabel(item.referenceYear, item.referenceMonth)}</td>
                              <td className="px-3 py-2">{formatInvoiceDate(new Date(item.closingDate))}</td>
                              <td className="px-3 py-2">{formatInvoiceDate(new Date(item.dueDate))}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                                  item.shouldSettleExternally
                                    ? 'border border-amber-700 bg-amber-900/20 text-amber-200'
                                    : 'border border-blue-700 bg-blue-900/20 text-blue-200'
                                }`}>
                                  {item.destinationLabel}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {showActions && (
            <div className="flex flex-wrap justify-end gap-4 border-t border-gray-700 pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={actionDisabled}
                className="flex items-center gap-2"
              >
                <X size={16} />
                Cancelar
              </Button>
              {showSaveAndAddAnotherAction && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleTopSave('create-another')}
                  disabled={actionDisabled}
                  className="flex items-center gap-2"
                >
                  <Save size={16} />
                  {saveAndAddAnotherLabel}
                </Button>
              )}
              <Button
                type="submit"
                variant="accent"
                onClick={() => {
                  postCreateActionRef.current = 'default';
                }}
                disabled={actionDisabled}
                className="flex items-center gap-2"
              >
                <Save size={16} />
                {saveButtonLabel}
              </Button>
            </div>
          )}
        </form>
      </Card>

      {(isExpense || isIncome) && (
        <TransactionSettlementModal
          isOpen={isSettlementModalOpen}
          kind={isExpense ? 'EXPENSE' : 'INCOME'}
          accounts={settlementAccounts}
          accountId={settlementAccountId}
          settlementDate={settlementDate}
          notes={settlementNotes}
          loading={saving}
          title={isExpense ? 'Registrar pagamento' : 'Registrar recebimento'}
          confirmLabel={settlementActionLabel}
          onClose={handleCloseSettlementModal}
          onConfirm={handleConfirmSettlement}
          onAccountIdChange={setSettlementAccountId}
          onSettlementDateChange={setSettlementDate}
          onNotesChange={setSettlementNotes}
        />
      )}

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
  );
}
