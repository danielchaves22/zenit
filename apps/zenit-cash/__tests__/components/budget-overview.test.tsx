import { render, screen, waitFor } from '@testing-library/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetOverview } from '@/components/financial/budgets/BudgetOverview';

const {
  addToastMock,
  fetchBudgetsMock,
  getDashboardMock,
  getMonthlyMock,
  getProvisionsMock
} = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  fetchBudgetsMock: vi.fn(),
  getDashboardMock: vi.fn(),
  getMonthlyMock: vi.fn(),
  getProvisionsMock: vi.fn()
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
}));

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => (
    <button type="button" {...props}>
      {children}
    </button>
  )
}));

vi.mock('@/components/ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />
}));

vi.mock('@/lib/financial-dashboard', () => ({
  getFinancialDashboardMonthly: (...args: unknown[]) => getDashboardMock(...args)
}));

vi.mock('@/lib/monthly-category-budgets', () => ({
  getMonthlyCategoryBudget: (...args: unknown[]) => getMonthlyMock(...args)
}));

vi.mock('@/lib/financial-provisions', () => ({
  getFinancialProvisions: (...args: unknown[]) => getProvisionsMock(...args)
}));

vi.mock('@/utils/budgets', async () => {
  const actual = await vi.importActual<typeof import('@/utils/budgets')>('@/utils/budgets');
  return {
    ...actual,
    fetchBudgets: (...args: unknown[]) => fetchBudgetsMock(...args)
  };
});

