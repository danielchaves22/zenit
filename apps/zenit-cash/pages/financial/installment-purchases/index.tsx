import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
  Receipt
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import {
  formatCalendarDate,
  getTransactionDisplayStatus,
  getTransactionDisplayStatusClasses,
  getTransactionDisplayStatusLabel
} from '@/utils/financialStatus';

type PlanStatus = 'IN_PROGRESS' | 'OVERDUE' | 'COMPLETED' | 'CANCELED';

interface InstallmentItem {
  id: number;
  installmentNumber: number;
  totalInstallments: number;
  amount: string;
  dueDate: string | null;
  effectiveDate: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELED';
  archivedAt: string | null;
}

interface InstallmentPlan {
  id: string;
  description: string;
  purchaseDate: string;
  firstDueDate: string;
  totalAmount: string;
  installmentCount: number;
  paidInstallmentCount: number;
  pendingInstallmentCount: number;
  canceledInstallmentCount: number;
  paidAmount: string;
  remainingAmount: string;
  nextDueDate: string | null;
  lastDueDate: string | null;
  status: PlanStatus;
  account: { id: number; name: string } | null;
  category: {
    id: number;
    name: string;
    color: string;
    icon?: string | null;
  } | null;
  installments: InstallmentItem[];
}

const PLAN_STATUS: Record<PlanStatus, { label: string; classes: string }> = {
  IN_PROGRESS: {
    label: 'Em andamento',
    classes: 'bg-blue-900 text-blue-200'
  },
  OVERDUE: {
    label: 'Atrasada',
    classes: 'bg-red-900 text-red-200'
  },
  COMPLETED: {
    label: 'Quitada',
    classes: 'bg-green-900 text-green-200'
  },
  CANCELED: {
    label: 'Cancelada',
    classes: 'bg-gray-700 text-gray-300'
  }
};

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function getInstallmentStatus(installment: InstallmentItem) {
  if (installment.archivedAt) {
    return {
      label: 'Ignorada',
      classes: 'bg-amber-900 text-amber-200'
    };
  }

  const displayStatus = getTransactionDisplayStatus({
    status: installment.status,
    dueDate: installment.dueDate
  });

  return {
    label: getTransactionDisplayStatusLabel(displayStatus.status),
    classes: getTransactionDisplayStatusClasses(displayStatus.status)
  };
}

