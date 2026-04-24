import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowUpDown,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Edit2,
  Filter,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp,
  X
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import api from '@/lib/api';
import { formatTransactionDescription } from '@/utils/transactions';

interface Transaction {
  id: number | null;
  description: string;
  amount: string;
  date: string;
  dueDate?: string;
  effectiveDate?: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  status: 'PENDING' | 'COMPLETED' | 'CANCELED';
  notes?: string;
  fromAccount?: { id: number; name: string };
  toAccount?: { id: number; name: string };
  category?: { id: number; name: string; color: string };
  tags: { id: number; name: string }[];
  createdByUser: { id: number; name: string };
  createdAt: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  isVirtual?: boolean;
  virtualKey?: string;
  fixedTemplateId?: number | null;
  isFixed?: boolean;
}

interface TransactionFilters {
  startDate: string;
  endDate: string;
  type: string;
  status: string;
  accountId: string;
  categoryId: string;
  search: string;
}

interface Account {
  id: number;
  name: string;
  type: string;
}

interface Category {
  id: number;
  name: string;
  color: string;
  type: string;
}

function getCurrentMonthFilters(): Pick<TransactionFilters, 'startDate' | 'endDate'> {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const format = (date: Date) => date.toISOString().split('T')[0];

  return {
    startDate: format(firstDay),
    endDate: format(lastDay)
  };
}

