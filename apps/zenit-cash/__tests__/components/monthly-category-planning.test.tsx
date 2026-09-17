import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ButtonHTMLAttributes, ChangeEventHandler, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthlyCategoryPlanning } from '@/components/financial/budgets/MonthlyCategoryPlanning';

const {
  addToastMock,
  apiGetMock,
  createPlanMock,
  endRecurringMock,
  getPlanMock,
  replacePlanMock
} = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  apiGetMock: vi.fn(),
  createPlanMock: vi.fn(),
  endRecurringMock: vi.fn(),
  getPlanMock: vi.fn(),
  replacePlanMock: vi.fn()
}));

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGetMock }
}));

vi.mock('@/lib/monthly-category-budgets', () => ({
  createMonthlyCategoryBudget: (...args: unknown[]) => createPlanMock(...args),
  endRecurringMonthlyCategoryBudget: (...args: unknown[]) => endRecurringMock(...args),
  getMonthlyCategoryBudget: (...args: unknown[]) => getPlanMock(...args),
  replaceMonthlyCategoryBudget: (...args: unknown[]) => replacePlanMock(...args)
}));

vi.mock('@/components/financial/CategorySelect', () => ({
  default: ({
    label,
    categories,
    value,
    onChange
  }: {
    label: string;
    categories: Array<{ id: number; name: string }>;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Selecione</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </label>
  )
}));

vi.mock('@/components/ui/CurrencyInput', () => ({
  CurrencyInput: ({
    label,
    value,
    onChange,
    disabled
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
  }) => (
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  )
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />
}));

vi.mock('@/utils/categoryIcons', () => ({
  CategoryIcon: () => <span data-testid="category-icon" />
}));

function emptyPlan(month: string) {
  return {
    access: { canRead: true as const, canManage: true },
    month,
    statsAvailable: true,
    historicalMonthsUsed: 6,
    summary: {
      plannedAmount: '0.00',
      realizedAmount: '0.00',
      committedAmount: '0.00',
      forecastAmount: '0.00',
      remainingAmount: '0.00',
      forecastVarianceAmount: '0.00',
      atRiskCount: 0,
      exceededCount: 0
    },
    items: []
  };
}

function planWithFuel(
  month: string,
  limitAmount = '450.00',
  recurring = false
) {
  return {
    ...emptyPlan(month),
    summary: {
      ...emptyPlan(month).summary,
      plannedAmount: limitAmount,
      forecastAmount: '320.00',
      forecastVarianceAmount: String(Number(limitAmount) - 320)
    },
    items: [
      {
        id: 1,
        monthlyBudgetId: recurring ? null : 1,
        recurringBudgetId: recurring ? 20 : null,
        category: {
          id: 10,
          name: 'Combustível',
          color: '#f97316',
          icon: 'fuel',
          parentId: null
        },
        limitAmount,
        includeChildren: true,
        origin: recurring ? ('FIXED_MONTHLY' as const) : ('ONE_TIME' as const),
        baseLimitAmount: recurring ? limitAmount : null,
        recurrenceStartMonth: recurring ? month : null,
        realizedAmount: '120.00',
        committedAmount: '80.00',
        historicalAverageAmount: '320.00',
        forecastAmount: '320.00',
        remainingAmount: String(Number(limitAmount) - 200),
        forecastVarianceAmount: String(Number(limitAmount) - 320),
        status: 'ON_TRACK' as const
      }
    ]
  };
}

describe('MonthlyCategoryPlanning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Combustível',
          type: 'EXPENSE',
          color: '#f97316',
          icon: 'fuel',
          parentId: null,
          _count: { children: 0 }
        }
      ]
    });
  });

  it('creates a one-time category planning explicitly', async () => {
    const user = userEvent.setup();
    getPlanMock.mockResolvedValue(emptyPlan('2026-09'));
    createPlanMock.mockResolvedValue(planWithFuel('2026-09'));

    render(<MonthlyCategoryPlanning month="2026-09" />);

    await user.selectOptions(
      await screen.findByLabelText('Categoria ou grupo'),
      '10'
    );
    await user.clear(screen.getByLabelText('Limite mensal'));
    await user.type(screen.getByLabelText('Limite mensal'), '450.00');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(createPlanMock).toHaveBeenCalledWith({
        month: '2026-09',
        categoryId: 10,
        limitAmount: '450.00',
        includeChildren: true,
        kind: 'ONE_TIME'
      });
    });
  });

  it('creates a fixed planning starting in a selected future month', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    getPlanMock.mockImplementation((month: string) => Promise.resolve(emptyPlan(month)));
    createPlanMock.mockResolvedValue(planWithFuel('2026-10', '500.00', true));

    render(<MonthlyCategoryPlanning month="2026-09" onMonthChange={onMonthChange} />);

    await user.selectOptions(await screen.findByLabelText('Tipo'), 'FIXED_MONTHLY');
    await user.selectOptions(screen.getByLabelText('Começa em'), '2026-10');
    await waitFor(() => expect(getPlanMock).toHaveBeenCalledWith('2026-10', { planOnly: true }));
    await user.selectOptions(screen.getByLabelText('Categoria ou grupo'), '10');
    await user.clear(screen.getByLabelText('Limite mensal'));
    await user.type(screen.getByLabelText('Limite mensal'), '500.00');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => {
      expect(createPlanMock).toHaveBeenCalledWith({
        month: '2026-10',
        categoryId: 10,
        limitAmount: '500.00',
        includeChildren: true,
        kind: 'FIXED_MONTHLY'
      });
      expect(onMonthChange).toHaveBeenCalledWith('2026-10');
    });
  });

  it('lets a projected fixed planning change from the displayed month onward', async () => {
    const user = userEvent.setup();
    getPlanMock.mockResolvedValue(planWithFuel('2026-09', '500.00', true));
    replacePlanMock.mockResolvedValue(planWithFuel('2026-09', '600.00', true));

    render(<MonthlyCategoryPlanning month="2026-09" />);

    expect(await screen.findByText('Fixo mensal', { selector: 'span' })).toBeInTheDocument();
    const limitInputs = screen.getAllByLabelText('Limite mensal');
    await user.clear(limitInputs[1]);
    await user.type(limitInputs[1], '600.00');
    await user.selectOptions(
      screen.getByLabelText('Aplicar alteração'),
      'FROM_MONTH'
    );
    await user.click(screen.getByRole('button', { name: 'Salvar planejamento' }));

    await waitFor(() => {
      expect(replacePlanMock).toHaveBeenCalledWith({
        month: '2026-09',
        allocations: [
          {
            categoryId: 10,
            limitAmount: '600.00',
            includeChildren: true,
            recurringChangeScope: 'FROM_MONTH'
          }
        ]
      });
    });
  });

  it('copies the previous plan only into the draft until save', async () => {
    const user = userEvent.setup();
    getPlanMock
      .mockResolvedValueOnce(emptyPlan('2026-09'))
      .mockResolvedValueOnce(planWithFuel('2026-08', '400.00'));
    replacePlanMock.mockResolvedValue(planWithFuel('2026-09', '400.00'));

    render(<MonthlyCategoryPlanning month="2026-09" />);

    await user.click(await screen.findByRole('button', { name: 'Copiar mês anterior' }));

    expect(getPlanMock).toHaveBeenLastCalledWith('2026-08', { planOnly: true });
    expect(replacePlanMock).not.toHaveBeenCalled();
    expect(await screen.findByDisplayValue('400.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Salvar planejamento' }));
    await waitFor(() => expect(replacePlanMock).toHaveBeenCalledTimes(1));
  });

  it('loads a recommended scenario into the draft without saving it automatically', async () => {
    const user = userEvent.setup();
    const onConsumed = vi.fn();
    getPlanMock.mockResolvedValue(planWithFuel('2026-09', '500.00', true));
    replacePlanMock.mockResolvedValue(planWithFuel('2026-09', '420.00', true));

    render(
      <MonthlyCategoryPlanning
        month="2026-09"
        draftProposal={{
          id: 'snapshot-50-balanced',
          sourceSnapshotId: 50,
          sourceScenarioId: 'BALANCED',
          sourceScenarioLabel: 'Ajuste equilibrado',
          targetMonth: '2026-09',
          adjustments: [
            {
              categoryId: 10,
              categoryName: 'Combustível',
              suggestedMonthlyLimit: '420.00'
            }
          ]
        }}
        onDraftProposalConsumed={onConsumed}
      />
    );

    expect(await screen.findByText(/Ajuste equilibrado/)).toBeInTheDocument();
    expect(screen.getByText(/Nada foi salvo ainda/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('420.00')).toBeInTheDocument();
    expect(replacePlanMock).not.toHaveBeenCalled();
    expect(onConsumed).toHaveBeenCalledWith('snapshot-50-balanced');

    await user.click(screen.getByRole('button', { name: 'Salvar planejamento' }));
    await waitFor(() => {
      expect(replacePlanMock).toHaveBeenCalledWith({
        month: '2026-09',
        allocations: [
          {
            categoryId: 10,
            limitAmount: '420.00',
            includeChildren: true,
            recurringChangeScope: 'MONTH_ONLY'
          }
        ]
      });
    });
  });

  it('keeps the company plan visible without exposing management actions to read-only members', async () => {
    getPlanMock.mockResolvedValue({
      ...planWithFuel('2026-09'),
      access: { canRead: true, canManage: false }
    });

    render(<MonthlyCategoryPlanning month="2026-09" />);

    expect(
      await screen.findByText(/Somente gestores do workspace podem alterá-lo/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Combustível')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar planejamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Remover Combustível do planejamento')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Limite mensal')).toBeDisabled();
  });
});