function InstallmentPurchasesPageInner() {
  const { addToast } = useToast();
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlanIds, setExpandedPlanIds] = useState<string[]>([]);

  const activeRemainingAmount = useMemo(
    () =>
      plans.reduce(
        (total, plan) => total + Number(plan.remainingAmount || 0),
        0
      ),
    [plans]
  );

  useEffect(() => {
    void fetchPlans();
  }, []);

  async function fetchPlans() {
    setLoading(true);

    try {
      const response = await api.get('/financial/installment-purchases');
      const nextPlans = response.data || [];
      setPlans(nextPlans);
      setExpandedPlanIds((previous) =>
        previous.filter((planId) => nextPlans.some((plan: InstallmentPlan) => plan.id === planId))
      );
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar compras parceladas', 'error');
    } finally {
      setLoading(false);
    }
  }

  function togglePlan(planId: string) {
    setExpandedPlanIds((previous) =>
      previous.includes(planId)
        ? previous.filter((value) => value !== planId)
        : [...previous, planId]
    );
  }

  return (
    <DashboardLayout title="Compras Parceladas">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Financeiro' },
          { label: 'Compras Parceladas' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Compras Parceladas</h1>
          <p className="mt-1 text-sm text-gray-400">
            Compromissos parcelados pagos fora do cartão de crédito.
          </p>
        </div>
        <Link
          href={`/financial/transactions/new?type=EXPENSE&locked=true&installment=true&returnTo=${encodeURIComponent('/financial/installment-purchases')}`}
        >
          <Button variant="accent" className="flex items-center gap-2">
            <Plus size={16} />
            Nova Compra Parcelada
          </Button>
        </Link>
      </div>

      {!loading && plans.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <div className="text-xs uppercase tracking-wide text-gray-400">Compras cadastradas</div>
            <div className="mt-2 text-2xl font-semibold text-white">{plans.length}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-wide text-gray-400">Saldo parcelado restante</div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {formatCurrency(activeRemainingAmount)}
            </div>
          </Card>
        </div>
      )}

      {loading ? (
        <Card>
          <div className="py-12 text-center text-gray-400">Carregando compras parceladas...</div>
        </Card>
      ) : plans.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Receipt size={42} className="mx-auto mb-3 text-gray-500" />
            <p className="mb-4 text-gray-400">Nenhuma compra parcelada cadastrada</p>
            <Link
              href={`/financial/transactions/new?type=EXPENSE&locked=true&installment=true&returnTo=${encodeURIComponent('/financial/installment-purchases')}`}
            >
              <Button variant="accent" className="inline-flex items-center gap-2">
                <Plus size={16} />
                Cadastrar primeira compra
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => {
            const expanded = expandedPlanIds.includes(plan.id);
            const status = PLAN_STATUS[plan.status];

            return (
              <Card key={plan.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => togglePlan(plan.id)}
                  className="flex w-full flex-col gap-4 text-left lg:flex-row lg:items-center lg:justify-between"
                  aria-expanded={expanded}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-1 text-gray-400">
                      {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-lg font-semibold text-white">{plan.description}</h2>
                        <span className="rounded-full bg-violet-900 px-2 py-0.5 text-[10px] uppercase text-violet-200">
                          Parcelada
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${status.classes}`}>
                          {status.label}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-gray-400">
                        {plan.installmentCount} parcelas · total {formatCurrency(plan.totalAmount)}
                        {plan.account ? ` · ${plan.account.name}` : ''}
                        {plan.category ? ` · ${plan.category.name}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 pl-8 text-sm lg:min-w-[500px] lg:pl-0">
                    <div>
                      <div className="text-xs uppercase text-gray-500">Progresso</div>
                      <div className="mt-1 text-white">
                        {plan.paidInstallmentCount} pagas · {plan.pendingInstallmentCount} restantes
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-500">Saldo restante</div>
                      <div className="mt-1 text-white">{formatCurrency(plan.remainingAmount)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-500">Próxima parcela</div>
                      <div className="mt-1 text-gray-300">
                        {plan.nextDueDate ? formatCalendarDate(plan.nextDueDate) : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-500">Término</div>
                      <div className="mt-1 text-gray-300">
                        {plan.lastDueDate ? formatCalendarDate(plan.lastDueDate) : '-'}
                      </div>
                    </div>
                  </div>
                </button>

                {expanded && (
                  <div className="mt-5 overflow-x-auto border-t border-gray-700 pt-5">
                    <table className="w-full">
                      <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Parcela</th>
                          <th className="px-3 py-2 text-left">Vencimento</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                          <th className="px-3 py-2 text-left">Situação</th>
                          <th className="px-3 py-2 text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.installments.map((installment) => {
                          const installmentStatus = getInstallmentStatus(installment);

                          return (
                            <tr key={installment.id} className="border-t border-gray-700 text-sm text-gray-300">
                              <td className="px-3 py-3">
                                {installment.installmentNumber} de {installment.totalInstallments}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-2">
                                  <CalendarDays size={14} className="text-gray-500" />
                                  {installment.dueDate ? formatCalendarDate(installment.dueDate) : '-'}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right text-white">
                                {formatCurrency(installment.amount)}
                              </td>
                              <td className="px-3 py-3">
                                <span className={`rounded-full px-2 py-1 text-xs ${installmentStatus.classes}`}>
                                  {installmentStatus.label}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <Link
                                  href={`/financial/transactions/${installment.id}?returnTo=${encodeURIComponent('/financial/installment-purchases')}`}
                                  className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
                                >
                                  Abrir
                                  <ExternalLink size={12} />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}

export default function InstallmentPurchasesPage() {
  return (
    <PageGuard requiredPermission="FINANCIAL_ACCOUNTS">
      <InstallmentPurchasesPageInner />
    </PageGuard>
  );
}
