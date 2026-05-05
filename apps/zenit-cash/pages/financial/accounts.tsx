import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
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
  AlertTriangle,
  CreditCard,
  Edit2,
  HelpCircle,
  MinusCircle,
  Plus,
  Save,
  Settings,
  Star,
  StarOff,
  Trash2,
  X
} from 'lucide-react';
import api from '@/lib/api';

type AccountType = 'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'CASH';

interface Account {
  id: number;
  name: string;
  type: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'INVESTMENT' | 'CASH';
  balance: string;
  accountNumber?: string;
  bankName?: string;
  isActive: boolean;
  isDefault: boolean;
  allowNegativeBalance: boolean;
}

function formatCurrency(value: string | number): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number.isNaN(numericValue) ? 0 : numericValue);
}

function formatBalance(balance: string, allowNegativeBalance: boolean): React.ReactNode {
  const numericBalance = parseFloat(balance);
  const isNegative = numericBalance < 0;

  let className = 'font-medium';
  if (isNegative) {
    className += allowNegativeBalance ? ' text-orange-400' : ' text-red-400';
  } else {
    className += ' text-green-400';
  }

  return (
    <span className={className}>
      {formatCurrency(numericBalance)}
      {isNegative && allowNegativeBalance && (
        <span className="ml-1 text-xs text-orange-300">(autorizado)</span>
      )}
    </span>
  );
}

function getAccountTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    CHECKING: 'Conta Corrente',
    SAVINGS: 'Poupanca',
    INVESTMENT: 'Investimento',
    CASH: 'Dinheiro'
  };

  return labels[type] || type;
}

