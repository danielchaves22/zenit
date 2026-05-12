import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { AlertTriangle, ArrowLeft, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import CategorySelect from '@/components/financial/CategorySelect';
import api from '@/lib/api';

interface FixedTransaction {
  id: number;
  description: string;
  amount: string;
  type: 'INCOME' | 'EXPENSE';
  dayOfMonth: number | null;
  notes?: string | null;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  categoryId?: number | null;
}

interface Account {
  id: number;
  name: string;
  type: string;
  statementClosingDay?: number | null;
}

interface Category {
  id: number;
  name: string;
  type: string;
  color: string;
  icon?: string;
  isDefault?: boolean;
}

interface FormState {
  description: string;
  amount: string;
  type: 'INCOME' | 'EXPENSE';
  dayOfMonth: string;
  notes: string;
  fromAccountId: string;
  toAccountId: string;
  categoryId: string;
}

type AccountAssignmentType = 'NONE' | 'LIQUID' | 'CREDIT_CARD';

interface FixedTransactionFormProps {
  mode: 'create' | 'edit';
  transactionId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const INITIAL_FORM: FormState = {
  description: '',
  amount: '0.00',
  type: 'EXPENSE',
  dayOfMonth: '10',
  notes: '',
  fromAccountId: '',
  toAccountId: '',
  categoryId: ''
};

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num || 0);
}

function formatAccountOptionLabel(account: Account): string {
  const typeLabel: Record<string, string> = {
    CHECKING: 'Conta Corrente',
    SAVINGS: 'Poupança',
    INVESTMENT: 'Investimento',
    CASH: 'Dinheiro',
    CREDIT_CARD: 'Cartão'
  };

  return `${account.name} (${typeLabel[account.type] || account.type})`;
}

function isLiquidityAccount(account: Account): boolean {
  return account.type !== 'CREDIT_CARD';
}

function resolveAccountAssignmentType(account: Account | null): AccountAssignmentType {
  if (!account) {
    return 'NONE';
  }

  return account.type === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'LIQUID';
}

function getAccountAssignmentLabel(value: AccountAssignmentType): string {
  switch (value) {
    case 'LIQUID':
      return 'Conta de disponibilidade';
    case 'CREDIT_CARD':
      return 'Cartão de crédito';
    case 'NONE':
    default:
      return 'Sem conta vinculada';
  }
}

function getFallbackDayOfMonth(account: Account | null): string {
  return String(account?.statementClosingDay || 10);
}

