import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CalendarDays,
  Edit2,
  Plus,
  Repeat,
  Trash2,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { InfoModalButton } from '@/components/ui/InfoModalButton';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { useConfirmation } from '@/hooks/useConfirmation';
import { useToast } from '@/components/ui/ToastContext';
import { PageGuard } from '@/components/ui/AccessGuard';
import api from '@/lib/api';
import { formatAccountDisplayName } from '@/utils/accounts';

type FixedTransactionType = 'INCOME' | 'EXPENSE';

interface FixedTransaction {
  id: number;
  description: string;
  amount: string;
  type: FixedTransactionType;
  dayOfMonth: number | null;
  startDate: string;
  endDate?: string | null;
  nextDueDate: string;
  notes?: string | null;
  isActive: boolean;
  fromAccountId?: number | null;
  toAccountId?: number | null;
  categoryId?: number | null;
  fromAccount?: { id: number; name: string; type?: string } | null;
  toAccount?: { id: number; name: string; type?: string } | null;
  category?: { id: number; name: string; color: string } | null;
  materializedTransactionCount?: number;
  canDelete?: boolean;
}

const ALL_FIXED_TRANSACTION_TYPES: FixedTransactionType[] = ['INCOME', 'EXPENSE'];

const FIXED_TRANSACTION_TYPE_OPTIONS = [
  { value: 'INCOME', label: 'Receita' },
  { value: 'EXPENSE', label: 'Despesa' }
];

function FixedTransactionsPageInner() {
  const { addToast } = useToast();
  const confirmation = useConfirmation();

  const [items, setItems] = useState<FixedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<FixedTransactionType[]>([
    ...ALL_FIXED_TRANSACTION_TYPES
  ]);

  const filteredItems = useMemo(() => {
    if (selectedTypes.length === 0) {
      return [];
    }

    return items.filter((item) => selectedTypes.includes(item.type));
  }, [items, selectedTypes]);

  useEffect(() => {
    void fetchFixedTransactions();
  }, [includeInactive]);

  async function fetchFixedTransactions() {
    setLoading(true);

    try {
      const response = await api.get('/financial/fixed-transactions', {
        params: { includeInactive }
      });
      setItems(response.data || []);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar transações fixas', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancelFixed(item: FixedTransaction) {
    confirmation.confirm(
      {
        title: 'Cancelar Transação Fixa',
        message: `Deseja cancelar a transação fixa "${item.description}"?`,
        confirmText: 'Cancelar Fixa',
        cancelText: 'Voltar',
        type: 'warning'
      },
      async () => {
        try {
          await api.patch(`/financial/fixed-transactions/${item.id}/cancel`);
          addToast('Transação fixa cancelada', 'success');
          await fetchFixedTransactions();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao cancelar transação fixa', 'error');
          throw error;
        }
      }
    );
  }

  async function handleDeleteFixed(item: FixedTransaction) {
    confirmation.confirm(
      {
        title: 'Excluir Transação Fixa',
        message: `Deseja excluir a transação fixa "${item.description}"? Essa ação remove o template permanentemente.`,
        confirmText: 'Excluir Fixa',
        cancelText: 'Voltar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/fixed-transactions/${item.id}`);
          addToast('Transação fixa excluída', 'success');
          await fetchFixedTransactions();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir transação fixa', 'error');
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

  function formatCompetenceLabel(item: FixedTransaction): string {
    if (item.type === 'EXPENSE' && item.fromAccount?.type === 'CREDIT_CARD') {
      return 'Fechamento';
    }

    return `Dia ${item.dayOfMonth ?? '-'}`;
  }

  return (
    <DashboardLayout title="Transações Fixas">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Financeiro' },
          { label: 'Transações Fixas' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-white">Transações Fixas</h1>
          <InfoModalButton
            modalTitle="Informações sobre transações fixas"
            buttonLabel="Ver informações sobre transações fixas"
          >
            <p>
              Transações fixas funcionam como templates mensais e são projetadas
              automaticamente no período consultado.
            </p>
            <p>
              Use a listagem para acompanhar as próximas competências e exiba as
              inativas quando precisar revisar fixas canceladas.
            </p>
          </InfoModalButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={includeInactive ? 'accent' : 'outline'}
            onClick={() => setIncludeInactive((prev) => !prev)}
          >
            {includeInactive ? 'Mostrando inativas' : 'Mostrar inativas'}
          </Button>

          <Link href="/financial/fixed-transactions/new">
            <Button variant="accent" className="flex items-center gap-2">
              <Plus size={16} />
              Nova Fixa
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <div className="mb-4 grid grid-cols-1 gap-4 border-b border-gray-700 pb-4 md:grid-cols-[minmax(240px,360px)_1fr]">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Tipo</label>
            <MultiSelect
              options={FIXED_TRANSACTION_TYPE_OPTIONS}
              values={selectedTypes}
              onChange={(values) => setSelectedTypes(values as FixedTransactionType[])}
              placeholder="Selecione os tipos"
              className="mb-0"
              triggerClassName="h-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-gray-400">Carregando transações fixas...</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <Repeat size={42} className="mx-auto mb-3 text-gray-500" />
            <p className="mb-4 text-gray-400">Nenhuma transação fixa cadastrada</p>
            <Link href="/financial/fixed-transactions/new">
              <Button variant="accent" className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar primeira fixa
              </Button>
            </Link>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center">
            <Repeat size={42} className="mx-auto mb-3 text-gray-500" />
            <p className="text-gray-400">Nenhuma transaÃ§Ã£o fixa encontrada para os tipos selecionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                <tr>
                  <th className="w-24 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3 text-left">Descrição</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center">Dia</th>
                  <th className="px-4 py-3 text-left">Conta</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Próximo Venc.</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${!item.isActive ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Link
                          href={`/financial/fixed-transactions/${item.id}`}
                          className="p-1 text-gray-300 transition-colors hover:text-accent"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </Link>
                        {item.isActive && (
                          <button
                            onClick={() => void handleCancelFixed(item)}
                            className="p-1 text-gray-300 transition-colors hover:text-red-400"
                            title="Cancelar"
                          >
                            <Ban size={14} />
                          </button>
                        )}
                        {item.canDelete && (
                          <button
                            onClick={() => void handleDeleteFixed(item)}
                            className="p-1 text-gray-300 transition-colors hover:text-red-400"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">{item.description}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${
                          item.type === 'INCOME'
                            ? 'bg-green-900 text-green-300'
                            : 'bg-red-900 text-red-300'
                        }`}
                      >
                        {item.type === 'INCOME' ? (
                          <TrendingUp size={12} />
                        ) : (
                          <TrendingDown size={12} />
                        )}
                        {item.type === 'INCOME' ? 'Receita' : 'Despesa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-white">
                      {formatCurrency(item.amount)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">
                      {formatCompetenceLabel(item)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {formatAccountDisplayName(item.fromAccount || item.toAccount)}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{item.category?.name || '-'}</td>
                    <td className="px-4 py-3 text-gray-300">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={14} className="text-gray-500" />
                        {formatDate(item.nextDueDate)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          item.isActive ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-300'
                        }`}
                      >
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
