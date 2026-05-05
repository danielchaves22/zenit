import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { AutocompleteInput } from '@/components/ui/AutoCompleteInput';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
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

type TransactionKind = 'INCOME' | 'EXPENSE' | 'TRANSFER';
type TransactionStatus = 'PENDING' | 'COMPLETED' | 'CANCELED';
type PurchaseScope = 'SINGLE' | 'PURCHASE';
type CreateFlow = 'standard' | 'credit-card-purchase';

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
  isDefault: boolean;
}

interface InvoiceSummary {
  id: number;
  referenceYear: number;
  referenceMonth: number;
  dueDate?: string | null;
  status: string;
  paymentTransactionId?: number | null;
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
  category?: { id: number; name: string; color: string };
  tags: { id: number; name: string }[];
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  purchaseGroupId?: string | null;
  creditCardInvoice?: InvoiceSummary | null;
  purchaseGroupTransactions?: PurchaseGroupTransaction[];
}

interface AutocompleteSuggestion {
  description: string;
  frequency: number;
}

interface TransactionFormProps {
  mode: 'create' | 'edit';
  transactionId?: string;
  initialType?: TransactionKind;
  isTypeLocked?: boolean;
  createFlow?: CreateFlow;
  defaultCreditCardId?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
  onTransactionLoaded?: (transaction: Transaction) => void;
}

function getTodayValue() {
  return new Date().toISOString().split('T')[0];
}

function formatCurrency(value: string | number) {
  const amount = typeof value === 'number' ? value : Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number.isNaN(amount) ? 0 : amount);
}

function toInputDate(value?: string | null) {
  if (!value) {
    return '';
  }

  return new Date(value).toISOString().split('T')[0];
}

