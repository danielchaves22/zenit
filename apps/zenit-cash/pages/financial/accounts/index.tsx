import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
  MinusCircle,
  Plus,
  Settings,
  Star,
  StarOff,
  Trash2,
  X
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
  allowNegativeBalance: boolean;
}

function formatCurrency(value: string | number): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number.isNaN(numericValue) ? 0 : numericValue);
}

function parseMoneyInput(value: string): number {
  return Number(value.replace(/[^\d.-]/g, '') || 0);
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
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [adjustingAccount, setAdjustingAccount] = useState<Account | null>(null);
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

      const response = await api.get(`/financial/accounts?${params.toString()}`);
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
          } catch (requestError: any) {
            addToast(
              requestError.response?.data?.error || 'Erro ao remover conta padrao',
              'error'
            );
            throw requestError;
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
        } catch (requestError: any) {
          addToast(
            requestError.response?.data?.error || 'Erro ao definir conta padrao',
            'error'
          );
          throw requestError;
        }
      }
    );
  }

  async function handleBalanceAdjust() {
    if (!adjustingAccount) {
      return;
    }

    if (!balanceData.reason.trim()) {
      addToast('Motivo do ajuste e obrigatorio', 'error');
      return;
    }

    if (!balanceAdjustmentPreview.type || balanceAdjustmentPreview.amount === 0) {
      addToast('Informe um saldo diferente do atual para criar o ajuste', 'error');
      return;
    }

    setFormLoading(true);

    try {
      await api.post(`/financial/accounts/${adjustingAccount.id}/adjust-balance`, {
        newBalance: parseMoneyInput(balanceData.newBalance),
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
        title: 'Confirmar Exclusao',
        message: `Tem certeza que deseja excluir a conta "${account.name}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/accounts/${account.id}`);
          addToast('Conta excluida com sucesso', 'success');
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

  const balanceAdjustmentPreview = useMemo(() => {
    const currentBalance = Number(adjustingAccount?.balance || 0);
    const targetBalance = parseMoneyInput(balanceData.newBalance);
    const difference = targetBalance - currentBalance;

    return {
      currentBalance,
      targetBalance,
      difference,
      amount: Math.abs(difference),
      type: difference > 0 ? 'INCOME' : difference < 0 ? 'EXPENSE' : null
    } as const;
  }, [adjustingAccount?.balance, balanceData.newBalance]);

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
        <div className="flex gap-3">
          <Link href="/financial/credit-cards">
            <Button variant="outline" className="flex items-center gap-2">
              <CreditCard size={16} />
              Cartoes e Faturas
            </Button>
          </Link>
          <Link href="/financial/accounts/new">
            <Button variant="accent" className="flex items-center gap-2">
              <Plus size={16} />
              Nova Conta
            </Button>
          </Link>
        </div>
      </div>

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
            <Link href="/financial/accounts/new">
              <Button variant="accent" className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar Primeira Conta
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                <tr>
                  <th className="w-24 px-4 py-3 text-center">Acoes</th>
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
                      !account.isActive ? 'opacity-60' : ''
                    }`}
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
                          {account.isDefault ? (
                            <Star size={16} className="fill-current" />
                          ) : (
                            <StarOff size={16} />
                          )}
                        </button>
                        <button
                          onClick={() => openBalanceModal(account)}
                          className="p-1 text-gray-300 transition-colors hover:text-blue-400"
                          title="Ajustar saldo"
                          disabled={formLoading}
                        >
                          <Settings size={16} />
                        </button>
                        <Link
                          href={`/financial/accounts/${account.id}`}
                          className="p-1 text-gray-300 transition-colors hover:text-[#2563eb]"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </Link>
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
              <p className="text-sm text-gray-400">
                Saldo atual: {formatCurrency(adjustingAccount.balance)}
              </p>
            </div>

            <div className="space-y-4 p-6">
              <CurrencyInput
                label="Novo Saldo"
                value={balanceData.newBalance}
                onChange={(value) => setBalanceData((prev) => ({ ...prev, newBalance: value }))}
                required
                disabled={formLoading}
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Motivo do Ajuste *
                </label>
                <textarea
                  value={balanceData.reason}
                  onChange={(event) =>
                    setBalanceData((prev) => ({ ...prev, reason: event.target.value }))
                  }
                  rows={3}
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  placeholder="Ex: conciliacao bancaria"
                  required
                  disabled={formLoading}
                />
              </div>

              <div className="rounded border border-blue-600/40 bg-blue-900/20 p-3">
                <div className="text-sm font-medium text-blue-100">Previa do ajuste</div>
                <div className="mt-2 text-sm text-blue-100/90">
                  {balanceAdjustmentPreview.type === 'INCOME' &&
                    `Sera criada uma entrada de ${formatCurrency(balanceAdjustmentPreview.amount)}.`}
                  {balanceAdjustmentPreview.type === 'EXPENSE' &&
                    `Sera criada uma saida de ${formatCurrency(balanceAdjustmentPreview.amount)}.`}
                  {!balanceAdjustmentPreview.type &&
                    'O saldo informado ja coincide com o saldo atual da conta.'}
                </div>
              </div>

              <div className="rounded border border-yellow-600 bg-yellow-900/20 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 text-yellow-400" />
                  <div className="text-sm text-yellow-300">
                    <strong>Atencao:</strong> esta operacao cria uma transacao de ajuste para
                    manter o historico.
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
                disabled={
                  formLoading ||
                  !balanceData.reason.trim() ||
                  !balanceAdjustmentPreview.type
                }
              >
                Ajustar Saldo
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
