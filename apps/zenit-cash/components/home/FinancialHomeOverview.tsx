import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  Receipt,
  Repeat,
  Wallet
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatAccountDisplayName, getAccountTypeLabel } from '@/utils/accounts';
import {
  getAvailableCreditLimit,
  getInvoiceDisplayStatus,
  getInvoiceDisplayStatusClasses,
  getInvoiceDisplayStatusLabel,
  getInvoiceReferenceLabel,
  getUsedCreditLimit
} from '@/utils/creditCards';
import { formatCalendarDate } from '@/utils/financialStatus';

interface Account {
  id: number;
  name: string;
  type: 'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'CASH' | 'CREDIT_CARD';
  balance: string;
  accountNumber?: string | null;
  bankName?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
}

interface CreditCardInvoiceSummary {
  id: number;
  referenceYear: number;
  referenceMonth: number;
  dueDate?: string | null;
  totalAmount: string;
  status: string;
}

interface CreditCardAccount {
  id: number;
  name: string;
  type: 'CREDIT_CARD';
  balance: string;
  bankName?: string | null;
  creditLimit?: string | null;
  isActive?: boolean;
  nextInvoice?: CreditCardInvoiceSummary | null;
}

type FixedTransactionType = 'INCOME' | 'EXPENSE';

interface FixedTransaction {
  id: number;
  description: string;
  amount: string;
  type: FixedTransactionType;
  nextDueDate: string;
  dayOfMonth: number | null;
  fromAccount?: { id: number; name: string; type?: string } | null;
  toAccount?: { id: number; name: string; type?: string } | null;
}

interface FinancialHomeOverviewProps {
  showBalances: boolean;
  onToggleBalances: () => void;
}

interface SectionErrors {
  accounts?: string;
  cards?: string;
  fixedTransactions?: string;
}

