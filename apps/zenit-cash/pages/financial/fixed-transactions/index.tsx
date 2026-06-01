import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
type FixedTransactionAccountScope = 'LIQUID' | 'CREDIT_CARD';
export type FixedTransactionSortKey = 'description' | 'amount' | 'nextDueDate';
export type FixedTransactionSortDirection = 'asc' | 'desc';

export interface FixedTransaction {
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
const ALL_FIXED_TRANSACTION_ACCOUNT_SCOPES: FixedTransactionAccountScope[] = [
  'LIQUID',
  'CREDIT_CARD'
];

const FIXED_TRANSACTION_TYPE_OPTIONS = [
  { value: 'INCOME', label: 'Receita' },
  { value: 'EXPENSE', label: 'Despesa' }
];

const FIXED_TRANSACTION_ACCOUNT_SCOPE_OPTIONS = [
  { value: 'LIQUID', label: 'Contas de disponibilidade' },
  { value: 'CREDIT_CARD', label: 'Cartões' }
];

function compareFixedTransactionDates(left?: string | null, right?: string | null) {
  const leftTime = left ? new Date(left).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right ? new Date(right).getTime() : Number.POSITIVE_INFINITY;

  return leftTime - rightTime;
}

export function getFixedTransactionAccountScope(
  item: Pick<FixedTransaction, 'type' | 'fromAccount' | 'toAccount'>
): FixedTransactionAccountScope {
  const linkedAccountType =
    item.type === 'EXPENSE' ? item.fromAccount?.type : item.toAccount?.type;

  return linkedAccountType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'LIQUID';
}

export function sortFixedTransactions(
  items: FixedTransaction[],
  sortKey: FixedTransactionSortKey | null,
  direction: FixedTransactionSortDirection = 'asc'
) {
  const sortedItems = [...items];

  if (!sortKey) {
    return sortedItems;
  }

  sortedItems.sort((left, right) => {
    let comparison = 0;

    if (sortKey === 'description') {
      comparison = left.description.localeCompare(right.description, 'pt-BR', {
        sensitivity: 'base'
      });

      if (comparison === 0) {
        comparison = compareFixedTransactionDates(left.nextDueDate, right.nextDueDate);
      }
    } else if (sortKey === 'amount') {
      comparison = Number(left.amount || 0) - Number(right.amount || 0);

      if (comparison === 0) {
        comparison = left.description.localeCompare(right.description, 'pt-BR', {
          sensitivity: 'base'
        });
      }
    } else {
      comparison = compareFixedTransactionDates(left.nextDueDate, right.nextDueDate);

      if (comparison === 0) {
        comparison = left.description.localeCompare(right.description, 'pt-BR', {
          sensitivity: 'base'
        });
      }
    }

    if (comparison === 0) {
      comparison = left.id - right.id;
    }

    return direction === 'asc' ? comparison : -comparison;
  });

  return sortedItems;
}

function FixedTransactionsPageInner() {
  const { addToast } = useToast();
  const confirmation = useConfirmation();

  const [items, setItems] = useState<FixedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<FixedTransactionType[]>([
    ...ALL_FIXED_TRANSACTION_TYPES
  ]);
  const [selectedAccountScopes, setSelectedAccountScopes] = useState<
    FixedTransactionAccountScope[]
  >([...ALL_FIXED_TRANSACTION_ACCOUNT_SCOPES]);
  const [sortKey, setSortKey] = useState<FixedTransactionSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<FixedTransactionSortDirection>('asc');

  const filteredItems = useMemo(() => {
    if (selectedTypes.length === 0 || selectedAccountScopes.length === 0) {
      return [];
    }

    return items.filter(
      (item) =>
        selectedTypes.includes(item.type) &&
        selectedAccountScopes.includes(getFixedTransactionAccountScope(item))
    );
  }, [items, selectedAccountScopes, selectedTypes]);

  const sortedItems = useMemo(
    () => sortFixedTransactions(filteredItems, sortKey, sortDirection),
    [filteredItems, sortDirection, sortKey]
  );

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

  function handleSortChange(nextSortKey: FixedTransactionSortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection('asc');
  }

  function renderSortIcon(columnKey: FixedTransactionSortKey) {
    if (sortKey !== columnKey) {
      return <ArrowUpDown size={14} className="text-gray-500" />;
    }

    if (sortDirection === 'asc') {
      return <ArrowUp size={14} className="text-accent" />;
    }

    return <ArrowDown size={14} className="text-accent" />;
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
        <div className="mb-4 grid grid-cols-1 gap-4 border-b border-gray-700 pb-4 md:grid-cols-2 xl:grid-cols-[minmax(240px,360px)_minmax(280px,420px)_1fr]">
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
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">Origem das fixas</label>
            <MultiSelect
              options={FIXED_TRANSACTION_ACCOUNT_SCOPE_OPTIONS}
              values={selectedAccountScopes}
              onChange={(values) =>
                setSelectedAccountScopes(values as FixedTransactionAccountScope[])
              }
              placeholder="Selecione as origens"
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
            <p className="text-gray-400">Nenhuma transação fixa encontrada para os filtros selecionados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                <tr>
                  <th className="w-24 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => handleSortChange('description')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-white"
                      aria-label={`Ordenar por descrição ${
                        sortKey === 'description' && sortDirection === 'asc'
                          ? 'decrescente'
                          : 'crescente'
                      }`}
                    >
                      Descrição
                      {renderSortIcon('description')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSortChange('amount')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-white"
                      aria-label={`Ordenar por valor ${
                        sortKey === 'amount' && sortDirection === 'asc'
                          ? 'decrescente'
                          : 'crescente'
                      }`}
                    >
                      Valor
                      {renderSortIcon('amount')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">Dia</th>
                  <th className="px-4 py-3 text-left">Conta</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">
                    <button
                      type="button"
                      onClick={() => handleSortChange('nextDueDate')}
                      className="inline-flex items-center gap-1 transition-colors hover:text-white"
                      aria-label={`Ordenar por próximo vencimento ${
                        sortKey === 'nextDueDate' && sortDirection === 'asc'
                          ? 'decrescente'
                          : 'crescente'
                      }`}
                    >
                      Próximo Venc.
                      {renderSortIcon('nextDueDate')}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
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