export default function FixedTransactionForm({
  mode,
  transactionId,
  onSuccess,
  onCancel
}: FixedTransactionFormProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [accountAssignmentType, setAccountAssignmentType] =
    useState<AccountAssignmentType>('LIQUID');

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === form.type),
    [categories, form.type]
  );

  const currentAccountId = form.type === 'EXPENSE' ? form.fromAccountId : form.toAccountId;

  const selectedAccount = useMemo(() => {
    return accounts.find((account) => String(account.id) === currentAccountId) ?? null;
  }, [accounts, currentAccountId]);

  const hasUnsupportedCreditCardIncome =
    form.type === 'INCOME' && selectedAccount?.type === 'CREDIT_CARD';

  const accountAssignmentOptions = useMemo(() => {
    const options: Array<{ value: AccountAssignmentType; label: string }> = [
      { value: 'NONE', label: 'Sem conta vinculada' },
      { value: 'LIQUID', label: 'Conta de disponibilidade' }
    ];

    if (form.type === 'EXPENSE') {
      options.push({ value: 'CREDIT_CARD', label: 'Cartão de crédito' });
    } else if (hasUnsupportedCreditCardIncome) {
      options.push({ value: 'CREDIT_CARD', label: 'Cartão de crédito (inválido)' });
    }

    return options;
  }, [form.type, hasUnsupportedCreditCardIncome]);

  const availableAccounts = useMemo(() => {
    if (accountAssignmentType === 'NONE') {
      return [];
    }

    if (accountAssignmentType === 'CREDIT_CARD') {
      if (form.type === 'INCOME') {
        return selectedAccount?.type === 'CREDIT_CARD' ? [selectedAccount] : [];
      }

      return accounts.filter((account) => account.type === 'CREDIT_CARD');
    }

    return accounts.filter(isLiquidityAccount);
  }, [accountAssignmentType, accounts, form.type, selectedAccount]);

  const isCreditCardFixedExpense =
    form.type === 'EXPENSE' && accountAssignmentType === 'CREDIT_CARD';

  useEffect(() => {
    void initialize();
  }, [mode, transactionId]);

  async function initialize() {
    setLoading(true);

    try {
      const [accountsResponse, categoriesResponse, fixedTransactionsResponse] = await Promise.all([
        api.get('/financial/accounts'),
        api.get('/financial/categories'),
        mode === 'edit'
          ? api.get('/financial/fixed-transactions', { params: { includeInactive: true } })
          : Promise.resolve({ data: [] })
      ]);

      const nextAccounts = accountsResponse.data || [];

      setAccounts(nextAccounts);
      setCategories(categoriesResponse.data || []);

      if (mode === 'edit') {
        const item = (fixedTransactionsResponse.data || []).find(
          (fixedTransaction: FixedTransaction) =>
            fixedTransaction.id.toString() === transactionId
        );

        if (!item) {
          addToast('Transação fixa não encontrada', 'error');
          handleCancel();
          return;
        }

        const selectedItemAccountId =
          item.type === 'EXPENSE' ? item.fromAccountId : item.toAccountId;
        const selectedItemAccount =
          nextAccounts.find((account: Account) => account.id === selectedItemAccountId) ?? null;

        setForm({
          description: item.description,
          amount: item.amount,
          type: item.type,
          dayOfMonth: item.dayOfMonth
            ? String(item.dayOfMonth)
            : getFallbackDayOfMonth(selectedItemAccount),
          notes: item.notes || '',
          fromAccountId: item.fromAccountId ? String(item.fromAccountId) : '',
          toAccountId: item.toAccountId ? String(item.toAccountId) : '',
          categoryId: item.categoryId ? String(item.categoryId) : ''
        });
        setAccountAssignmentType(resolveAccountAssignmentType(selectedItemAccount));
        return;
      }

      setForm(INITIAL_FORM);
      setAccountAssignmentType('LIQUID');
    } catch (error: any) {
      addToast(
        error.response?.data?.error || 'Erro ao carregar formulário de transação fixa',
        'error'
      );
      handleCancel();
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    router.push('/financial/fixed-transactions');
  }

  function handleTypeChange(nextType: 'INCOME' | 'EXPENSE') {
    setAccountAssignmentType((prev) =>
      nextType === 'INCOME' && prev === 'CREDIT_CARD' ? 'LIQUID' : prev
    );

    setForm((prev) => ({
      ...prev,
      type: nextType,
      dayOfMonth:
        nextType === 'INCOME' && accountAssignmentType === 'CREDIT_CARD'
          ? getFallbackDayOfMonth(selectedAccount)
          : prev.dayOfMonth,
      fromAccountId: nextType === 'INCOME' ? '' : prev.fromAccountId,
      toAccountId: nextType === 'EXPENSE' ? '' : prev.toAccountId,
      categoryId: ''
    }));
  }

  function handleAccountAssignmentTypeChange(nextType: AccountAssignmentType) {
    setAccountAssignmentType(nextType);
    setForm((prev) => ({
      ...prev,
      dayOfMonth:
        nextType !== 'CREDIT_CARD' && accountAssignmentType === 'CREDIT_CARD'
          ? prev.dayOfMonth || getFallbackDayOfMonth(selectedAccount)
          : prev.dayOfMonth,
      fromAccountId: prev.type === 'EXPENSE' ? '' : prev.fromAccountId,
      toAccountId: prev.type === 'INCOME' ? '' : prev.toAccountId
    }));
  }

  function updateCurrentAccountId(value: string) {
    setForm((prev) =>
      prev.type === 'EXPENSE'
        ? { ...prev, fromAccountId: value }
        : { ...prev, toAccountId: value }
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.description.trim()) {
      addToast('Descrição é obrigatória', 'error');
      return;
    }

    if (!isCreditCardFixedExpense && (!form.dayOfMonth || Number(form.dayOfMonth) < 1 || Number(form.dayOfMonth) > 31)) {
      addToast('Dia informado deve estar entre 1 e 31', 'error');
      return;
    }

    if (isCreditCardFixedExpense && !form.fromAccountId) {
      addToast('Selecione o cartÃ£o para a despesa fixa', 'error');
      return;
    }

    if (hasUnsupportedCreditCardIncome) {
      addToast('Receitas fixas não podem usar conta de cartão de crédito', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        description: form.description,
        amount: parseFloat(form.amount),
        type: form.type,
        notes: form.notes || undefined,
        fromAccountId: form.fromAccountId ? Number(form.fromAccountId) : null,
        toAccountId: form.toAccountId ? Number(form.toAccountId) : null,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        ...(isCreditCardFixedExpense ? {} : { dayOfMonth: Number(form.dayOfMonth) })
      };

      if (mode === 'create') {
        await api.post('/financial/fixed-transactions', payload);
        addToast('Transação fixa criada com sucesso', 'success');
      } else {
        await api.put(`/financial/fixed-transactions/${transactionId}`, payload);
        addToast('Transação fixa atualizada com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/financial/fixed-transactions');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar transação fixa', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoader message="Carregando transação fixa..." />;
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
          <h1 className="text-2xl font-semibold text-white">
            {mode === 'create' ? 'Nova Transação Fixa' : 'Editar Transação Fixa'}
          </h1>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <X size={16} />
            Cancelar
          </Button>
          <Button
            type="submit"
            form="fixed-transaction-form"
            variant="accent"
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving
              ? 'Salvando...'
              : mode === 'create'
                ? 'Criar Fixa'
                : 'Salvar Alterações'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
        <Card>
          <form id="fixed-transaction-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input
                label="Descrição"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Ex: Aluguel"
                required
                disabled={saving}
              />

              <CurrencyInput
                label="Valor"
                value={form.amount}
                onChange={(value) => setForm((prev) => ({ ...prev, amount: value }))}
                disabled={saving}
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Tipo</label>
                <select
                  value={form.type}
                  onChange={(event) =>
                    handleTypeChange(event.target.value as 'INCOME' | 'EXPENSE')
                  }
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white"
                  disabled={saving}
                >
                  <option value="EXPENSE">Despesa Fixa</option>
                  <option value="INCOME">Receita Fixa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {isCreditCardFixedExpense ? (
                <div className="rounded-lg border border-blue-700/60 bg-blue-900/20 px-3 py-2.5 text-sm text-blue-200">
                  <div className="font-medium text-white">Competência da fixa</div>
                  <div className="mt-1">
                    Usa o fechamento atual do cartão
                    {selectedAccount?.statementClosingDay
                      ? ` (dia ${selectedAccount.statementClosingDay})`
                      : ''}
                    .
                  </div>
                </div>
              ) : (
                <Input
                  label="Dia do Vencimento (1-31)"
                  type="number"
                  value={form.dayOfMonth}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, dayOfMonth: event.target.value }))
                  }
                  min="1"
                  max="31"
                  disabled={saving}
                />
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Tipo de Conta
                </label>
                <select
                  value={accountAssignmentType}
                  onChange={(event) =>
                    handleAccountAssignmentTypeChange(
                      event.target.value as AccountAssignmentType
                    )
                  }
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white"
                  disabled={saving}
                >
                  {accountAssignmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  {form.type === 'EXPENSE' && accountAssignmentType === 'CREDIT_CARD'
                    ? 'Cartão'
                    : form.type === 'EXPENSE'
                      ? 'Conta de Origem'
                      : 'Conta de Destino'}
                </label>
                <select
                  value={currentAccountId}
                  onChange={(event) => updateCurrentAccountId(event.target.value)}
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white"
                  disabled={saving || accountAssignmentType === 'NONE'}
                >
                  <option value="">
                    {accountAssignmentType === 'NONE' ? 'Sem conta vinculada' : 'Selecione'}
                  </option>
                  {availableAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatAccountOptionLabel(account)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <CategorySelect
                  label="Categoria"
                  categories={filteredCategories}
                  value={form.categoryId}
                  onChange={(categoryId) =>
                    setForm((prev) => ({ ...prev, categoryId }))
                  }
                  placeholder="Sem categoria"
                  emptyLabel="Sem categoria"
                  disabled={saving}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Observações</label>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                rows={4}
                className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white"
                placeholder="Detalhes opcionais"
                disabled={saving}
              />
            </div>

            {isCreditCardFixedExpense && (
              <div className="rounded-lg border border-blue-700/60 bg-blue-900/20 p-4 text-sm text-blue-200">
                Despesas fixas em cartão serão materializadas como compras recorrentes e
                vinculadas automaticamente à fatura do cartão.
              </div>
            )}

            {hasUnsupportedCreditCardIncome && (
              <div className="rounded-lg border border-amber-700/60 bg-amber-900/20 p-4 text-sm text-amber-200">
                Receita fixa em cartão de crédito não é suportada. Selecione outra conta
                ou deixe a fixa sem conta vinculada.
              </div>
            )}
          </form>
        </Card>

        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">Resumo</div>
              <div className="mt-1 text-sm text-gray-400">
                Transações fixas geram projeções mensais automaticamente no período consultado.
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Valor mensal</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formatCurrency(form.amount)}
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Competência</div>
              <div className="mt-2 text-sm text-gray-300">
                {isCreditCardFixedExpense
                  ? `Fechamento do cartão${selectedAccount?.statementClosingDay ? ` (dia ${selectedAccount.statementClosingDay})` : ''}`
                  : `Todo dia ${form.dayOfMonth || '-'}`}
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Tipo de Conta</div>
              <div className="mt-2 text-sm text-gray-300">
                {getAccountAssignmentLabel(accountAssignmentType)}
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Conta</div>
              <div className="mt-2 text-sm text-gray-300">
                {selectedAccount ? formatAccountOptionLabel(selectedAccount) : 'Sem conta vinculada'}
              </div>
            </div>

            {mode === 'edit' && (
              <div className="rounded-lg border border-blue-700/60 bg-blue-900/20 p-4 text-sm text-blue-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>
                    Salvar esta edição atualiza este template. Competências já materializadas continuam independentes e não serão alteradas.
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