function formatCurrency(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function formatMoneyValue(value: string | number, showBalances: boolean): string {
  return showBalances ? formatCurrency(value) : 'R$ ••••••';
}

export default function FinancialHomeOverview({
  showBalances,
  onToggleBalances
}: FinancialHomeOverviewProps) {
  const { companyId } = useAuth();
  const { canManageFinancialAccounts } = usePermissions();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cards, setCards] = useState<CreditCardAccount[]>([]);
  const [fixedTransactions, setFixedTransactions] = useState<FixedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<SectionErrors>({});

  const canViewAccountsAndCards = canManageFinancialAccounts();

  useEffect(() => {
    void fetchOverviewData();
  }, [canViewAccountsAndCards, companyId]);

  async function fetchOverviewData() {
    setLoading(true);

    const nextErrors: SectionErrors = {};

    const accountRequest = canViewAccountsAndCards
      ? api.get('/financial/accounts')
      : Promise.resolve({ data: [] });
    const cardRequest = canViewAccountsAndCards
      ? api.get('/financial/credit-cards')
      : Promise.resolve({ data: [] });
    const fixedTransactionsRequest = api.get('/financial/fixed-transactions');

    const [accountsResult, cardsResult, fixedTransactionsResult] = await Promise.allSettled([
      accountRequest,
      cardRequest,
      fixedTransactionsRequest
    ]);

    if (accountsResult.status === 'fulfilled') {
      const nextAccounts = (accountsResult.value.data || []).filter(
        (account: Account) => account.type !== 'CREDIT_CARD'
      );
      setAccounts(nextAccounts);
    } else {
      nextErrors.accounts =
        (accountsResult.reason as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Nao foi possivel carregar as contas.';
      setAccounts([]);
    }

    if (cardsResult.status === 'fulfilled') {
      setCards(cardsResult.value.data || []);
    } else {
      nextErrors.cards =
        (cardsResult.reason as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || 'Nao foi possivel carregar os cartoes.';
      setCards([]);
    }

    if (fixedTransactionsResult.status === 'fulfilled') {
      setFixedTransactions(fixedTransactionsResult.value.data || []);
    } else {
      nextErrors.fixedTransactions =
        (fixedTransactionsResult.reason as { response?: { data?: { error?: string } } })?.response
          ?.data?.error || 'Nao foi possivel carregar as transacoes fixas.';
      setFixedTransactions([]);
    }

    setErrors(nextErrors);
    setLoading(false);
  }

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.isActive !== false),
    [accounts]
  );

  const visibleAccounts = useMemo(() => {
    return [...activeAccounts].sort((left, right) => {
      if (Boolean(left.isDefault) !== Boolean(right.isDefault)) {
        return left.isDefault ? -1 : 1;
      }

      return Number(right.balance || 0) - Number(left.balance || 0);
    });
  }, [activeAccounts]);

  const activeCards = useMemo(() => cards.filter((card) => card.isActive !== false), [cards]);

  const totalAccountsBalance = useMemo(() => {
    return activeAccounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  }, [activeAccounts]);

  const fixedIncomeTotal = useMemo(() => {
    return fixedTransactions
      .filter((item) => item.type === 'INCOME')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [fixedTransactions]);

  const fixedExpenseTotal = useMemo(() => {
    return fixedTransactions
      .filter((item) => item.type === 'EXPENSE')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  }, [fixedTransactions]);

  const fixedNetBalance = fixedIncomeTotal - fixedExpenseTotal;

  const availableCreditTotals = useMemo(() => {
    let totalAvailable = 0;
    let hasConfiguredLimit = false;

    activeCards.forEach((card) => {
      const available = getAvailableCreditLimit(card);
      if (available !== null) {
        hasConfiguredLimit = true;
        totalAvailable += available;
      }
    });

    return {
      totalAvailable,
      hasConfiguredLimit
    };
  }, [activeCards]);

  const nextInvoice = useMemo(() => {
    return activeCards
      .filter((card) => card.nextInvoice)
      .sort((left, right) => {
        const leftDate = left.nextInvoice?.dueDate
          ? new Date(left.nextInvoice.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightDate = right.nextInvoice?.dueDate
          ? new Date(right.nextInvoice.dueDate).getTime()
          : Number.MAX_SAFE_INTEGER;

        return leftDate - rightDate;
      })[0] || null;
  }, [activeCards]);

  const upcomingFixedTransactions = useMemo(() => {
    return [...fixedTransactions]
      .sort((left, right) => {
        return new Date(left.nextDueDate).getTime() - new Date(right.nextDueDate).getTime();
      })
      .slice(0, 5);
  }, [fixedTransactions]);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-accent/10 via-transparent to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm uppercase tracking-[0.22em] text-accent/90">
              <Landmark size={16} />
              Resumo das contas e cartoes
            </div>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Saldo, recorrencias e atalho direto para a operacao do dia.
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              Acompanhe contas, cartoes e compromissos mensais sem sair da tela inicial.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleBalances}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-[#11161f] px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-accent hover:text-accent"
              aria-pressed={!showBalances}
            >
              {showBalances ? <EyeOff size={16} /> : <Eye size={16} />}
              {showBalances ? 'Ocultar valores' : 'Mostrar valores'}
            </button>

            <Link href="/financial/dashboard">
              <Button variant="outline" className="inline-flex items-center gap-2">
                Dashboard completo
                <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          [...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))
        ) : (
          <>
            <Card className="border-emerald-900/50 bg-emerald-950/20">
              <div className="text-sm uppercase tracking-wide text-emerald-200/80">
                Saldo em contas
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {formatMoneyValue(totalAccountsBalance, showBalances)}
              </div>
              <div className="mt-2 text-sm text-emerald-100/75">
                {activeAccounts.length} conta{activeAccounts.length === 1 ? '' : 's'} ativa
                {activeAccounts.length === 1 ? '' : 's'}
              </div>
            </Card>

            <Card className="border-sky-900/50 bg-sky-950/20">
              <div className="text-sm uppercase tracking-wide text-sky-200/80">
                Receitas fixas / mes
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {formatMoneyValue(fixedIncomeTotal, showBalances)}
              </div>
              <div className="mt-2 text-sm text-sky-100/75">
                Entradas recorrentes previstas
              </div>
            </Card>

            <Card className="border-rose-900/50 bg-rose-950/20">
              <div className="text-sm uppercase tracking-wide text-rose-200/80">
                Despesas fixas / mes
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {formatMoneyValue(fixedExpenseTotal, showBalances)}
              </div>
              <div className="mt-2 text-sm text-rose-100/75">
                Saidas recorrentes previstas
              </div>
            </Card>

            <Card className="border-amber-900/50 bg-amber-950/20">
              <div className="text-sm uppercase tracking-wide text-amber-200/80">
                Limite disponivel
              </div>
              <div className="mt-3 text-2xl font-semibold text-white">
                {availableCreditTotals.hasConfiguredLimit
                  ? formatMoneyValue(availableCreditTotals.totalAvailable, showBalances)
                  : 'Nao configurado'}
              </div>
              <div className="mt-2 text-sm text-amber-100/75">
                Soma dos cartoes com limite definido
              </div>
            </Card>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-semibold text-white">
                <Wallet size={18} className="text-accent" />
                Contas financeiras
              </div>
              <p className="mt-1 text-sm text-gray-400">
                Cada linha leva para a listagem de transacoes filtrada pela conta.
              </p>
            </div>

            <Link href="/financial/accounts">
              <Button variant="outline" className="inline-flex items-center gap-2">
                Ver contas
                <ArrowRight size={14} />
              </Button>
            </Link>
          </div>

          {!canViewAccountsAndCards ? (
            <div className="mt-5 rounded-lg border border-gray-700 bg-[#11161f] p-4 text-sm text-gray-300">
              Sua permissao atual nao libera o resumo de contas e cartoes.
            </div>
          ) : loading ? (
            <div className="mt-5 space-y-3">
              {[...Array(4)].map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : errors.accounts ? (
            <div className="mt-5 rounded-lg border border-red-900/60 bg-red-950/25 p-4 text-sm text-red-200">
              {errors.accounts}
            </div>
          ) : visibleAccounts.length === 0 ? (
            <div className="mt-5 rounded-lg border border-gray-700 bg-[#11161f] p-4 text-sm text-gray-300">
              Nenhuma conta ativa encontrada.
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {visibleAccounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-xl border border-gray-700 bg-[#11161f] p-4 transition-colors hover:border-accent/70"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-semibold text-white">{account.name}</h4>
                        {account.isDefault && (
                          <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-accent">
                            Padrao
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-400">
                        {getAccountTypeLabel(account.type)}
                        {account.bankName ? ` - ${account.bankName}` : ''}
                        {account.accountNumber ? ` - ${account.accountNumber}` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-gray-500">Saldo</div>
                        <div
                          className={`text-lg font-semibold ${
                            Number(account.balance) >= 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {formatMoneyValue(account.balance, showBalances)}
                        </div>
                      </div>

                      <Link
                        href={`/financial/transactions?accountId=${account.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-accent hover:text-accent"
                      >
                        Ver transacoes
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold text-white">
                  <CreditCard size={18} className="text-accent" />
                  Cartoes e faturas
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Limite usado, disponivel e proxima fatura em um so lugar.
                </p>
              </div>

              <Link href="/financial/credit-cards">
                <Button variant="outline" className="inline-flex items-center gap-2">
                  Ver cartoes
                  <ArrowRight size={14} />
                </Button>
              </Link>
            </div>

            {!canViewAccountsAndCards ? (
              <div className="mt-5 rounded-lg border border-gray-700 bg-[#11161f] p-4 text-sm text-gray-300">
                O resumo de cartoes depende da permissao de contas financeiras.
              </div>
            ) : loading ? (
              <div className="mt-5 space-y-3">
                {[...Array(3)].map((_, index) => (
                  <Skeleton key={index} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : errors.cards ? (
              <div className="mt-5 rounded-lg border border-red-900/60 bg-red-950/25 p-4 text-sm text-red-200">
                {errors.cards}
              </div>
            ) : activeCards.length === 0 ? (
              <div className="mt-5 rounded-lg border border-gray-700 bg-[#11161f] p-4 text-sm text-gray-300">
                Nenhum cartao ativo encontrado.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {activeCards.map((card) => {
                  const nextInvoiceStatus = card.nextInvoice
                    ? getInvoiceDisplayStatus(card.nextInvoice.status, card.nextInvoice.dueDate)
                    : null;

                  return (
                    <div
                      key={card.id}
                      className="rounded-xl border border-gray-700 bg-[#11161f] p-4 transition-colors hover:border-accent/70"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-base font-semibold text-white">{card.name}</h4>
                          <div className="mt-1 text-sm text-gray-400">
                            {card.bankName || 'Cartao sem banco informado'}
                          </div>
                        </div>

                        {nextInvoiceStatus && (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${getInvoiceDisplayStatusClasses(nextInvoiceStatus)}`}
                          >
                            {getInvoiceDisplayStatusLabel(nextInvoiceStatus)}
                          </span>
                        )}
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            Limite usado
                          </div>
                          <div className="mt-1 text-sm font-semibold text-white">
                            {formatMoneyValue(getUsedCreditLimit(card), showBalances)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            Disponivel
                          </div>
                          <div className="mt-1 text-sm font-semibold text-white">
                            {getAvailableCreditLimit(card) === null
                              ? 'Nao configurado'
                              : formatMoneyValue(getAvailableCreditLimit(card) || 0, showBalances)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            Proxima fatura
                          </div>
                          <div className="mt-1 text-sm font-semibold text-white">
                            {card.nextInvoice
                              ? getInvoiceReferenceLabel(
                                  card.nextInvoice.referenceYear,
                                  card.nextInvoice.referenceMonth
                                )
                              : 'Sem fatura aberta'}
                          </div>
                          {card.nextInvoice?.dueDate && (
                            <div className="mt-1 text-xs text-gray-400">
                              Vence em {formatCalendarDate(card.nextInvoice.dueDate)}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link href={`/financial/credit-cards/${card.id}/invoices`}>
                          <Button variant="outline" className="inline-flex items-center gap-2">
                            Faturas
                            <ArrowRight size={14} />
                          </Button>
                        </Link>
                        <Link href={`/financial/credit-cards/purchases?cardId=${card.id}`}>
                          <Button variant="outline" className="inline-flex items-center gap-2">
                            Compras
                            <ArrowRight size={14} />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-lg font-semibold text-white">
                  <Repeat size={18} className="text-accent" />
                  Fixas do mes
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Receitas, despesas e a projecao recorrente mais proxima.
                </p>
              </div>

              <Link href="/financial/fixed-transactions">
                <Button variant="outline" className="inline-flex items-center gap-2">
                  Ver fixas
                  <ArrowRight size={14} />
                </Button>
              </Link>
            </div>

            {loading ? (
              <div className="mt-5 space-y-3">
                {[...Array(3)].map((_, index) => (
                  <Skeleton key={index} className="h-20 rounded-xl" />
                ))}
              </div>
            ) : errors.fixedTransactions ? (
              <div className="mt-5 rounded-lg border border-red-900/60 bg-red-950/25 p-4 text-sm text-red-200">
                {errors.fixedTransactions}
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-gray-700 bg-[#11161f] p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Receitas fixas
                    </div>
                    <div className="mt-2 text-lg font-semibold text-emerald-300">
                      {formatMoneyValue(fixedIncomeTotal, showBalances)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-700 bg-[#11161f] p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Despesas fixas
                    </div>
                    <div className="mt-2 text-lg font-semibold text-rose-300">
                      {formatMoneyValue(fixedExpenseTotal, showBalances)}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-700 bg-[#11161f] p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">
                      Saldo fixo previsto
                    </div>
                    <div
                      className={`mt-2 text-lg font-semibold ${
                        fixedNetBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {formatMoneyValue(fixedNetBalance, showBalances)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {upcomingFixedTransactions.length === 0 ? (
                    <div className="rounded-lg border border-gray-700 bg-[#11161f] p-4 text-sm text-gray-300">
                      Nenhuma transacao fixa ativa encontrada.
                    </div>
                  ) : (
                    upcomingFixedTransactions.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-3 rounded-xl border border-gray-700 bg-[#11161f] p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${
                                item.type === 'INCOME'
                                  ? 'bg-emerald-900/40 text-emerald-200'
                                  : 'bg-rose-900/40 text-rose-200'
                              }`}
                            >
                              {item.type === 'INCOME' ? 'Receita' : 'Despesa'}
                            </span>
                            <span className="text-sm text-gray-400">
                              {item.dayOfMonth ? `Dia ${item.dayOfMonth}` : 'Competencia variavel'}
                            </span>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-white">
                            {item.description}
                          </div>
                          <div className="mt-1 text-xs text-gray-400">
                            {formatAccountDisplayName(item.fromAccount || item.toAccount)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div
                            className={`text-base font-semibold ${
                              item.type === 'INCOME' ? 'text-emerald-300' : 'text-rose-300'
                            }`}
                          >
                            {formatMoneyValue(item.amount, showBalances)}
                          </div>
                          <div className="mt-1 text-xs text-gray-400">
                            Proximo em {formatCalendarDate(item.nextDueDate)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </Card>

          <Card className="border-gray-700/80 bg-[#11161f]">
            <div className="flex items-start gap-3">
              <Receipt size={18} className="mt-1 text-accent" />
              <div>
                <div className="text-base font-semibold text-white">Leitura rapida do momento</div>
                <div className="mt-2 text-sm text-gray-400">
                  {nextInvoice?.nextInvoice ? (
                    <>
                      A proxima fatura a vencer e de {nextInvoice.name}, referencia{' '}
                      {getInvoiceReferenceLabel(
                        nextInvoice.nextInvoice.referenceYear,
                        nextInvoice.nextInvoice.referenceMonth
                      )}
                      {nextInvoice.nextInvoice.dueDate
                        ? `, com vencimento em ${formatCalendarDate(nextInvoice.nextInvoice.dueDate)}.`
                        : '.'}
                    </>
                  ) : (
                    'Nenhuma fatura aberta apareceu nos cartoes ativos.'
                  )}
                </div>
                <div className="mt-2 text-sm text-gray-400">
                  O saldo fixo previsto para o mes esta{' '}
                  <span
                    className={fixedNetBalance >= 0 ? 'text-emerald-300' : 'text-rose-300'}
                  >
                    {fixedNetBalance >= 0 ? 'positivo' : 'negativo'}
                  </span>
                  , em {formatMoneyValue(fixedNetBalance, showBalances)}.
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
