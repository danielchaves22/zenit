// frontend/pages/financial/accounts.tsx
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { 
  Plus, CreditCard, Edit2, Trash2, Eye, EyeOff, 
  DollarSign, Settings, AlertTriangle 
} from 'lucide-react';
import api from '@/lib/api';

interface Account {
  id: number;
  name: string;
  type: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'INVESTMENT' | 'CASH';
  balance: string;
  accountNumber?: string;
  bankName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AccountsPage() {
  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'CHECKING' as Account['type'],
    initialBalance: '0',
    accountNumber: '',
    bankName: '',
    isActive: true
  });

  // Balance adjustment modal
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [adjustingAccount, setAdjustingAccount] = useState<Account | null>(null);
  const [balanceData, setBalanceData] = useState({
    newBalance: '',
    reason: ''
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType) params.append('type', filterType);
      if (filterStatus) params.append('isActive', filterStatus);

      const response = await api.get(`/financial/accounts?${params}`);
      setAccounts(response.data);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar contas';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  function openNewForm() {
    setEditingAccount(null);
    setFormData({
      name: '',
      type: 'CHECKING',
      initialBalance: '0',
      accountNumber: '',
      bankName: '',
      isActive: true
    });
    setShowForm(true);
  }

  function openEditForm(account: Account) {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      type: account.type,
      initialBalance: account.balance,
      accountNumber: account.accountNumber || '',
      bankName: account.bankName || '',
      isActive: account.isActive
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingAccount(null);
    setFormData({
      name: '',
      type: 'CHECKING',
      initialBalance: '0',
      accountNumber: '',
      bankName: '',
      isActive: true
    });
  }

  function openBalanceModal(account: Account) {
    setAdjustingAccount(account);
    setBalanceData({
      newBalance: account.balance,
      reason: ''
    });
    setShowBalanceModal(true);
  }

  function closeBalanceModal() {
    setShowBalanceModal(false);
    setAdjustingAccount(null);
    setBalanceData({
      newBalance: '',
      reason: ''
    });
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      addToast('Nome da conta é obrigatório', 'error');
      return;
    }

    setFormLoading(true);

    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        accountNumber: formData.accountNumber || null,
        bankName: formData.bankName || null,
        isActive: formData.isActive,
        ...(editingAccount ? {} : { initialBalance: formData.initialBalance })
      };

      if (editingAccount) {
        await api.put(`/financial/accounts/${editingAccount.id}`, payload);
        addToast('Conta atualizada com sucesso', 'success');
      } else {
        await api.post('/financial/accounts', payload);
        addToast('Conta criada com sucesso', 'success');
      }

      closeForm();
      fetchAccounts();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar conta', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleBalanceAdjust() {
    if (!adjustingAccount || !balanceData.reason.trim()) {
      addToast('Motivo do ajuste é obrigatório', 'error');
      return;
    }

    setFormLoading(true);

    try {
      await api.post(`/financial/accounts/${adjustingAccount.id}/adjust-balance`, {
        newBalance: parseFloat(balanceData.newBalance.replace(/[^\d.-]/g, '')),
        reason: balanceData.reason
      });

      addToast('Saldo ajustado com sucesso', 'success');
      closeBalanceModal();
      fetchAccounts();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao ajustar saldo', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(account: Account) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir a conta "${account.name}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/accounts/${account.id}`);
          addToast('Conta excluída com sucesso', 'success');
          
          if (editingAccount?.id === account.id) {
            closeForm();
          }
          
          fetchAccounts();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir conta', 'error');
          throw err;
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

  function getAccountTypeLabel(type: string): string {
    const types: Record<string, string> = {
      'CHECKING': 'Conta Corrente',
      'SAVINGS': 'Poupança',
      'CREDIT_CARD': 'Cartão de Crédito',
      'INVESTMENT': 'Investimento',
      'CASH': 'Dinheiro'
    };
    
    return types[type] || type;
  }

  function getAccountTypeIcon(type: string) {
    switch (type) {
      case 'CHECKING':
        return <CreditCard size={16} className="text-blue-400" />;
      case 'SAVINGS':
        return <DollarSign size={16} className="text-green-400" />;
      case 'CREDIT_CARD':
        return <CreditCard size={16} className="text-purple-400" />;
      case 'INVESTMENT':
        return <DollarSign size={16} className="text-yellow-400" />;
      case 'CASH':
        return <DollarSign size={16} className="text-gray-400" />;
      default:
        return <CreditCard size={16} className="text-gray-400" />;
    }
  }

  // Filtrar contas
  const filteredAccounts = accounts.filter(account => {
    const typeMatch = !filterType || account.type === filterType;
    const statusMatch = !filterStatus || 
      (filterStatus === 'true' && account.isActive) ||
      (filterStatus === 'false' && !account.isActive);
    
    return typeMatch && statusMatch;
  });

  // Calcular totais
  const totalBalance = filteredAccounts
    .filter(acc => acc.isActive)
    .reduce((sum, acc) => sum + parseFloat(acc.balance), 0);

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Financeiro' },
        { label: 'Contas' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Contas Financeiras</h1>
        <Button 
          variant="accent" 
          onClick={() => showForm ? closeForm() : openNewForm()}
          className="flex items-center gap-2"
          disabled={formLoading}
        >
          <Plus size={16} />
          {showForm ? 'Cancelar' : 'Nova Conta'}
        </Button>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Tipo de Conta
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
            >
              <option value="">Todos os tipos</option>
              <option value="CHECKING">Conta Corrente</option>
              <option value="SAVINGS">Poupança</option>
              <option value="CREDIT_CARD">Cartão de Crédito</option>
              <option value="INVESTMENT">Investimento</option>
              <option value="CASH">Dinheiro</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
            >
              <option value="">Todos</option>
              <option value="true">Ativas</option>
              <option value="false">Inativas</option>
            </select>
          </div>

          <Button 
            variant="outline" 
            onClick={() => {
              setFilterType('');
              setFilterStatus('');
              fetchAccounts();
            }}
          >
            Limpar Filtros
          </Button>

          <div className="ml-auto text-right">
            <div className="text-sm text-gray-400">Saldo Total (Contas Ativas)</div>
            <div className="text-xl font-bold text-white">
              {formatCurrency(totalBalance)}
            </div>
          </div>
        </div>
      </Card>

      {/* Formulário Inline */}
      {showForm && (
        <Card className="mb-6 border-2 border-[#f59e0b]">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">
              {editingAccount ? `Editando: ${editingAccount.name}` : 'Nova Conta Financeira'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome da Conta"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                placeholder="Ex: Conta Corrente Banco ABC, Cartão Visa..."
                disabled={formLoading}
              />
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Tipo de Conta
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value as Account['type']})}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  disabled={formLoading}
                >
                  <option value="CHECKING">Conta Corrente</option>
                  <option value="SAVINGS">Poupança</option>
                  <option value="CREDIT_CARD">Cartão de Crédito</option>
                  <option value="INVESTMENT">Investimento</option>
                  <option value="CASH">Dinheiro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {!editingAccount && (
                <Input
                  label="Saldo Inicial"
                  value={formData.initialBalance}
                  onChange={(e) => setFormData({...formData, initialBalance: e.target.value})}
                  placeholder="0,00"
                  disabled={formLoading}
                />
              )}
              
              <Input
                label="Número da Conta (opcional)"
                value={formData.accountNumber}
                onChange={(e) => setFormData({...formData, accountNumber: e.target.value})}
                placeholder="Ex: 12345-6"
                disabled={formLoading}
              />

              <Input
                label="Banco (opcional)"
                value={formData.bankName}
                onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                placeholder="Ex: Banco do Brasil"
                disabled={formLoading}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                className="w-4 h-4 text-[#f59e0b] bg-[#1e2126] border-gray-700 rounded focus:ring-[#f59e0b]"
                disabled={formLoading}
              />
              <label htmlFor="isActive" className="text-sm text-gray-300">
                Conta ativa
              </label>
            </div>

            <div className="flex gap-3">
              <Button 
                variant="accent" 
                onClick={handleSubmit}
                disabled={formLoading}
              >
                {formLoading 
                  ? 'Salvando...' 
                  : editingAccount 
                    ? 'Salvar Alterações' 
                    : 'Criar Conta'
                }
              </Button>
              <Button 
                variant="outline" 
                onClick={closeForm}
                disabled={formLoading}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Lista de Contas */}
      <Card>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded bg-[#1e2126]" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10">
            <div className="text-red-400 mb-4">{error}</div>
            <Button variant="outline" onClick={fetchAccounts}>
              Tentar Novamente
            </Button>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="text-center py-10">
            <CreditCard size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4">Nenhuma conta encontrada</p>
            <Button 
              variant="accent" 
              onClick={openNewForm}
              className="inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Criar Primeira Conta
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredAccounts.map((account) => (
              <div 
                key={account.id}
                className={`border border-gray-700 rounded-lg p-4 hover:bg-[#1a1f2b] transition-colors ${
                  editingAccount?.id === account.id 
                    ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30' 
                    : ''
                } ${!account.isActive ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2">
                      {getAccountTypeIcon(account.type)}
                      {!account.isActive && <EyeOff size={16} className="text-gray-500" />}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium text-white">{account.name}</h3>
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                          {getAccountTypeLabel(account.type)}
                        </span>
                        {!account.isActive && (
                          <span className="text-xs bg-red-900 text-red-300 px-2 py-1 rounded">
                            Inativa
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-4 mt-1">
                        <div className="text-sm text-gray-400">
                          {account.bankName && (
                            <span>{account.bankName}</span>
                          )}
                          {account.accountNumber && (
                            <span className="ml-2">• {account.accountNumber}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-xl font-bold ${
                        parseFloat(account.balance) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatCurrency(account.balance)}
                      </div>
                      <div className="text-xs text-gray-400">
                        Saldo atual
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-4">
                    <button
                      onClick={() => openBalanceModal(account)}
                      className="p-1 text-gray-300 hover:text-blue-400 transition-colors"
                      title="Ajustar Saldo"
                      disabled={formLoading}
                    >
                      <Settings size={16} />
                    </button>
                    <button
                      onClick={() => openEditForm(account)}
                      className="p-1 text-gray-300 hover:text-[#f59e0b] transition-colors"
                      title="Editar"
                      disabled={formLoading}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(account)}
                      className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                      title="Excluir"
                      disabled={formLoading}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal de Ajuste de Saldo */}
      {showBalanceModal && adjustingAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#151921] rounded-lg max-w-md w-full border border-gray-700">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-yellow-400" />
                <h3 className="text-lg font-medium text-white">
                  Ajustar Saldo da Conta
                </h3>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Conta: {adjustingAccount.name}
              </p>
              <p className="text-sm text-gray-400">
                Saldo atual: {formatCurrency(adjustingAccount.balance)}
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <Input
                label="Novo Saldo"
                value={balanceData.newBalance}
                onChange={(e) => setBalanceData({...balanceData, newBalance: e.target.value})}
                placeholder="0,00"
                required
                disabled={formLoading}
              />
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Motivo do Ajuste *
                </label>
                <textarea
                  value={balanceData.reason}
                  onChange={(e) => setBalanceData({...balanceData, reason: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  placeholder="Ex: Conciliação bancária, correção de lançamento..."
                  required
                  disabled={formLoading}
                />
              </div>
              
              <div className="bg-yellow-900/20 border border-yellow-600 rounded p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-yellow-400 mt-0.5" />
                  <div className="text-sm text-yellow-300">
                    <strong>Atenção:</strong> Esta operação criará uma transação de ajuste 
                    para manter o histórico e auditoria.
                  </div>
                </div>
              </div>
            </div>
            
            <div className="flex gap-3 p-6 border-t border-gray-700">
              <Button 
                variant="outline" 
                onClick={closeBalanceModal}
                className="flex-1"
                disabled={formLoading}
              >
                Cancelar
              </Button>
              <Button 
                variant="accent"
                onClick={handleBalanceAdjust}
                className="flex-1"
                disabled={formLoading}
              >
                {formLoading ? 'Ajustando...' : 'Ajustar Saldo'}
              </Button>
            </div>
          </div>
        </div>
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
    </DashboardLayout>
  );
}