function isFutureInstallment(transaction?: PurchaseGroupTransaction | null) {
  if (!transaction) {
    return false;
  }

  const invoicePaid = Boolean(transaction.creditCardInvoice?.paymentTransactionId);
  if (invoicePaid) {
    return false;
  }

  const referenceDate = transaction.scheduledDate || transaction.dueDate;
  if (!referenceDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scheduledDate = new Date(referenceDate);
  scheduledDate.setHours(0, 0, 0, 0);

  return scheduledDate > today;
}

export default function TransactionForm({
  mode,
  transactionId,
  initialType = 'EXPENSE',
  isTypeLocked = false,
  createFlow = 'standard',
  defaultCreditCardId = null,
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
  const [formMode, setFormMode] = useState<'simple' | 'detailed'>('detailed');
  const [isInvoicePreviewExpanded, setIsInvoicePreviewExpanded] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [formData, setFormData] = useState({
    description: '',
    amount: '0.00',
    date: getTodayValue(),
    dueDate: getTodayValue(),
    effectiveDate: getTodayValue(),
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
  const isCreditCardPurchaseFlow = mode === 'create' && createFlow === 'credit-card-purchase';

  const selectedFromAccount = useMemo(
    () => accounts.find((account) => account.id.toString() === formData.fromAccountId) || null,
    [accounts, formData.fromAccountId]
  );
  const selectedToAccount = useMemo(
    () => accounts.find((account) => account.id.toString() === formData.toAccountId) || null,
    [accounts, formData.toAccountId]
  );

  const availableFromAccounts = useMemo(() => {
    if (mode === 'edit') {
      return accounts;
    }

    if (isCreditCardPurchaseFlow) {
      return accounts.filter((account) => account.type === 'CREDIT_CARD' && account.isActive);
    }

    return accounts.filter((account) => account.type !== 'CREDIT_CARD' && account.isActive);
  }, [accounts, isCreditCardPurchaseFlow, mode]);

  const availableToAccounts = useMemo(() => {
    if (mode === 'edit') {
      return accounts;
    }

    return accounts.filter((account) => account.type !== 'CREDIT_CARD' && account.isActive);
  }, [accounts, mode]);

  const isCreditCardExpense =
    formData.type === 'EXPENSE' &&
    selectedFromAccount?.type === 'CREDIT_CARD' &&
    isCreditCardPurchaseFlow;

  const installmentCountValue = Math.max(Number(formData.installmentCount || 1), 1);
  const amountValue = Number(formData.amount || 0) || 0;
  const totalCommittedAmount = isCreditCardExpense
    ? amountValue * installmentCountValue
    : amountValue;

  const availableLimit = isCreditCardExpense ? getAvailableCreditLimit(selectedFromAccount) : null;
  const projectedAvailableLimit = availableLimit === null ? null : availableLimit - totalCommittedAmount;
  const projectedUsedLimit = isCreditCardExpense
    ? getUsedCreditLimit(selectedFromAccount) + totalCommittedAmount
    : 0;
  const invoicePreview = useMemo(
    () => buildCreditCardInvoicePreview(selectedFromAccount, formData.date, installmentCountValue),
    [formData.date, installmentCountValue, selectedFromAccount]
  );

  const purchaseGroupTransactions = transaction?.purchaseGroupTransactions || [];
  const isGroupedCreditCardPurchase = Boolean(transaction?.purchaseGroupId);
  const isCreditCardContext = isCreditCardPurchaseFlow || isGroupedCreditCardPurchase;
  const currentGroupTransaction = purchaseGroupTransactions.find((item) => item.id === transaction?.id) || null;
  const hasPaidInvoiceInGroup = purchaseGroupTransactions.some((item) => Boolean(item.creditCardInvoice?.paymentTransactionId));
  const canEditPurchaseScope = isGroupedCreditCardPurchase && !hasPaidInvoiceInGroup;
  const canEditSingleScope = isGroupedCreditCardPurchase && isFutureInstallment(currentGroupTransaction);
  const activePurchaseScope = isGroupedCreditCardPurchase ? formData.purchaseScope : 'SINGLE';
  const currentScopeBlocked =
    isGroupedCreditCardPurchase &&
    ((activePurchaseScope === 'PURCHASE' && !canEditPurchaseScope) ||
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
  const showCreditCardPurchasePreview = mode === 'create' && isCreditCardPurchaseFlow;
  const completionHint = isCompleted
    ? formData.effectiveDate
      ? `(efetivada em ${new Date(formData.effectiveDate).toLocaleDateString('pt-BR')})`
      : '(efetivada hoje)'
    : '(pendente)';

  const accountFieldsDisabled = saving || isReadOnly || isGroupedCreditCardPurchase;
  const statusDisabled = saving || isReadOnly || isCreditCardPurchaseFlow || isGroupedCreditCardPurchase;
  const dueDateDisabled = saving || isReadOnly || isCreditCardPurchaseFlow || isGroupedCreditCardPurchase;
  const effectiveDateDisabled = saving || isPending || isReadOnly || isCreditCardPurchaseFlow || isGroupedCreditCardPurchase;
  const transactionDateDisabled = saving || isReadOnly || isGroupedCreditCardPurchase;

  useEffect(() => {
    void fetchAccounts();
    void fetchCategories();

    if (mode === 'edit' && transactionId) {
      void fetchTransaction();
    }
  }, [mode, transactionId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedMode = localStorage.getItem('transactionFormMode');
    if (storedMode === 'simple' || storedMode === 'detailed') {
      setFormMode(storedMode);
    }
  }, []);

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
  }, [accounts, categories, defaultsLoaded, mode, formData.type]);

  useEffect(() => {
    if (!isGroupedCreditCardPurchase) {
      return;
    }

    setFormData((prev) => {
      const nextScope: PurchaseScope = canEditPurchaseScope
        ? 'PURCHASE'
        : canEditSingleScope
          ? 'SINGLE'
          : prev.purchaseScope;

      if (prev.purchaseScope === nextScope) {
        return prev;
      }

      return { ...prev, purchaseScope: nextScope };
    });
  }, [canEditPurchaseScope, canEditSingleScope, isGroupedCreditCardPurchase]);

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
      effectiveDate: prev.date || getTodayValue()
    }));
  }, [isCreditCardPurchaseFlow]);

  useEffect(() => {
    if (!isCreditCardPurchaseFlow) {
      return;
    }

    setFormData((prev) => {
      if (prev.effectiveDate === prev.date) {
        return prev;
      }

      return {
        ...prev,
        effectiveDate: prev.date
      };
    });
  }, [formData.date, isCreditCardPurchaseFlow]);

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

  async function fetchTransaction() {
    if (!transactionId) {
      return;
    }

    try {
      const response = await api.get(`/financial/transactions/${transactionId}`);
      const txn = response.data as Transaction;

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
        effectiveDate: toInputDate(txn.effectiveDate) || getTodayValue(),
        type: txn.type,
        status: txn.status,
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
        const defaultAccount = accounts.find(
          (account) => account.isDefault && account.isActive && account.type !== 'CREDIT_CARD'
        );
        const fallbackAccount = accounts.find(
          (account) => account.isActive && account.type !== 'CREDIT_CARD'
        );
        const nextAccount = defaultAccount || fallbackAccount;

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
      const defaultCategory = categories.find(
        (category) => category.isDefault && category.type === formData.type
      );
      const fallbackCategory = categories.find((category) => category.type === formData.type);
      const nextCategory = defaultCategory || fallbackCategory;

      if (nextCategory) {
        updates.categoryId = nextCategory.id.toString();
      }
    }

    if (!formData.date) {
      updates.date = getTodayValue();
    }

    if (!formData.dueDate) {
      updates.dueDate = getTodayValue();
    }

    if (!formData.effectiveDate) {
      updates.effectiveDate = getTodayValue();
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

      const defaultCategory = categories.find(
        (category) => category.isDefault && category.type === nextType
      );
      const fallbackCategory = categories.find((category) => category.type === nextType);
      const nextCategory = defaultCategory || fallbackCategory;

      setFormData((prev) => ({
        ...prev,
        categoryId: nextCategory ? nextCategory.id.toString() : ''
      }));

      return;
    }

    setFormData((prev) => {
      const updated = { ...prev, [name]: value };

      if (name === 'status') {
        if (value === 'PENDING') {
          updated.effectiveDate = '';
        } else if (!prev.effectiveDate) {
          updated.effectiveDate = getTodayValue();
        }
      }

      if (name === 'date' && isCreditCardPurchaseFlow) {
        updated.effectiveDate = value;
      }

      return updated;
    });
  };

  const handleDescriptionChange = (value: string) => {
    setFormData((prev) => ({ ...prev, description: value }));
  };

  const handleSuggestionSelect = (description: string) => {
    console.log('Sugestao selecionada:', description);
  };

  const handleAmountChange = (value: string) => {
    setFormData((prev) => ({ ...prev, amount: value }));
  };

  const handleFormModeChange = (nextMode: 'simple' | 'detailed') => {
    if (saving) {
      return;
    }

    setFormMode(nextMode);

    if (typeof window !== 'undefined') {
      localStorage.setItem('transactionFormMode', nextMode);
    }
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
        effectiveDate: checked ? (prev.effectiveDate || today) : ''
      };
    });
  };

  const handlePurchaseScopeChange = (scope: PurchaseScope) => {
    setFormData((prev) => ({ ...prev, purchaseScope: scope }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

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

    setSaving(true);

    try {
      const payload: Record<string, unknown> = {
        ...formData,
        amount: parseFloat(formData.amount),
        date: new Date(formData.date).toISOString(),
        dueDate: formData.dueDate ? new Date(formData.dueDate).toISOString() : null,
        effectiveDate: formData.effectiveDate ? new Date(formData.effectiveDate).toISOString() : null,
        fromAccountId: formData.fromAccountId ? parseInt(formData.fromAccountId, 10) : null,
        toAccountId: formData.toAccountId ? parseInt(formData.toAccountId, 10) : null,
        categoryId: formData.categoryId ? parseInt(formData.categoryId, 10) : null,
        tags: formData.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        repeatTimes: !isCreditCardPurchaseFlow && isRecurring ? Number(formData.repeatTimes || 0) : 0
      };

      if (mode === 'edit' && transaction?.purchaseGroupId) {
        payload.purchaseScope = formData.purchaseScope;
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
      } else {
        await api.put(`/financial/transactions/${transactionId}`, payload);
        addToast('Transação atualizada com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/financial/transactions');
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
    const scopeLabel = isPurchaseDelete ? 'a compra inteira' : 'esta parcela';

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
            router.push('/financial/transactions');
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
      router.push('/financial/transactions');
    }
  };

  const handleTopSave = () => {
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

  const scopeMessage = currentScopeBlocked
    ? activePurchaseScope === 'PURCHASE'
      ? 'A compra inteira não pode mais ser alterada porque existe parcela em fatura paga.'
      : 'Ajustes individuais só são permitidos para parcelas futuras e não pagas.'
    : activePurchaseScope === 'PURCHASE'
      ? 'As alterações serão aplicadas em todas as parcelas desta compra.'
      : 'As alterações serão aplicadas apenas nesta parcela futura.';
  const previewSummaryLabel = invoicePreview.length === 0
    ? 'Configure um cartão com fechamento e vencimento para ver a previsão.'
    : installmentCountValue === 1
      ? `1 fatura impactada - limite após a compra: ${
          projectedAvailableLimit === null ? 'não configurado' : formatCurrency(projectedAvailableLimit)
        }`
      : `${installmentCountValue} parcelas em ${invoicePreview.length} faturas - limite após a compra: ${
          projectedAvailableLimit === null ? 'não configurado' : formatCurrency(projectedAvailableLimit)
        }`;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
          <div className="ml-4 flex items-center gap-2">
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

        <div className="flex items-center gap-3">
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
              <Button
                type="button"
                variant="accent"
                onClick={handleTopSave}
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
          <div className="flex flex-wrap items-start gap-4">
            <div>
              <CurrencyInput
                id="amount"
                label={isCreditCardPurchaseFlow && installmentCountValue > 1 ? 'Valor da Parcela *' : 'Valor *'}
                value={formData.amount}
                onChange={handleAmountChange}
                required
                disabled={saving || isReadOnly}
                className="mb-0"
                inputClassName="py-4 text-2xl"
              />
            </div>

            {mode === 'edit' &&
              transaction?.totalInstallments !== undefined &&
              transaction?.totalInstallments !== null &&
              transaction.totalInstallments > 1 && (
                <div className="flex flex-col">
                  <span className="rounded-md border border-blue-500 bg-blue-900/70 px-4 py-2 font-semibold uppercase tracking-wide text-blue-100">
                    {`Parcela ${transaction.installmentNumber ?? 1} de ${transaction.totalInstallments}`}
                  </span>
                </div>
              )}

            {mode === 'create' && isCreditCardPurchaseFlow ? (
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
                />
              </div>
            ) : mode === 'create' ? (
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
                  required
                  disabled={accountFieldsDisabled}
                >
                  <option value="">
                    {isCreditCardPurchaseFlow ? 'Selecione um cartão' : 'Selecione uma conta'}
                  </option>
                  {availableFromAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.type === 'CREDIT_CARD' ? ' (cartão)' : ''}
                      {account.isDefault ? ' ⭐' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(formData.type === 'INCOME' || formData.type === 'TRANSFER') && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="toAccountId">
                  Conta de Destino *
                </label>
                <select
                  id="toAccountId"
                  name="toAccountId"
                  value={formData.toAccountId}
                  onChange={handleChange}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  required
                  disabled={accountFieldsDisabled}
                >
                  <option value="">Selecione uma conta</option>
                  {availableToAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.isDefault ? ' ⭐' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {formData.type !== 'TRANSFER' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="categoryId">
                  Categoria
                </label>
                <select
                  id="categoryId"
                  name="categoryId"
                  value={formData.categoryId}
                  onChange={handleChange}
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  disabled={saving || isReadOnly}
                >
                  <option value="">Sem categoria</option>
                  {categories
                    .filter((category) => category.type === formData.type)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {category.isDefault ? ' ⭐' : ''}
                      </option>
                    ))}
                </select>
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
                <div className="flex gap-2">
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
                          <td className="px-3 py-2">{item.dueDate ? new Date(item.dueDate).toLocaleDateString('pt-BR') : '-'}</td>
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

          {isSimpleMode ? (
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
                    <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor="effectiveDate">
                      Data de Efetivação
                    </label>
                    <input
                      id="effectiveDate"
                      name="effectiveDate"
                      type="date"
                      value={formData.effectiveDate}
                      onChange={handleChange}
                      disabled={effectiveDateDisabled}
                      className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {isCreditCardContext && (
            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-3 text-sm text-gray-300">
              {isCreditCardPurchaseFlow
                ? 'A compra no cartão entra com status e data de efetivação preenchidos automaticamente. Expanda o painel final para conferir limite e previsão das faturas.'
                : 'A data da compra controla a competência da despesa. O vencimento e a efetivação da fatura são calculados automaticamente pelo cartão.'}
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
                  Observacoes
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
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-gray-700 bg-[#12161d] p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Limite atual</div>
                      <div className="mt-1 text-lg font-semibold text-white">
                        {availableLimit === null ? 'Não configurado' : formatCurrency(availableLimit)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-gray-700 bg-[#12161d] p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-400">Compra total no limite</div>
                      <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(totalCommittedAmount)}</div>
                      {installmentCountValue > 1 && (
                        <div className="mt-1 text-xs text-gray-400">
                          {formatCurrency(amountValue)} por parcela
                        </div>
                      )}
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
                        </tr>
                      </thead>
                      <tbody>
                        {invoicePreview.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-sm text-gray-400">
                              Selecione um cartão com fechamento e vencimento configurados para visualizar a previsão.
                            </td>
                          </tr>
                        ) : (
                          invoicePreview.map((item) => (
                            <tr key={`${item.referenceYear}-${item.referenceMonth}-${item.installmentNumber}`} className="border-t border-gray-700 text-sm text-gray-300">
                              <td className="px-3 py-2">{item.installmentNumber}</td>
                              <td className="px-3 py-2">{getInvoiceReferenceLabel(item.referenceYear, item.referenceMonth)}</td>
                              <td className="px-3 py-2">{formatInvoiceDate(new Date(item.closingDate))}</td>
                              <td className="px-3 py-2">{formatInvoiceDate(new Date(item.dueDate))}</td>
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
            <div className="flex justify-end gap-4 border-t border-gray-700 pt-6">
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
              <Button
                type="submit"
                variant="accent"
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
