// frontend/pages/financial/transactions/index.tsx - CORREÇÃO DE URL
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { 
  Plus, Receipt, Edit2, Trash2, Eye, Filter, Download, 
  TrendingUp, TrendingDown, ArrowUpDown, Calendar,
  Search, RefreshCw, Clock, CheckCircle, X
} from 'lucide-react';
import Link from 'next/link';
import api from '@/lib/api';

interface Transaction {
  id: number;
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

export default function TransactionsListPage() {
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  
  const [filters, setFilters] = useState<TransactionFilters>({
    startDate: '',
    endDate: '',
    type: '',
    status: '',
    accountId: '',
    categoryId: '',
    search: ''
  });

  useEffect(() => {
    fetchData();
    fetchAccounts();
    fetchCategories();
  }, [currentPage, filters]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: '20',
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });

      const response = await api.get(`/financial/transactions?${params}`);
      setTransactions(response.data.data);
      setTotalPages(response.data.pages);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar transações', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchAccounts() {
    try {
      const response = await api.get('/financial/accounts');
      setAccounts(response.data);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
    }
  }

  async function fetchCategories() {
    try {
      const response = await api.get('/financial/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    }
  }

  async function handleDelete(transaction: Transaction) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir a transação "${transaction.description}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/transactions/${transaction.id}`);
          addToast('Transação excluída com sucesso', 'success');
          fetchData();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir transação', 'error');
          throw error;
        }
      }
    );
  }

  function formatCurrency(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(num);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR');
  }

  function formatDateShort(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
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

  const getStatusColor = (status: string) => {
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

  const getStatusIcon = (status: string) => {
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

  if (loading && transactions.length === 0) {
    return (
      <DashboardLayout title="Transações">
        <PageLoader message="Carregando transações..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Transações">
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Financeiro' },
        { label: 'Transações' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Transações Financeiras</h1>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2"
          >
            <Filter size={16} />
            Filtros
          </Button>
          
          <div className="flex gap-2">
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
                Nova Transferência
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Filtros */}
      {showFilters && (
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <Input
              label="Buscar"
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
              placeholder="Descrição, observações..."
            />
            
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Tipo
              </label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({...filters, type: e.target.value})}
                className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-accent"
              >
                <option value="">Todos</option>
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
                <option value="TRANSFER">Transferência</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-accent"
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendente</option>
                <option value="COMPLETED">Concluída</option>
                <option value="CANCELED">Cancelada</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300">
                Conta
              </label>
              <select
                value={filters.accountId}
                onChange={(e) => setFilters({...filters, accountId: e.target.value})}
                className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-accent"
              >
                <option value="">Todas</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Data Inicial"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              className="mb-0"
            />

            <Input
              label="Data Final"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              className="mb-0"
            />

            {/* Botão Limpar alinhado com os campos */}
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setFilters({
                    startDate: '',
                    endDate: '',
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

      {/* Lista de Transações */}
      <Card>
        {transactions.length === 0 ? (
          <div className="text-center py-10">
            <Receipt size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4">Nenhuma transação encontrada</p>
            <Link href="/financial/transactions/new">
              <Button variant="accent" className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar Primeira Transação
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-center w-20">Ações</th>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-left">Descrição</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-left">Conta</th>
                    <th className="px-4 py-3 text-left">Categoria</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-center">Datas</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr 
                      key={transaction.id} 
                      className="border-b border-gray-700 hover:bg-[#1a1f2b]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <Link href={`/financial/transactions/${transaction.id}`}>
                            <button
                              className="p-1 text-gray-300 hover:text-accent transition-colors"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </button>
                          </Link>
                          {transaction.status !== 'COMPLETED' && (
                            <button
                              onClick={() => handleDelete(transaction)}
                              className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                              title="Excluir"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 text-gray-300">
                        {formatDate(transaction.date)}
                      </td>
                      
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-white">
                            {transaction.description}
                          </div>
                          {transaction.notes && (
                            <div className="text-xs text-gray-400 mt-1">
                              {transaction.notes}
                            </div>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getTypeIcon(transaction.type)}
                          <span className="text-sm text-gray-300">
                            {transaction.type === 'INCOME' ? 'Receita' : 
                             transaction.type === 'EXPENSE' ? 'Despesa' : 'Transferência'}
                          </span>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 text-right">
                        <span className={`font-medium ${getAmountColor(transaction.type)}`}>
                          {formatCurrency(transaction.amount)}
                        </span>
                      </td>
                      
                      <td className="px-4 py-3 text-gray-300">
                        {transaction.fromAccount?.name || transaction.toAccount?.name || '-'}
                      </td>
                      
                      <td className="px-4 py-3">
                        {transaction.category ? (
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: transaction.category.color }}
                            />
                            <span className="text-sm text-gray-300">
                              {transaction.category.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center gap-1 justify-center">
                          {getStatusIcon(transaction.status)}
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(transaction.status)}`}>
                            {transaction.status === 'COMPLETED' ? 'Concluída' :
                             transaction.status === 'PENDING' ? 'Pendente' : 'Cancelada'}
                          </span>
                        </div>
                      </td>
                      
                      {/* Nova coluna para datas */}
                      <td className="px-4 py-3">
                        <div className="text-xs space-y-1">
                          {transaction.dueDate && (
                            <div className="flex items-center gap-1 text-yellow-400">
                              <Clock size={10} />
                              <span>Venc: {formatDateShort(transaction.dueDate)}</span>
                            </div>
                          )}
                          {transaction.effectiveDate && (
                            <div className="flex items-center gap-1 text-green-400">
                              <CheckCircle size={10} />
                              <span>Efet: {formatDateShort(transaction.effectiveDate)}</span>
                            </div>
                          )}
                          {!transaction.dueDate && !transaction.effectiveDate && (
                            <span className="text-gray-500">-</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-6 pt-6 border-t border-gray-700">
                <div className="text-sm text-gray-400">
                  Página {currentPage} de {totalPages}
                </div>
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
                    Próxima
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