const dashboard = {
  month: '2026-09',
  isCurrentMonth: true,
  period: { month: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30' },
  carryOver: { amount: '3000.00', source: 'CURRENT_BALANCE' as const },
  monthlyTotals: {
    incomeTotal: '8000.00',
    expenseTotal: '7600.00',
    committedExpenseTotal: '6600.00',
    variableProjectedExpenseTotal: '1000.00',
    provisionContributionTotal: '900.00'
  },
  currentMonthBreakdown: {
    income: { realized: '4000.00', remaining: '4000.00' },
    expense: {
      realizedCommitted: '3000.00',
      remainingCommitted: '3600.00',
      remainingVariableProjected: '1000.00'
    }
  },
  committedBreakdown: {
    income: {
      adHocMaterializedTotal: '0.00',
      fixedMaterializedTotal: '4000.00',
      fixedProjectedTotal: '4000.00'
    },
    expense: {
      adHocMaterializedTotal: '1000.00',
      fixedMaterializedTotal: '2000.00',
      fixedProjectedTotal: '2600.00',
      creditCardTotal: '1000.00'
    }
  },
  variableProjection: {
    total: '1000.00',
    categories: [
      {
        categoryId: 10,
        categoryName: 'Lazer',
        color: '#10b981',
        month: '2026-09',
        historicalAverage: '1000.00',
        committedInMonth: '0.00',
        remainingProjected: '1000.00'
      }
    ]
  },
  provisions: { total: '900.00', items: [] },
  projectedEndingBalance: '2500.00',
  categoryTotals: []
};

const monthly = {
  access: { canRead: true, canManage: true },
  month: '2026-09',
  statsAvailable: true,
  historicalMonthsUsed: 6,
  summary: {
    plannedAmount: '8000.00',
    realizedAmount: '3000.00',
    committedAmount: '3600.00',
    forecastAmount: '7600.00',
    remainingAmount: '1400.00',
    forecastVarianceAmount: '400.00',
    atRiskCount: 0,
    exceededCount: 0
  },
  items: [{ id: 1 }]
};

const availability = {
  timeZone: 'America/Sao_Paulo',
  businessDate: '2026-09-17T12:00:00.000Z',
  budgets: [
    {
      code: 'PRINCIPAL',
      status: 'ACTIVE',
      isPrimary: true,
      dailyBudgetCurrentCents: 12500,
      targetEndingBalanceCents: 200000,
      currentBalanceCents: 300000
    }
  ]
};

const provisions = {
  access: { canRead: true, canManage: true },
  summary: {
    activeCount: 2,
    fundedCount: 0,
    overdueCount: 0,
    expectedAmount: '12000.00',
    reservedAmount: '2500.00',
    remainingAmount: '9500.00',
    monthlyContributionAmount: '900.00'
  },
  items: []
};

describe('BudgetOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDashboardMock.mockResolvedValue(dashboard);
    fetchBudgetsMock.mockResolvedValue(availability);
    getMonthlyMock.mockResolvedValue(monthly);
    getProvisionsMock.mockResolvedValue(provisions);
  });

  it('presents a healthy month as a decision instead of a collection of reports', async () => {
    render(<BudgetOverview month="2026-09" />);

    expect(await screen.findByText('Mês sob controle')).toBeInTheDocument();
    expect(screen.getByText('A projeção mantém saldo positivo')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 2.500,00').length).toBeGreaterThan(0);
    expect(screen.getByText('Não desconta os aportes lógicos para provisões.')).toBeInTheDocument();
    expect(screen.queryByText('O que merece atenção')).not.toBeInTheDocument();
    expect(getDashboardMock).toHaveBeenCalledWith('2026-09');
  });

  it('highlights a monthly planning deviation while preserving the positive projection', async () => {
    getMonthlyMock.mockResolvedValue({
      ...monthly,
      summary: {
        ...monthly.summary,
        forecastAmount: '8300.00',
        forecastVarianceAmount: '-300.00',
        exceededCount: 1
      }
    });

    render(<BudgetOverview month="2026-09" />);

    expect(await screen.findByText('Atenção necessária')).toBeInTheDocument();
    expect(screen.getByText('Tendência acima do planejado')).toBeInTheDocument();
    expect(screen.getByText(/A projeção supera os limites em/)).toBeInTheDocument();
  });

  it('treats a negative ending balance as the critical decision signal', async () => {
    getDashboardMock.mockResolvedValue({
      ...dashboard,
      projectedEndingBalance: '-450.00'
    });

    render(<BudgetOverview month="2026-09" />);

    expect(await screen.findByText('Situação crítica')).toBeInTheDocument();
    expect(screen.getByText('O mês tende a terminar no negativo')).toBeInTheDocument();
    expect(screen.getByText(/para que a projeção termine em zero/)).toBeInTheDocument();
    expect(screen.getByText('Reequilibrar o mês')).toBeInTheDocument();
  });

  it('makes missing planning context explicit', async () => {
    fetchBudgetsMock.mockResolvedValue({ ...availability, budgets: [] });
    getMonthlyMock.mockResolvedValue({
      ...monthly,
      statsAvailable: false,
      historicalMonthsUsed: 0,
      items: []
    });
    getDashboardMock.mockResolvedValue({
      ...dashboard,
      variableProjection: { total: '0.00', categories: [] }
    });

    render(<BudgetOverview month="2026-09" />);

    expect(await screen.findByText('Base incompleta')).toBeInTheDocument();
    expect(screen.getByText('Mês ainda não planejado')).toBeInTheDocument();
    expect(screen.getByText('Gastos variáveis sem estimativa')).toBeInTheDocument();
    expect(screen.getByText('Plano de disponibilidade não configurado')).toBeInTheDocument();
  });

  it('keeps available sections visible when one request fails', async () => {
    getProvisionsMock.mockRejectedValue(new Error('provisions unavailable'));

    render(<BudgetOverview month="2026-09" />);

    expect(await screen.findByText('Base incompleta')).toBeInTheDocument();
    expect(screen.getByText('Provisões indisponíveis')).toBeInTheDocument();
    expect(screen.getByText('Receitas restantes')).toBeInTheDocument();
    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        'Parte da visão geral não pôde ser atualizada',
        'error'
      );
    });
  });
});
