// frontend/pages/financial/accounts.tsx - COM CAMPO allowNegativeBalance
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { PageGuard } from '@/components/ui/AccessGuard';
import {
  Plus, CreditCard, Edit2, Trash2, Settings,
  Star, StarOff, AlertTriangle, MinusCircle, HelpCircle,
  Save, X
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
  isDefault: boolean;
  allowNegativeBalance: boolean; // ✅ NOVO CAMPO
  createdAt: string;
  updatedAt: string;
}

function AccountsPageInner() {
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
    initialBalance: '0.00',
    accountNumber: '',
    bankName: '',
    isActive: true,
    allowNegativeBalance: false // ✅ NOVO CAMPO NO FORM
  });

  // Balance adjustment modal
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [adjustingAccount, setAdjustingAccount] = useState<Account | null>(null);
  const [balanceData, setBalanceData] = useState({
    newBalance: '0.00',
    reason: ''
  });

  useEffect(() => {
    fetchAccounts();
  }, [filterType, filterStatus]);

  // ✅ ATUALIZAR allowNegativeBalance QUANDO TIPO MUDA
  useEffect(() => {
    if (formData.type === 'CREDIT_CARD') {
      setFormData(prev => ({ ...prev, allowNegativeBalance: true }));
    }
  }, [formData.type]);

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

  async function handleSetDefault(account: Account) {
    if (account.isDefault) {
      // Se já é padrão, remover
      confirmation.confirm(
        {
          title: 'Remover Conta Padrão',
          message: `Tem certeza que deseja remover "${account.name}" como conta padrão?`,
          confirmText: 'Remover Padrão',
          cancelText: 'Cancelar',
          type: 'warning'
        },
        async () => {
          try {
            await api.delete(`/financial/accounts/${account.id}/set-default`);
            addToast('Conta padrão removida com sucesso', 'success');
            fetchAccounts();
          } catch (error: any) {
            addToast(error.response?.data?.error || 'Erro ao remover conta padrão', 'error');
            throw error;
          }
        }
      );
    } else {
      // Se não é padrão, definir como padrão
      const currentDefault = accounts.find(acc => acc.isDefault);
      const message = currentDefault 
        ? `Definir "${account.name}" como conta padrão? A conta "${currentDefault.name}" deixará de ser padrão.`
        : `Definir "${account.name}" como conta padrão da empresa?`;
        
      confirmation.confirm(
        {
          title: 'Definir Conta Padrão',
          message,
          confirmText: 'Definir como Padrão',
          cancelText: 'Cancelar',
          type: 'info'
        },
        async () => {
          try {
            await api.post(`/financial/accounts/${account.id}/set-default`);
            addToast('Conta definida como padrão com sucesso', 'success');
            fetchAccounts();
          } catch (error: any) {
            addToast(error.response?.data?.error || 'Erro ao definir conta padrão', 'error');
            throw error;
          }
        }
      );
    }
  }

  function openNewForm() {
    setEditingAccount(null);
    setFormData({
      name: '',
      type: 'CHECKING',
      initialBalance: '0.00',
      accountNumber: '',
      bankName: '',
      isActive: true,
      allowNegativeBalance: true // ✅ PADRÃO TRUE
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
      isActive: account.isActive,
      allowNegativeBalance: account.allowNegativeBalance // ✅ CARREGAR VALOR ATUAL
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingAccount(null);
    setFormData({
      name: '',
      type: 'CHECKING',
      initialBalance: '0.00',
      accountNumber: '',
      bankName: '',
      isActive: true,
      allowNegativeBalance: false
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
      newBalance: '0.00',
      reason: ''
    });
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      addToast('Nome da conta é obrigatório', 'error');
      return;
    }

    // ✅ VALIDAÇÃO: Cartão de crédito deve permitir negativo
    if (formData.type === 'CREDIT_CARD' && !formData.allowNegativeBalance) {
      addToast('Cartões de crédito devem permitir saldo negativo', 'error');
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
        allowNegativeBalance: formData.allowNegativeBalance, // ✅ INCLUIR NO PAYLOAD
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
      // ✅ TRATAMENTO DE ERROS ESPECÍFICOS
      const errorMsg = err.response?.data?.error;
      if (errorMsg?.includes('saldo negativo')) {
        addToast('Não é possível desabilitar saldo negativo. Esta conta tem saldo negativo.', 'error');
      } else if (errorMsg?.includes('Cartões de crédito')) {
        addToast('Cartões de crédito devem sempre permitir saldo negativo', 'error');
      } else {
        addToast(errorMsg || 'Erro ao salvar conta', 'error');
      }
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

  // ✅ FORMATAÇÃO DE SALDO COM INDICAÇÃO DE AUTORIZAÇÃO
  function formatBalance(balance: string, allowNegativeBalance: boolean): React.ReactNode {
    const num = parseFloat(balance);
    const isNegative = num < 0;
    
    let className = 'font-medium';
    if (isNegative) {
      className += allowNegativeBalance ? ' text-orange-400' : ' text-red-400';
    } else {
      className += ' text-green-400';
    }
    
    return (
      <span className={className}>
        {formatCurrency(num)}
        {isNegative && allowNegativeBalance && (
          <span className="text-xs ml-1 text-orange-300">(autorizado)</span>
        )}
      </span>
    );
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

  function getAccountTypeIcon(type: string) {
    switch (type) {
      case 'CHECKING':
        return <CreditCard size={16} className="text-blue-400" />;
      case 'SAVINGS':
        return <CreditCard size={16} className="text-green-400" />;
      case 'CREDIT_CARD':
        return <CreditCard size={16} className="text-purple-400" />;
      case 'INVESTMENT':
        return <CreditCard size={16} className="text-yellow-400" />;
      case 'CASH':
        return <CreditCard size={16} className="text-gray-400" />;
      default:
        return <CreditCard size={16} className="text-gray-400" />;
    }
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Financeiro' },
        { label: 'Contas' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Contas Financeiras</h1>
        {showForm ? (
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={closeForm}
              disabled={formLoading}
              className="flex items-center gap-2"
            >
              <X size={16} />
              Cancelar
            </Button>
            <Button
              variant="accent"
              onClick={handleSubmit}
              disabled={formLoading}
              className="flex items-center gap-2"
            >
              <Save size={16} />
              {formLoading
                ? 'Salvando...'
                : editingAccount
                  ? 'Salvar Alterações'
                  : 'Criar Conta'}
            </Button>
          </div>
        ) : (
          <Button
            variant="accent"
            onClick={openNewForm}
            className="flex items-center gap-2"
            disabled={formLoading}
          >
            <Plus size={16} />
            Nova Conta
          </Button>
        )}
      </div>

      {/* Filtros */}
      {!showForm && (
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
      )}

      {/* ✅ FORMULÁRIO COM CAMPO allowNegativeBalance */}
        {showForm && (
          <Card className="mb-6 border-2 border-[#2563eb]">
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
                <CurrencyInput
                  label="Saldo Inicial"
                  value={formData.initialBalance}
                  onChange={(value) => setFormData({...formData, initialBalance: value})}
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

            {/* ✅ SEÇÃO DE CONFIGURAÇÕES */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                  className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                  disabled={formLoading}
                />
                <label htmlFor="isActive" className="text-sm text-gray-300">
                  Conta ativa
                </label>
              </div>

              {/* ✅ NOVO CAMPO: Permitir Saldo Negativo */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="allowNegativeBalance"
                  checked={formData.allowNegativeBalance}
                  onChange={(e) => setFormData({...formData, allowNegativeBalance: e.target.checked})}
                  className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent mt-0.5"
                  disabled={formLoading || formData.type === 'CREDIT_CARD'}
                />
                <div className="flex-1">
                  <label htmlFor="allowNegativeBalance" className="text-sm text-gray-300 cursor-pointer">
                    Permitir saldo negativo
                  </label>
                  <div className="flex items-center gap-1 mt-1">
                    <HelpCircle size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-400">
                      {formData.type === 'CREDIT_CARD' 
                        ? 'Cartões de crédito sempre permitem saldo negativo'
                        : 'Permite que a conta fique com saldo negativo (ex: cheque especial)'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-6 border-t border-gray-700">
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
                disabled={formLoading}
                className="flex items-center gap-2"
              >
                <X size={16} />
                Cancelar
              </Button>
              <Button
                variant="accent"
                onClick={handleSubmit}
                disabled={formLoading}
                className="flex items-center gap-2"
              >
                <Save size={16} />
                {formLoading
                  ? 'Salvando...'
                  : editingAccount
                    ? 'Salvar Alterações'
                    : 'Criar Conta'
                }
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
              <Skeleton key={i} className="h-12 w-full rounded bg-[#1e2126]" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10">
            <div className="text-red-400 mb-4">{error}</div>
            <Button variant="outline" onClick={fetchAccounts}>
              Tentar Novamente
            </Button>
          </div>
        ) : accounts.length === 0 ? (
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-center w-24">Ações</th>
                  <th className="px-4 py-3 text-left">Conta</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Banco/Número</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-center">Configurações</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <tr 
                    key={account.id} 
                      className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${
                        editingAccount?.id === account.id
                          ? 'bg-[#2563eb]/10 border-[#2563eb]/30'
                          : ''
                      } ${!account.isActive ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={() => handleSetDefault(account)}
                          className={`p-1 transition-colors ${
                            account.isDefault 
                              ? 'text-yellow-400 hover:text-yellow-300' 
                              : 'text-gray-300 hover:text-yellow-400'
                          }`}
                          title={account.isDefault ? 'Remover como padrão' : 'Definir como padrão'}
                          disabled={formLoading || !account.isActive}
                        >
                          {account.isDefault ? (
                            <Star size={16} className="fill-current" />
                          ) : (
                            <StarOff size={16} />
                          )}
                        </button>
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
                          className="p-1 text-gray-300 hover:text-[#2563eb] transition-colors"
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
                    </td>
                    
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {getAccountTypeIcon(account.type)}
                        <div>
                          <div className="font-medium text-white flex items-center gap-2">
                            {account.name}
                            {account.isDefault && (
                              <Star size={12} className="text-yellow-400 fill-current" />
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-4 py-3 text-gray-300">
                      {getAccountTypeLabel(account.type)}
                    </td>
                    
                    <td className="px-4 py-3 text-gray-300">
                      <div>
                        {account.bankName && <div>{account.bankName}</div>}
                        {account.accountNumber && (
                          <div className="text-xs text-gray-500">{account.accountNumber}</div>
                        )}
                        {!account.bankName && !account.accountNumber && '-'}
                      </div>
                    </td>
                    
                    <td className="px-4 py-3 text-right">
                      {formatBalance(account.balance, account.allowNegativeBalance)}
                    </td>
                    
                    {/* ✅ NOVA COLUNA: Configurações */}
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {account.allowNegativeBalance && (
                          <div 
                            className="flex items-center gap-1 px-2 py-1 bg-blue-900/30 border border-blue-600 rounded text-blue-300"
                            title="Permite saldo negativo"
                          >
                            <MinusCircle size={12} />
                            <span className="text-xs">Negativo OK</span>
                          </div>
                        )}
                        
                        {/* ✅ AVISO: Saldo negativo não autorizado */}
                        {parseFloat(account.balance) < 0 && !account.allowNegativeBalance && (
                          <div 
                            className="flex items-center gap-1 px-2 py-1 bg-red-900/30 border border-red-600 rounded text-red-300"
                            title="Saldo negativo não autorizado"
                          >
                            <AlertTriangle size={12} />
                            <span className="text-xs">Problema</span>
                          </div>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                        account.isActive 
                          ? 'bg-green-900 text-green-300' 
                          : 'bg-red-900 text-red-300'
                      }`}>
                        {account.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal de Ajuste de Saldo - mantido igual */}
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
              <CurrencyInput
                label="Novo Saldo"
                value={balanceData.newBalance}
                onChange={(value) => setBalanceData({...balanceData, newBalance: value})}
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

            <div className="flex justify-end gap-4 p-6 border-t border-gray-700">
              <Button
                type="button"
                variant="outline"
                onClick={closeBalanceModal}
                className="flex-1 flex items-center gap-2"
                disabled={formLoading}
              >
                <X size={16} />
                Cancelar
              </Button>
              <Button
                variant="accent"
                onClick={handleBalanceAdjust}
                className="flex-1 flex items-center gap-2"
                disabled={formLoading}
              >
                <Save size={16} />
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

export default function AccountsPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <AccountsPageInner />
    </PageGuard>
  );
}