function AccountsPageInner() {
  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [adjustingAccount, setAdjustingAccount] = useState<Account | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    type: 'CHECKING' as AccountType,
    initialBalance: '0.00',
    accountNumber: '',
    bankName: '',
    isActive: true,
    allowNegativeBalance: false
  });

  const [balanceData, setBalanceData] = useState({
    newBalance: '0.00',
    reason: ''
  });

  useEffect(() => {
    void fetchAccounts();
  }, [filterStatus, filterType]);

  async function fetchAccounts() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filterType) params.append('type', filterType);
      if (filterStatus) params.append('isActive', filterStatus);

      const response = await api.get(`/financial/accounts?${params}`);
      const nonCreditCardAccounts = (response.data || []).filter(
        (account: Account) => account.type !== 'CREDIT_CARD'
      );
      setAccounts(nonCreditCardAccounts);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Erro ao carregar contas';
      setError(errorMessage);
      addToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
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

  function openNewForm() {
    resetForm();
    setShowForm(true);
  }

  function openEditForm(account: Account) {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      type: account.type as AccountType,
      initialBalance: account.balance,
      accountNumber: account.accountNumber || '',
      bankName: account.bankName || '',
      isActive: account.isActive,
      allowNegativeBalance: account.allowNegativeBalance
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
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

  async function handleSetDefault(account: Account) {
    if (account.isDefault) {
      confirmation.confirm(
        {
          title: 'Remover Conta Padrao',
          message: `Tem certeza que deseja remover "${account.name}" como conta padrao?`,
          confirmText: 'Remover Padrao',
          cancelText: 'Cancelar',
          type: 'warning'
        },
        async () => {
          try {
            await api.delete(`/financial/accounts/${account.id}/set-default`);
            addToast('Conta padrao removida com sucesso', 'success');
            await fetchAccounts();
          } catch (error: any) {
            addToast(error.response?.data?.error || 'Erro ao remover conta padrao', 'error');
            throw error;
          }
        }
      );
      return;
    }

    const currentDefault = accounts.find((currentAccount) => currentAccount.isDefault);
    const message = currentDefault
      ? `Definir "${account.name}" como conta padrao? A conta "${currentDefault.name}" deixara de ser padrao.`
      : `Definir "${account.name}" como conta padrao da empresa?`;

    confirmation.confirm(
      {
        title: 'Definir Conta Padrao',
        message,
        confirmText: 'Definir como Padrao',
        cancelText: 'Cancelar',
        type: 'info'
      },
      async () => {
        try {
          await api.post(`/financial/accounts/${account.id}/set-default`);
          addToast('Conta definida como padrao com sucesso', 'success');
          await fetchAccounts();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao definir conta padrao', 'error');
          throw error;
        }
      }
    );
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      addToast('Nome da conta e obrigatorio', 'error');
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
        allowNegativeBalance: formData.allowNegativeBalance,
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
      await fetchAccounts();
    } catch (err: any) {
      const errorMessage = err.response?.data?.error;
      if (errorMessage?.includes('saldo negativo')) {
        addToast('Não é possível desabilitar saldo negativo. Esta conta tem saldo negativo.', 'error');
      } else {
        addToast(errorMessage || 'Erro ao salvar conta', 'error');
      }
    } finally {
      setFormLoading(false);
    }
  }

  async function handleBalanceAdjust() {
    if (!adjustingAccount || !balanceData.reason.trim()) {
      addToast('Motivo do ajuste e obrigatorio', 'error');
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
      await fetchAccounts();
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
        message: `Tem certeza que deseja excluir a conta "${account.name}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/accounts/${account.id}`);
          addToast('Conta excluida com sucesso', 'success');

          if (editingAccount?.id === account.id) {
            closeForm();
          }

          await fetchAccounts();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir conta', 'error');
          throw err;
        }
      }
    );
  }

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const typeMatches = !filterType || account.type === filterType;
      const statusMatches =
        !filterStatus ||
        (filterStatus === 'true' && account.isActive) ||
        (filterStatus === 'false' && !account.isActive);

      return typeMatches && statusMatches;
    });
  }, [accounts, filterStatus, filterType]);

  const totalBalance = useMemo(() => {
    return filteredAccounts
      .filter((account) => account.isActive)
      .reduce((sum, account) => sum + parseFloat(account.balance), 0);
  }, [filteredAccounts]);

  return (
    <DashboardLayout title="Contas Financeiras">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Contas' }
        ]}
      />

      <div className="mb-6 flex items-center justify-between">
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
              {formLoading ? 'Salvando...' : editingAccount ? 'Salvar Alteracoes' : 'Criar Conta'}
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Link href="/financial/credit-cards">
              <Button variant="outline" className="flex items-center gap-2">
                <CreditCard size={16} />
                Cartões e Faturas
              </Button>
            </Link>
            <Button
              variant="accent"
              onClick={openNewForm}
              className="flex items-center gap-2"
              disabled={formLoading}
            >
              <Plus size={16} />
              Nova Conta
            </Button>
          </div>
        )}
      </div>

      {!showForm && (
        <Card className="mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Tipo de Conta</label>
              <select
                value={filterType}
                onChange={(event) => setFilterType(event.target.value)}
                className="rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
              >
                <option value="">Todos os tipos</option>
                <option value="CHECKING">Conta Corrente</option>
                <option value="SAVINGS">Poupanca</option>
                <option value="INVESTMENT">Investimento</option>
                <option value="CASH">Dinheiro</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">Status</label>
              <select
                value={filterStatus}
                onChange={(event) => setFilterStatus(event.target.value)}
                className="rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
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
              <div className="text-xl font-bold text-white">{formatCurrency(totalBalance)}</div>
            </div>
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6 border-2 border-[#2563eb]">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">
              {editingAccount ? `Editando: ${editingAccount.name}` : 'Nova Conta Financeira'}
            </h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Nome da Conta"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                required
                placeholder="Ex: Conta Corrente Banco ABC"
                disabled={formLoading}
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Tipo de Conta</label>
                <select
                  value={formData.type}
                  onChange={(event) =>
                    setFormData({ ...formData, type: event.target.value as AccountType })
                  }
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  disabled={formLoading}
                >
                  <option value="CHECKING">Conta Corrente</option>
                  <option value="SAVINGS">Poupanca</option>
                  <option value="INVESTMENT">Investimento</option>
                  <option value="CASH">Dinheiro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {!editingAccount && (
                <CurrencyInput
                  label="Saldo Inicial"
                  value={formData.initialBalance}
                  onChange={(value) => setFormData({ ...formData, initialBalance: value })}
                  disabled={formLoading}
                />
              )}

              <Input
                label="Numero da Conta (opcional)"
                value={formData.accountNumber}
                onChange={(event) => setFormData({ ...formData, accountNumber: event.target.value })}
                placeholder="Ex: 12345-6"
                disabled={formLoading}
              />

              <Input
                label="Banco (opcional)"
                value={formData.bankName}
                onChange={(event) => setFormData({ ...formData, bankName: event.target.value })}
                placeholder="Ex: Banco do Brasil"
                disabled={formLoading}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })}
                  className="h-4 w-4 rounded border-gray-700 bg-[#1e2126] text-accent focus:ring-accent"
                  disabled={formLoading}
                />
                <label htmlFor="isActive" className="text-sm text-gray-300">
                  Conta ativa
                </label>
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="allowNegativeBalance"
                  checked={formData.allowNegativeBalance}
                  onChange={(event) =>
                    setFormData({ ...formData, allowNegativeBalance: event.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-[#1e2126] text-accent focus:ring-accent"
                  disabled={formLoading}
                />
                <div className="flex-1">
                  <label htmlFor="allowNegativeBalance" className="cursor-pointer text-sm text-gray-300">
                    Permitir saldo negativo
                  </label>
                  <div className="mt-1 flex items-center gap-1">
                    <HelpCircle size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-400">
                      Permite que a conta fique negativa, como em cheque especial.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 border-t border-gray-700 pt-6">
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
                {formLoading ? 'Salvando...' : editingAccount ? 'Salvar Alteracoes' : 'Criar Conta'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded bg-[#1e2126]" />
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <div className="mb-4 text-red-400">{error}</div>
            <Button variant="outline" onClick={() => void fetchAccounts()}>
              Tentar Novamente
            </Button>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="py-10 text-center">
            <CreditCard size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="mb-4 text-gray-400">Nenhuma conta encontrada</p>
            <Button variant="accent" onClick={openNewForm} className="inline-flex items-center gap-2">
              <Plus size={16} />
              Criar Primeira Conta
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                <tr>
                  <th className="w-24 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3 text-left">Conta</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Banco / Numero</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3 text-center">Configuracoes</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account) => (
                  <tr
                    key={account.id}
                    className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${
                      editingAccount?.id === account.id ? 'border-[#2563eb]/30 bg-[#2563eb]/10' : ''
                    } ${!account.isActive ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => void handleSetDefault(account)}
                          className={`p-1 transition-colors ${
                            account.isDefault
                              ? 'text-yellow-400 hover:text-yellow-300'
                              : 'text-gray-300 hover:text-yellow-400'
                          }`}
                          title={account.isDefault ? 'Remover como padrao' : 'Definir como padrao'}
                          disabled={formLoading || !account.isActive}
                        >
                          {account.isDefault ? <Star size={16} className="fill-current" /> : <StarOff size={16} />}
                        </button>
                        <button
                          onClick={() => openBalanceModal(account)}
                          className="p-1 text-gray-300 transition-colors hover:text-blue-400"
                          title="Ajustar saldo"
                          disabled={formLoading}
                        >
                          <Settings size={16} />
                        </button>
                        <button
                          onClick={() => openEditForm(account)}
                          className="p-1 text-gray-300 transition-colors hover:text-[#2563eb]"
                          title="Editar"
                          disabled={formLoading}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => void handleDelete(account)}
                          className="p-1 text-gray-300 transition-colors hover:text-red-400"
                          title="Excluir"
                          disabled={formLoading}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-white">
                        {account.name}
                        {account.isDefault && (
                          <Star size={12} className="ml-2 inline fill-current text-yellow-400" />
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-gray-300">{getAccountTypeLabel(account.type)}</td>

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

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {account.allowNegativeBalance && (
                          <div
                            className="flex items-center gap-1 rounded border border-blue-600 bg-blue-900/30 px-2 py-1 text-blue-300"
                            title="Permite saldo negativo"
                          >
                            <MinusCircle size={12} />
                            <span className="text-xs">Negativo OK</span>
                          </div>
                        )}
                        {parseFloat(account.balance) < 0 && !account.allowNegativeBalance && (
                          <div
                            className="flex items-center gap-1 rounded border border-red-600 bg-red-900/30 px-2 py-1 text-red-300"
                            title="Saldo negativo nao autorizado"
                          >
                            <AlertTriangle size={12} />
                            <span className="text-xs">Problema</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          account.isActive ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'
                        }`}
                      >
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

      {showBalanceModal && adjustingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-gray-700 bg-[#151921]">
            <div className="border-b border-gray-700 p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-yellow-400" />
                <h3 className="text-lg font-medium text-white">Ajustar Saldo da Conta</h3>
              </div>
              <p className="mt-2 text-sm text-gray-400">Conta: {adjustingAccount.name}</p>
              <p className="text-sm text-gray-400">Saldo atual: {formatCurrency(adjustingAccount.balance)}</p>
            </div>

            <div className="space-y-4 p-6">
              <CurrencyInput
                label="Novo Saldo"
                value={balanceData.newBalance}
                onChange={(value) => setBalanceData({ ...balanceData, newBalance: value })}
                required
                disabled={formLoading}
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Motivo do Ajuste *</label>
                <textarea
                  value={balanceData.reason}
                  onChange={(event) => setBalanceData({ ...balanceData, reason: event.target.value })}
                  rows={3}
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  placeholder="Ex: conciliacao bancaria"
                  required
                  disabled={formLoading}
                />
              </div>

              <div className="rounded border border-yellow-600 bg-yellow-900/20 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 text-yellow-400" />
                  <div className="text-sm text-yellow-300">
                    <strong>Atenção:</strong> esta operação cria uma transação de ajuste para manter o histórico.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 border-t border-gray-700 p-6">
              <Button
                type="button"
                variant="outline"
                onClick={closeBalanceModal}
                className="flex items-center gap-2"
                disabled={formLoading}
              >
                <X size={16} />
                Cancelar
              </Button>
              <Button
                variant="accent"
                onClick={() => void handleBalanceAdjust()}
                className="flex items-center gap-2"
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
