import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
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
  ChevronDown,
  CreditCard,
  Edit2,
  MinusCircle,
  Plus,
  Receipt,
  Scale,
  Settings,
  Star,
  StarOff,
  Trash2,
  X
} from 'lucide-react';
import api from '@/lib/api';
import BankLogo from '@/components/financial/BankLogo';
import { FinancialBankReference } from '@/utils/banks';

interface Account {
  id: number;
  name: string;
  type: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'INVESTMENT' | 'CASH';
  balance: string;
  accountNumber?: string;
  bankName?: string | null;
  bank?: FinancialBankReference | null;
  isActive: boolean;
  isDefault: boolean;
  allowNegativeBalance: boolean;
  purpose?: 'GENERAL' | 'BUDGET';
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
    className += allowNegativeBalance ? ' text-tone-orange' : ' text-tone-red';
  } else {
    className += ' text-tone-green';
  }

  return (
    <span className={className}>
      {formatCurrency(numericBalance)}
      {isNegative && allowNegativeBalance && (
        <span className="ml-1 text-xs text-tone-orange">(autorizado)</span>
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
  const router = useRouter();
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
  const [openTransactionMenuAccountId, setOpenTransactionMenuAccountId] = useState<number | null>(null);
  const [balanceData, setBalanceData] = useState({
    newBalance: '0.00',
    reason: ''
  });
  const transactionMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchAccounts();
  }, [filterStatus, filterType]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        transactionMenuRef.current &&
        !transactionMenuRef.current.contains(event.target as Node)
      ) {
        setOpenTransactionMenuAccountId(null);
      }
    };

    if (openTransactionMenuAccountId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openTransactionMenuAccountId]);

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

  function buildTransactionCreateHref(accountId: number, type: 'EXPENSE' | 'INCOME') {
    return {
      pathname: '/financial/transactions/new',
      query: {
        type,
        locked: 'true',
        accountId: String(accountId),
        returnTo: router.asPath
      }
    };
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
        <h1 className="text-2xl font-semibold text-text">Contas Financeiras</h1>
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
            <label className="mb-1 block text-sm font-medium text-text-muted">Tipo de Conta</label>
            <select
              value={filterType}
              onChange={(event) => setFilterType(event.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 text-text focus:border-accent focus:outline-none focus:ring"
            >
              <option value="">Todos os tipos</option>
              <option value="CHECKING">Conta Corrente</option>
              <option value="SAVINGS">Poupanca</option>
              <option value="INVESTMENT">Investimento</option>
              <option value="CASH">Dinheiro</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-text-muted">Status</label>
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 text-text focus:border-accent focus:outline-none focus:ring"
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
            <div className="text-sm text-text-muted">Saldo Total (Contas Ativas)</div>
            <div className="text-xl font-bold text-text">{formatCurrency(totalBalance)}</div>
          </div>
        </div>
      </Card>

      <Card className="overflow-visible">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded bg-background" />
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <div className="mb-4 text-tone-red">{error}</div>
            <Button variant="outline" onClick={() => void fetchAccounts()}>
              Tentar Novamente
            </Button>
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="py-10 text-center">
            <CreditCard size={48} className="mx-auto mb-4 text-text-muted" />
            <p className="mb-4 text-text-muted">Nenhuma conta encontrada</p>
            <Link href="/financial/accounts/new">
              <Button variant="accent" className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar Primeira Conta
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full">
              <thead className="bg-elevated text-xs uppercase text-text-muted">
                <tr>
                  <th className="w-40 px-4 py-3 text-center">Acoes</th>
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
                    className={`border-b border-border hover:bg-elevated ${
                      !account.isActive ? 'opacity-60' : ''
                    }`}
                  >
                    <td
                      className={`px-4 py-3 ${
                        openTransactionMenuAccountId === account.id ? 'relative z-30' : ''
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        <div
                          className="relative"
                          ref={openTransactionMenuAccountId === account.id ? transactionMenuRef : null}
                        >
                          <button
                            onClick={() =>
                              setOpenTransactionMenuAccountId((currentId) =>
                                currentId === account.id ? null : account.id
                              )
                            }
                            className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-text transition-colors hover:border-emerald-500 hover:text-tone-emerald disabled:cursor-not-allowed disabled:opacity-50"
                            title="Nova transacao nesta conta"
                            aria-haspopup="menu"
                            aria-expanded={openTransactionMenuAccountId === account.id}
                            disabled={formLoading || !account.isActive}
                          >
                            <Plus size={14} />
                            <ChevronDown size={12} />
                          </button>

                          {openTransactionMenuAccountId === account.id && (
                            <div className="absolute left-0 top-full z-50 mt-2 min-w-[160px] rounded-lg border border-border bg-surface p-1 shadow-2xl">
                              <Link
                                href={buildTransactionCreateHref(account.id, 'EXPENSE')}
                                className="block rounded px-3 py-2 text-sm text-text transition-colors hover:bg-elevated hover:text-tone-red"
                                onClick={() => setOpenTransactionMenuAccountId(null)}
                              >
                                Nova Despesa
                              </Link>
                              <Link
                                href={buildTransactionCreateHref(account.id, 'INCOME')}
                                className="block rounded px-3 py-2 text-sm text-text transition-colors hover:bg-elevated hover:text-tone-green"
                                onClick={() => setOpenTransactionMenuAccountId(null)}
                              >
                                Nova Receita
                              </Link>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => void handleSetDefault(account)}
                          className={`p-1 transition-colors ${
                            account.isDefault
                              ? 'text-tone-yellow hover:text-tone-yellow'
                              : 'text-text-muted hover:text-tone-yellow'
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
                          className="p-1 text-text-muted transition-colors hover:text-tone-blue"
                          title="Ajustar saldo"
                          disabled={formLoading}
                        >
                          <Settings size={16} />
                        </button>
                        <Link
                          href={{
                            pathname: '/financial/transactions',
                            query: { accountId: account.id }
                          }}
                          className="p-1 text-text-muted transition-colors hover:text-tone-emerald"
                          title="Ver transacoes da conta"
                        >
                          <Receipt size={16} />
                        </Link>
                        {['CHECKING', 'SAVINGS'].includes(account.type) && account.purpose !== 'BUDGET' && (
                          <Link
                            href={`/financial/accounts/${account.id}/reconciliation`}
                            className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-text hover:border-blue-500 hover:text-tone-blue"
                            title={`Conciliar ${account.name}`}
                          >
                            <Scale size={14} /> Conciliar
                          </Link>
                        )}
                        <Link
                          href={`/financial/accounts/${account.id}`}
                          className="p-1 text-text-muted transition-colors hover:text-accent"
                          title="Editar"
                        >
                          <Edit2 size={16} />
                        </Link>
                        <button
                          onClick={() => void handleDelete(account)}
                          className="p-1 text-text-muted transition-colors hover:text-tone-red"
                          title="Excluir"
                          disabled={formLoading}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <BankLogo bank={account.bank} bankName={account.bankName} size="sm" />
                        <div className="font-medium text-text">
                          {account.name}
                          {account.isDefault && (
                            <Star size={12} className="ml-2 inline fill-current text-tone-yellow" />
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-text-muted">{getAccountTypeLabel(account.type)}</td>

                    <td className="px-4 py-3 text-text-muted">
                      <div>
                        {(account.bank?.name || account.bankName) && <div>{account.bank?.name || account.bankName}</div>}
                        {account.accountNumber && (
                          <div className="text-xs text-text-subtle">{account.accountNumber}</div>
                        )}
                        {!account.bank?.name && !account.bankName && !account.accountNumber && '-'}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {formatBalance(account.balance, account.allowNegativeBalance)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {account.allowNegativeBalance && (
                          <div
                            className="flex items-center gap-1 rounded border border-blue-600 bg-tone-blue-soft px-2 py-1 text-tone-blue"
                            title="Permite saldo negativo"
                          >
                            <MinusCircle size={12} />
                            <span className="text-xs">Negativo OK</span>
                          </div>
                        )}
                        {parseFloat(account.balance) < 0 && !account.allowNegativeBalance && (
                          <div
                            className="flex items-center gap-1 rounded border border-red-600 bg-tone-red-soft px-2 py-1 text-tone-red"
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
                          account.isActive ? 'bg-tone-green-soft text-tone-green' : 'bg-tone-red-soft text-tone-red'
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
          <div className="w-full max-w-md rounded-lg border border-border bg-surface">
            <div className="border-b border-border p-6">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-tone-yellow" />
                <h3 className="text-lg font-medium text-text">Ajustar Saldo da Conta</h3>
              </div>
              <p className="mt-2 text-sm text-text-muted">Conta: {adjustingAccount.name}</p>
              <p className="text-sm text-text-muted">
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
                <label className="mb-1 block text-sm font-medium text-text-muted">
                  Motivo do Ajuste *
                </label>
                <textarea
                  value={balanceData.reason}
                  onChange={(event) =>
                    setBalanceData((prev) => ({ ...prev, reason: event.target.value }))
                  }
                  rows={3}
                  className="w-full rounded border border-border bg-background px-2 py-1.5 text-text focus:border-accent focus:outline-none focus:ring"
                  placeholder="Ex: conciliacao bancaria"
                  required
                  disabled={formLoading}
                />
              </div>

              <div className="rounded border border-blue-600/40 bg-tone-blue-soft p-3">
                <div className="text-sm font-medium text-tone-blue">Previa do ajuste</div>
                <div className="mt-2 text-sm text-tone-blue">
                  {balanceAdjustmentPreview.type === 'INCOME' &&
                    `Sera criada uma entrada de ${formatCurrency(balanceAdjustmentPreview.amount)}.`}
                  {balanceAdjustmentPreview.type === 'EXPENSE' &&
                    `Sera criada uma saida de ${formatCurrency(balanceAdjustmentPreview.amount)}.`}
                  {!balanceAdjustmentPreview.type &&
                    'O saldo informado ja coincide com o saldo atual da conta.'}
                </div>
              </div>

              <div className="rounded border border-yellow-600 bg-tone-yellow-soft p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 text-tone-yellow" />
                  <div className="text-sm text-tone-yellow">
                    <strong>Atencao:</strong> esta operacao cria uma transacao de ajuste para
                    manter o historico.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 border-t border-border p-6">
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
