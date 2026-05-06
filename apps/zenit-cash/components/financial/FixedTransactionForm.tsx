import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { AlertTriangle, ArrowLeft, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

interface FixedTransaction {
  id: number;
  description: string;
  amount: string;
  type: 'INCOME' | 'EXPENSE';
  dayOfMonth: number;
  notes?: string | null;
  isActive: boolean;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  categoryId?: number | null;
}

interface Account {
  id: number;
  name: string;
  type: string;
}

interface Category {
  id: number;
  name: string;
  type: string;
  color: string;
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

interface FixedTransactionFormProps {
  mode: 'create' | 'edit';
  transactionId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? Number(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(num || 0);
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
  const [editing, setEditing] = useState<FixedTransaction | null>(null);
  const [form, setForm] = useState<FormState>({
    description: '',
    amount: '0.00',
    type: 'EXPENSE',
    dayOfMonth: '10',
    notes: '',
    fromAccountId: '',
    toAccountId: '',
    categoryId: ''
  });

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === form.type),
    [categories, form.type]
  );

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

      setAccounts(accountsResponse.data || []);
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

        setEditing(item);
        setForm({
          description: item.description,
          amount: item.amount,
          type: item.type,
          dayOfMonth: String(item.dayOfMonth),
          notes: item.notes || '',
          fromAccountId: item.fromAccountId ? String(item.fromAccountId) : '',
          toAccountId: item.toAccountId ? String(item.toAccountId) : '',
          categoryId: item.categoryId ? String(item.categoryId) : ''
        });
      } else {
        setEditing(null);
        setForm({
          description: '',
          amount: '0.00',
          type: 'EXPENSE',
          dayOfMonth: '10',
          notes: '',
          fromAccountId: '',
          toAccountId: '',
          categoryId: ''
        });
      }
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!form.description.trim()) {
      addToast('Descrição é obrigatória', 'error');
      return;
    }

    if (!form.dayOfMonth || Number(form.dayOfMonth) < 1 || Number(form.dayOfMonth) > 31) {
      addToast('Dia do vencimento deve estar entre 1 e 31', 'error');
      return;
    }

    if (form.type === 'EXPENSE' && !form.fromAccountId) {
      addToast('Conta de origem é obrigatória para despesa fixa', 'error');
      return;
    }

    if (form.type === 'INCOME' && !form.toAccountId) {
      addToast('Conta de destino é obrigatória para receita fixa', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        description: form.description,
        amount: parseFloat(form.amount),
        type: form.type,
        dayOfMonth: Number(form.dayOfMonth),
        notes: form.notes || undefined,
        fromAccountId: form.fromAccountId ? Number(form.fromAccountId) : null,
        toAccountId: form.toAccountId ? Number(form.toAccountId) : null,
        categoryId: form.categoryId ? Number(form.categoryId) : null
      };

      if (mode === 'create') {
        await api.post('/financial/fixed-transactions', payload);
        addToast('Transação fixa criada com sucesso', 'success');
      } else {
        await api.put(`/financial/fixed-transactions/${transactionId}`, payload);
        addToast('Transação fixa atualizada (nova versão para próxima competência)', 'success');
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
                : 'Salvar Nova Versão'}
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
                  onChange={(event) => {
                    const nextType = event.target.value as 'INCOME' | 'EXPENSE';
                    setForm((prev) => ({
                      ...prev,
                      type: nextType,
                      fromAccountId: nextType === 'INCOME' ? '' : prev.fromAccountId,
                      toAccountId: nextType === 'EXPENSE' ? '' : prev.toAccountId,
                      categoryId: ''
                    }));
                  }}
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white"
                  disabled={saving}
                >
                  <option value="EXPENSE">Despesa Fixa</option>
                  <option value="INCOME">Receita Fixa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

              {form.type === 'EXPENSE' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Conta de Origem *
                  </label>
                  <select
                    value={form.fromAccountId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, fromAccountId: event.target.value }))
                    }
                    className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white"
                    disabled={saving}
                  >
                    <option value="">Selecione</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-300">
                    Conta de Destino *
                  </label>
                  <select
                    value={form.toAccountId}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, toAccountId: event.target.value }))
                    }
                    className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white"
                    disabled={saving}
                  >
                    <option value="">Selecione</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Categoria</label>
                <select
                  value={form.categoryId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, categoryId: event.target.value }))
                  }
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white"
                  disabled={saving}
                >
                  <option value="">Sem categoria</option>
                  {filteredCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
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
              <div className="mt-2 text-sm text-gray-300">Todo dia {form.dayOfMonth || '-'}</div>
            </div>

            {mode === 'edit' && (
              <div className="rounded-lg border border-blue-700/60 bg-blue-900/20 p-4 text-sm text-blue-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>
                    Salvar esta edição cria uma nova versão para as próximas competências.
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