export default function TransactionsListPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const confirmation = useConfirmation();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showOnlyMaterialized, setShowOnlyMaterialized] = useState(false);
  const [materializingVirtualKey, setMaterializingVirtualKey] = useState<string | null>(null);

  const [sortConfig, setSortConfig] = useState<{
    key: 'dueDate' | 'effectiveDate' | 'description';
    direction: 'asc' | 'desc';
  }>({ key: 'dueDate', direction: 'desc' });

  const currentMonthDefaults = getCurrentMonthFilters();

  const [filters, setFilters] = useState<TransactionFilters>({
    startDate: currentMonthDefaults.startDate,
    endDate: currentMonthDefaults.endDate,
    type: '',
    status: '',
    accountId: '',
    categoryId: '',
    search: ''
  });

  useEffect(() => {
    void fetchAccounts();
    void fetchCategories();
  }, []);

  useEffect(() => {
    void fetchData();
  }, [currentPage, filters, showOnlyMaterialized]);

  async function fetchData() {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: '20',
        startDate: filters.startDate,
        endDate: filters.endDate,
        includeVirtualFixed: (!showOnlyMaterialized).toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([key, value]) => {
            if (key === 'startDate' || key === 'endDate') {
              return false;
            }
            return value !== '';
          })
        )
      });

      const response = await api.get(`/financial/transactions?${params}`);
      setTransactions(response.data.data || []);
      setTotalPages(response.data.pages || 1);
    } catch (error: any) {
      const fallback = 'Erro ao carregar transacoes';
      const message = error.response?.data?.error || fallback;
      addToast(message, 'error');
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

  async function handleDelete(transaction: Transaction) {
    if (!transaction.id) {
      return;
    }

    confirmation.confirm(
      {
        title: 'Confirmar Exclusao',
        message: `Tem certeza que deseja excluir a transacao "${formatTransactionDescription(
          transaction.description,
          transaction.installmentNumber,
          transaction.totalInstallments
        )}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/transactions/${transaction.id}`);
          addToast('Transacao excluida com sucesso', 'success');
          await fetchData();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir transacao', 'error');
          throw error;
        }
      }
    );
  }

  async function handleMaterializeAndEdit(transaction: Transaction) {
    if (!transaction.fixedTemplateId) {
      addToast('Transacao virtual sem template associado', 'error');
      return;
    }

    const occurrenceDate = transaction.dueDate || transaction.date;
    if (!occurrenceDate) {
      addToast('Data da ocorrencia virtual nao encontrada', 'error');
      return;
    }

    const key = transaction.virtualKey || `${transaction.fixedTemplateId}:${occurrenceDate}`;

    setMaterializingVirtualKey(key);

    try {
      const response = await api.post(`/financial/fixed-transactions/${transaction.fixedTemplateId}/materialize`, {
        occurrenceDate
      });

      const materializedId = response.data?.transaction?.id;
      if (!materializedId) {
        addToast('Nao foi possivel materializar a transacao virtual', 'error');
        return;
      }

      router.push(`/financial/transactions/${materializedId}`);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao materializar transacao virtual', 'error');
    } finally {
      setMaterializingVirtualKey(null);
    }
  }

  function handleSort(key: 'dueDate' | 'effectiveDate' | 'description') {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  }

  function formatCurrency(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;

    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(num || 0);
  }

  function formatDate(dateString?: string): string {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  function formatDateShort(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      timeZone: 'UTC'
    });
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'INCOME':
        return <TrendingUp size={16} className="text-green-400" />;
      case 'EXPENSE':
        return <TrendingDown size={16} className="text-red-400" />;
      case 'TRANSFER':
        return <ArrowUpDown size={16} className="text-blue-400" />;
      default:
        return <Receipt size={16} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status: string, isVirtual?: boolean) => {
    if (isVirtual) {
      return 'bg-sky-900 text-sky-200';
    }

    switch (status) {
      case 'COMPLETED':
        return 'bg-green-900 text-green-300';
      case 'PENDING':
        return 'bg-yellow-900 text-yellow-300';
      case 'CANCELED':
        return 'bg-red-900 text-red-300';
      default:
        return 'bg-gray-700 text-gray-300';
    }
  };

  const getAmountColor = (type: string) => {
    switch (type) {
      case 'INCOME':
        return 'text-green-400';
      case 'EXPENSE':
        return 'text-red-400';
      case 'TRANSFER':
        return 'text-blue-400';
      default:
        return 'text-gray-300';
    }
  };

  const getStatusIcon = (status: string, isVirtual?: boolean) => {
    if (isVirtual) {
      return <Clock size={12} className="text-sky-300" />;
    }

    switch (status) {
      case 'COMPLETED':
        return <CheckCircle size={12} className="text-green-400" />;
      case 'PENDING':
        return <Clock size={12} className="text-yellow-400" />;
      case 'CANCELED':
        return <X size={12} className="text-red-400" />;
      default:
        return null;
    }
  };

  const sortedTransactions = useMemo(() => {
    const sorted = [...transactions];

    sorted.sort((a, b) => {
      const { key, direction } = sortConfig;
      const aValue = (a as any)[key];
      const bValue = (b as any)[key];

      if (!aValue && !bValue) return 0;
      if (!aValue) return direction === 'asc' ? -1 : 1;
      if (!bValue) return direction === 'asc' ? 1 : -1;

      if (key === 'description') {
        return direction === 'asc'
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue));
      }

      const aDate = new Date(aValue).getTime();
      const bDate = new Date(bValue).getTime();

      return direction === 'asc' ? aDate - bDate : bDate - aDate;
    });

    return sorted;
  }, [transactions, sortConfig]);

  if (loading && transactions.length === 0) {
    return (
      <DashboardLayout title="Transacoes">
        <PageLoader message="Carregando transacoes..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Transacoes">
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Financeiro' },
          { label: 'Transacoes' }
        ]}
      />

      <div className="flex justify-between items-center mb-6 gap-2">
        <h1 className="text-2xl font-semibold text-white">Transacoes Financeiras</h1>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button
            variant={showOnlyMaterialized ? 'accent' : 'outline'}
            onClick={() => {
              setShowOnlyMaterialized((prev) => !prev);
              setCurrentPage(1);
            }}
            className="flex items-center gap-2"
          >
            {showOnlyMaterialized ? 'Somente materializadas' : 'Incluindo projetadas'}
          </Button>

          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter size={16} />
            Filtros
          </Button>

          <Link href="/financial/transactions/new?type=EXPENSE&locked=true">
            <Button variant="outline" className="flex items-center gap-2">
              <TrendingDown size={16} />
              Nova Despesa
            </Button>
          </Link>
          <Link href="/financial/transactions/new?type=INCOME&locked=true">
            <Button variant="outline" className="flex items-center gap-2">
              <TrendingUp size={16} />
              Nova Receita
            </Button>
          </Link>
          <Link href="/financial/transactions/new?type=TRANSFER&locked=true">
            <Button variant="accent" className="flex items-center gap-2">
              <ArrowUpDown size={16} />
              Nova Transferencia
            </Button>
          </Link>
        </div>
      </div>

      {showFilters && (
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <Input
              label="Buscar"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Descricao, observacoes..."
            />

            <Input
              label="Data Inicial *"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="mb-0"
            />

            <Input
              label="Data Final *"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="mb-0"
            />

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Tipo</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-accent"
              >
                <option value="">Todos</option>
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
                <option value="TRANSFER">Transferencia</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-accent"
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendente</option>
                <option value="COMPLETED">Concluida</option>
                <option value="CANCELED">Cancelada</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Conta</label>
              <select
                value={filters.accountId}
                onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}
                className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-accent"
              >
                <option value="">Todas</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">Categoria</label>
              <select
                value={filters.categoryId}
                onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
                className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-accent"
              >
                <option value="">Todas</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  const defaults = getCurrentMonthFilters();
                  setFilters({
                    startDate: defaults.startDate,
                    endDate: defaults.endDate,
                    type: '',
                    status: '',
                    accountId: '',
                    categoryId: '',
                    search: ''
                  });
                  setCurrentPage(1);
                }}
                className="px-6"
              >
                Limpar Filtros
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        {sortedTransactions.length === 0 ? (
          <div className="text-center py-10">
            <Receipt size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4">Nenhuma transacao encontrada para o periodo selecionado</p>
            <Link href="/financial/transactions/new">
              <Button variant="accent" className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar Primeira Transacao
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-center w-24">Acoes</th>
                    <th className="px-2 py-3 text-left cursor-pointer" onClick={() => handleSort('dueDate')}>
                      Data Vencimento
                      {sortConfig.key === 'dueDate' && (
                        sortConfig.direction === 'asc'
                          ? <ChevronUp size={12} className="inline ml-1" />
                          : <ChevronDown size={12} className="inline ml-1" />
                      )}
                    </th>
                    <th className="px-2 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left cursor-pointer" onClick={() => handleSort('description')}>
                      Descricao
                      {sortConfig.key === 'description' && (
                        sortConfig.direction === 'asc'
                          ? <ChevronUp size={12} className="inline ml-1" />
                          : <ChevronDown size={12} className="inline ml-1" />
                      )}
                    </th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-left">Conta</th>
                    <th className="px-4 py-3 text-left">Categoria</th>
                    <th className="px-4 py-3 text-center cursor-pointer" onClick={() => handleSort('effectiveDate')}>
                      Data Pagamento
                      {sortConfig.key === 'effectiveDate' && (
                        sortConfig.direction === 'asc'
                          ? <ChevronUp size={12} className="inline ml-1" />
                          : <ChevronDown size={12} className="inline ml-1" />
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTransactions.map((transaction) => {
                    const isMaterializing = materializingVirtualKey === (transaction.virtualKey || '');

                    return (
                      <tr
                        key={transaction.virtualKey || transaction.id || `${transaction.description}-${transaction.date}`}
                        className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${transaction.isVirtual ? 'bg-sky-950/20' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-center">
                            {transaction.isVirtual ? (
                              <button
                                onClick={() => handleMaterializeAndEdit(transaction)}
                                className="p-1 text-gray-300 hover:text-accent transition-colors"
                                title="Materializar e editar"
                                disabled={isMaterializing}
                              >
                                {isMaterializing ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Edit2 size={14} />
                                )}
                              </button>
                            ) : (
                              <>
                                {transaction.id && (
                                  <Link href={`/financial/transactions/${transaction.id}`}>
                                    <button
                                      className="p-1 text-gray-300 hover:text-accent transition-colors"
                                      title="Editar"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                  </Link>
                                )}
                                {transaction.id && transaction.status !== 'COMPLETED' && (
                                  <button
                                    onClick={() => handleDelete(transaction)}
                                    className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                                    title="Excluir"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>

                        <td className="px-2 py-3 text-gray-300">{formatDate(transaction.dueDate)}</td>

                        <td className="px-2 py-3">
                          <div className="flex items-center gap-2">
                            {getTypeIcon(transaction.type)}
                            <span className="text-sm text-gray-300">
                              {transaction.type === 'INCOME'
                                ? 'Receita'
                                : transaction.type === 'EXPENSE'
                                  ? 'Despesa'
                                  : 'Transferencia'}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium text-white flex items-center gap-2">
                              {formatTransactionDescription(
                                transaction.description,
                                transaction.installmentNumber,
                                transaction.totalInstallments
                              )}
                              {transaction.isVirtual && (
                                <span className="px-2 py-0.5 bg-sky-900 text-sky-200 text-[10px] rounded-full uppercase">
                                  Virtual
                                </span>
                              )}
                              {transaction.isFixed && !transaction.isVirtual && (
                                <span className="px-2 py-0.5 bg-indigo-900 text-indigo-200 text-[10px] rounded-full uppercase">
                                  Fixa
                                </span>
                              )}
                            </div>
                            {transaction.notes && (
                              <div className="text-xs text-gray-400 mt-1">{transaction.notes}</div>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-right">
                          <span className={`font-medium ${getAmountColor(transaction.type)}`}>
                            {formatCurrency(transaction.amount)}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center gap-1 justify-center">
                            {getStatusIcon(transaction.status, transaction.isVirtual)}
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(transaction.status, transaction.isVirtual)}`}>
                              {transaction.isVirtual
                                ? 'Projetada'
                                : transaction.status === 'COMPLETED'
                                  ? 'Concluida'
                                  : transaction.status === 'PENDING'
                                    ? 'Pendente'
                                    : 'Cancelada'}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-gray-300">
                          {transaction.fromAccount?.name || transaction.toAccount?.name || '-'}
                        </td>

                        <td className="px-4 py-3">
                          {transaction.category ? (
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: transaction.category.color }} />
                              <span className="text-sm text-gray-300">{transaction.category.name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <div className="text-xs space-y-1">
                            {transaction.effectiveDate && (
                              <div className="flex items-center gap-1 text-green-400">
                                <CheckCircle size={10} />
                                <span>Efet: {formatDateShort(transaction.effectiveDate)}</span>
                              </div>
                            )}
                            {!transaction.effectiveDate && <span className="text-gray-500">-</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-700">
                <div className="text-sm text-gray-400">Pagina {currentPage} de {totalPages}</div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Proxima
                  </Button>
                </div>
              </div>
            )}
          </>
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
