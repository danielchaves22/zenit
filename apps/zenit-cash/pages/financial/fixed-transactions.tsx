import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Edit2,
  Plus,
  Repeat,
  Save,
  TrendingDown,
  TrendingUp,
  X,
  Ban
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { useToast } from '@/components/ui/ToastContext';
import { PageGuard } from '@/components/ui/AccessGuard';
import api from '@/lib/api';

interface FixedTransaction {
  id: number;
  description: string;
  amount: string;
  type: 'INCOME' | 'EXPENSE';
  dayOfMonth: number;
  startDate: string;
  endDate?: string | null;
  nextDueDate: string;
  notes?: string | null;
  isActive: boolean;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  categoryId?: number | null;
  fromAccount?: { id: number; name: string } | null;
  toAccount?: { id: number; name: string } | null;
  category?: { id: number; name: string; color: string } | null;
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

function FixedTransactionsPageInner() {
  const { addToast } = useToast();
  const confirmation = useConfirmation();

  const [items, setItems] = useState<FixedTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
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
    void fetchBootstrap();
  }, []);

  useEffect(() => {
    void fetchFixedTransactions();
  }, [includeInactive]);

  async function fetchBootstrap() {
    await Promise.all([
      fetchAccounts(),
      fetchCategories(),
      fetchFixedTransactions()
    ]);
  }

  async function fetchAccounts() {
    try {
      const response = await api.get('/financial/accounts');
      setAccounts(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
    }
  }

  async function fetchCategories() {
    try {
      const response = await api.get('/financial/categories');
      setCategories(response.data || []);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    }
  }

  async function fetchFixedTransactions() {
    setLoading(true);
    try {
      const response = await api.get('/financial/fixed-transactions', {
        params: { includeInactive }
      });
      setItems(response.data || []);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar transacoes fixas', 'error');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setEditing(null);
    setShowForm(false);
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

  function openCreateForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(item: FixedTransaction) {
    setEditing(item);
    setShowForm(true);
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
  }

  async function handleSubmit() {
    if (!form.description.trim()) {
      addToast('Descricao e obrigatoria', 'error');
      return;
    }

    if (!form.dayOfMonth || Number(form.dayOfMonth) < 1 || Number(form.dayOfMonth) > 31) {
      addToast('Dia do vencimento deve estar entre 1 e 31', 'error');
      return;
    }

    if (form.type === 'EXPENSE' && !form.fromAccountId) {
      addToast('Conta de origem e obrigatoria para despesa fixa', 'error');
      return;
    }

    if (form.type === 'INCOME' && !form.toAccountId) {
      addToast('Conta de destino e obrigatoria para receita fixa', 'error');
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

      if (editing) {
        await api.put(`/financial/fixed-transactions/${editing.id}`, payload);
        addToast('Transacao fixa atualizada (nova versao para proxima competencia)', 'success');
      } else {
        await api.post('/financial/fixed-transactions', payload);
        addToast('Transacao fixa criada com sucesso', 'success');
      }

      resetForm();
      await fetchFixedTransactions();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar transacao fixa', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelFixed(item: FixedTransaction) {
    confirmation.confirm(
      {
        title: 'Cancelar Transacao Fixa',
        message: `Deseja cancelar a transacao fixa "${item.description}"?`,
        confirmText: 'Cancelar Fixa',
        cancelText: 'Voltar',
        type: 'warning'
      },
      async () => {
        try {
          await api.patch(`/financial/fixed-transactions/${item.id}/cancel`);
          addToast('Transacao fixa cancelada', 'success');
          await fetchFixedTransactions();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao cancelar transacao fixa', 'error');
          throw error;
        }
      }
    );
  }

  function formatCurrency(value: string | number): string {
    const num = typeof value === 'string' ? Number(value) : value;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(num || 0);
  }

  function formatDate(date?: string | null): string {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  return (
    <DashboardLayout title="Transacoes Fixas">
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Financeiro' },
          { label: 'Transacoes Fixas' }
        ]}
      />

      <div className="flex justify-between items-center mb-6 gap-3">
        <h1 className="text-2xl font-semibold text-white">Transacoes Fixas</h1>
        {showForm ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetForm} disabled={saving} className="flex items-center gap-2">
              <X size={16} />
              Cancelar
            </Button>
            <Button variant="accent" onClick={handleSubmit} disabled={saving} className="flex items-center gap-2">
              <Save size={16} />
              {saving ? 'Salvando...' : editing ? 'Salvar Nova Versao' : 'Criar Fixa'}
            </Button>
          </div>
        ) : (
          <Button variant="accent" onClick={openCreateForm} className="flex items-center gap-2">
            <Plus size={16} />
            Nova Fixa
          </Button>
        )}
      </div>

      <Card className="mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-gray-300 flex items-center gap-2">
            <Repeat size={16} className="text-accent" />
            Fixas sao templates mensais projetados automaticamente no periodo consultado.
          </div>
          <Button
            variant={includeInactive ? 'accent' : 'outline'}
            onClick={() => setIncludeInactive((prev) => !prev)}
          >
            {includeInactive ? 'Mostrando inativas' : 'Mostrar inativas'}
          </Button>
        </div>
      </Card>

      {showForm && (
        <Card className="mb-6 border-2 border-accent/60">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">
              {editing ? `Editando Fixa: ${editing.description}` : 'Nova Transacao Fixa'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Descricao"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex: Aluguel"
                required
              />

              <CurrencyInput
                label="Valor"
                value={form.amount}
                onChange={(value) => setForm({ ...form, amount: value })}
              />

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">Tipo</label>
                <select
                  value={form.type}
                  onChange={(e) => {
                    const nextType = e.target.value as 'INCOME' | 'EXPENSE';
                    setForm((prev) => ({
                      ...prev,
                      type: nextType,
                      fromAccountId: nextType === 'INCOME' ? '' : prev.fromAccountId,
                      toAccountId: nextType === 'EXPENSE' ? '' : prev.toAccountId,
                      categoryId: ''
                    }));
                  }}
                  className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded"
                >
                  <option value="EXPENSE">Despesa Fixa</option>
                  <option value="INCOME">Receita Fixa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Dia do Vencimento (1-31)"
                type="number"
                value={form.dayOfMonth}
                onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })}
                min="1"
                max="31"
              />

              {form.type === 'EXPENSE' ? (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">Conta de Origem *</label>
                  <select
                    value={form.fromAccountId}
                    onChange={(e) => setForm({ ...form, fromAccountId: e.target.value })}
                    className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded"
                  >
                    <option value="">Selecione</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">Conta de Destino *</label>
                  <select
                    value={form.toAccountId}
                    onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}
                    className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded"
                  >
                    <option value="">Selecione</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">Categoria</label>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                  className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded"
                >
                  <option value="">Sem categoria</option>
                  {filteredCategories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Observacoes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded"
                placeholder="Detalhes opcionais"
              />
            </div>
          </div>
        </Card>
      )}

      <Card>
        {loading ? (
          <div className="py-8 text-center text-gray-400">Carregando transacoes fixas...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <Repeat size={42} className="mx-auto text-gray-500 mb-3" />
            <p className="text-gray-400 mb-4">Nenhuma transacao fixa cadastrada</p>
            <Button variant="accent" onClick={openCreateForm} className="inline-flex items-center gap-2">
              <Plus size={16} />
              Criar primeira fixa
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-center w-24">Acoes</th>
                  <th className="px-4 py-3 text-left">Descricao</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center">Dia</th>
                  <th className="px-4 py-3 text-left">Conta</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Proximo Venc.</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${!item.isActive ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => openEditForm(item)}
                          className="p-1 text-gray-300 hover:text-accent transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        {item.isActive && (
                          <button
                            onClick={() => handleCancelFixed(item)}
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                            title="Cancelar"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-white font-medium">{item.description}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${item.type === 'INCOME' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                        {item.type === 'INCOME' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {item.type === 'INCOME' ? 'Receita' : 'Despesa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white">{formatCurrency(item.amount)}</td>
                    <td className="px-4 py-3 text-center text-gray-300">Dia {item.dayOfMonth}</td>
                    <td className="px-4 py-3 text-gray-300">{item.fromAccount?.name || item.toAccount?.name || '-'}</td>
                    <td className="px-4 py-3 text-gray-300">{item.category?.name || '-'}</td>
                    <td className="px-4 py-3 text-gray-300">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={14} className="text-gray-500" />
                        {formatDate(item.nextDueDate)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${item.isActive ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'}`}>
                        {item.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    </DashboardLayout>
  );
}

export default function FixedTransactionsPage() {
  return (
    <PageGuard requiredRole="USER">
      <FixedTransactionsPageInner />
    </PageGuard>
  );
}
