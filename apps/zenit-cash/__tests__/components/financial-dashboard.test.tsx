import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ButtonHTMLAttributes, ChangeEventHandler, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinancialDashboard from '@/components/financial/Dashboard';

const {
  addToastMock,
  apiGetMock,
  getHistoryMock,
  getMonthlyMock,
  getPreferenceMock,
  pushMock,
  replaceMock,
  routerState,
  updatePreferenceMock
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  routerState: {
    isReady: true,
    pathname: '/financial/dashboard',
    query: {} as Record<string, string>,
    push: vi.fn(),
    replace: vi.fn()
  },
  addToastMock: vi.fn(),
  getPreferenceMock: vi.fn(),
  updatePreferenceMock: vi.fn(),
  getMonthlyMock: vi.fn(),
  getHistoryMock: vi.fn(),
  apiGetMock: vi.fn()
}));

routerState.replace = replaceMock;
routerState.push = pushMock;

vi.mock('next/router', () => ({
  useRouter: () => routerState
}));

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({
    addToast: addToastMock
  })
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: apiGetMock
  }
}));

vi.mock('@/lib/financial-dashboard', () => ({
  getVariableProjectionPreference: (...args: unknown[]) => getPreferenceMock(...args),
  updateVariableProjectionPreference: (...args: unknown[]) => updatePreferenceMock(...args),
  getFinancialDashboardMonthly: (...args: unknown[]) => getMonthlyMock(...args),
  getFinancialDashboardHistory: (...args: unknown[]) => getHistoryMock(...args)
}));

vi.mock('recharts', () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

  return {
    ResponsiveContainer: Container,
    BarChart: Container,
    Bar: Container,
    LineChart: Container,
    Line: () => null,
    PieChart: Container,
    Pie: () => null,
    CartesianGrid: () => null,
    Cell: () => null,
    Legend: () => null,
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null
  };
});

vi.mock('@/components/ui/Card', () => ({
  Card: ({
    children,
    className
  }: {
    children?: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    className,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" className={className} {...props}>
      {children}
    </button>
  )
}));

vi.mock('@/components/ui/Skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div className={className} data-testid="skeleton" />
  )
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({
    'aria-label': ariaLabel,
    options,
    value,
    onChange
  }: {
    'aria-label'?: string;
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: ChangeEventHandler<HTMLSelectElement>;
  }) => (
    <select aria-label={ariaLabel} value={value} onChange={onChange}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}));

vi.mock('@/components/ui/MultiSelect', () => ({
  MultiSelect: ({
    label,
    values,
    options,
    onChange
  }: {
    label: string;
    values: string[];
    options: Array<{ value: string; label: string }>;
    onChange: (values: string[]) => void;
  }) => (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        multiple
        value={values}
        onChange={(event) => {
          onChange(Array.from(event.target.selectedOptions).map((option) => option.value));
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}));

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 2, 1, 12, 0, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthlyResponse(month: string) {
  const [year, monthValue] = month.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, monthValue - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, monthValue, 0, 23, 59, 59, 999));

  return {
    month,
    isCurrentMonth: true,
    period: {
      month,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    },
    carryOver: {
      amount: '950.00',
      source: 'CURRENT_BALANCE' as const
    },
    monthlyTotals: {
      incomeTotal: '500.00',
      expenseTotal: '120.00',
      committedExpenseTotal: '100.00',
      variableProjectedExpenseTotal: '20.00'
    },
    currentMonthBreakdown: {
      income: {
        realized: '0.00',
        remaining: '500.00'
      },
      expense: {
        realizedCommitted: '50.00',
        remainingCommitted: '50.00',
        remainingVariableProjected: '20.00'
      }
    },
    committedBreakdown: {
      income: {
        adHocMaterializedTotal: '0.00',
        fixedMaterializedTotal: '0.00',
        fixedProjectedTotal: '0.00'
      },
      expense: {
        adHocMaterializedTotal: '50.00',
        fixedMaterializedTotal: '0.00',
        fixedProjectedTotal: '30.00',
        creditCardTotal: '20.00'
      }
    },
    variableProjection: {
      total: '20.00',
      categories: [
        {
          categoryId: 10,
          categoryName: 'Combustivel',
          color: '#f97316',
          month,
          historicalAverage: '120.00',
          committedInMonth: '100.00',
          remainingProjected: '20.00'
        }
      ]
    },
    projectedEndingBalance: '1380.00',
    categoryTotals: [
      {
        categoryId: 10,
        name: 'Combustivel',
        color: '#f97316',
        type: 'EXPENSE' as const,
        amount: '120.00',
        realizedAmount: '50.00',
        pendingAmount: '50.00',
        projectedAmount: '20.00'
      },
      {
        categoryId: 20,
        name: 'Salario',
        color: '#22c55e',
        type: 'INCOME' as const,
        amount: '500.00',
        realizedAmount: '0.00',
        pendingAmount: '500.00',
        projectedAmount: '0.00'
      }
    ]
  };
}

describe('FinancialDashboard', () => {
  let currentMonth = '';

  beforeEach(() => {
    currentMonth = getCurrentMonthKey();

    replaceMock.mockReset();
    pushMock.mockReset();
    addToastMock.mockReset();
    getPreferenceMock.mockReset();
    updatePreferenceMock.mockReset();
    getMonthlyMock.mockReset();
    getHistoryMock.mockReset();
    apiGetMock.mockReset();

    routerState.query = {};

    apiGetMock.mockResolvedValue({
      data: [
        { id: 10, name: 'Combustivel', color: '#f97316', type: 'EXPENSE', parentId: null },
        { id: 20, name: 'Salario', color: '#22c55e', type: 'INCOME' }
      ]
    });
    getPreferenceMock.mockResolvedValue({
      trackedExpenseCategoryIds: [10],
      smallSliceThresholdPercent: 3
    });
    updatePreferenceMock.mockResolvedValue({
      trackedExpenseCategoryIds: [10],
      smallSliceThresholdPercent: 3
    });
    getMonthlyMock.mockResolvedValue(buildMonthlyResponse(currentMonth));
    getHistoryMock.mockResolvedValue({
      months: 12,
      monthlyTotals: [
        {
          month: currentMonth,
          incomeTotal: '450.00',
          expenseTotal: '70.00',
          isPartialCurrentMonth: true
        },
        {
          month: getPreviousMonthKey(currentMonth),
          incomeTotal: '300.00',
          expenseTotal: '120.00',
          isPartialCurrentMonth: false
        }
      ],
      categorySeries: []
    });
  });

  it('renders the monthly view with the projected balance and variable breakdown', async () => {
    render(<FinancialDashboard />);

    await waitFor(() => {
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    const projectedBalanceCard = screen.getByText(/Saldo atual \+ movimentos restantes/i)
      .parentElement;

    expect(projectedBalanceCard).toHaveTextContent('1.380,00');
    expect(screen.getAllByText(/Combustivel/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Media 6 meses/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Anterior/i })).toBeDisabled();

    expect(getMonthlyMock).toHaveBeenCalledWith(currentMonth);
  });

  it('groups small slices and saves the threshold preference', async () => {
    const user = userEvent.setup();

    apiGetMock.mockResolvedValue({
      data: [
        { id: 10, name: 'Combustivel', color: '#f97316', type: 'EXPENSE' },
        { id: 11, name: 'Cafezinho', color: '#f59e0b', type: 'EXPENSE' },
        { id: 20, name: 'Salario', color: '#22c55e', type: 'INCOME' }
      ]
    });
    updatePreferenceMock.mockResolvedValue({
      trackedExpenseCategoryIds: [10],
      smallSliceThresholdPercent: 5
    });
    getMonthlyMock.mockResolvedValue({
      ...buildMonthlyResponse(currentMonth),
      categoryTotals: [
        {
          categoryId: 10,
          name: 'Combustivel',
          color: '#f97316',
          type: 'EXPENSE' as const,
          amount: '101.00',
          realizedAmount: '50.00',
          pendingAmount: '20.00',
          projectedAmount: '30.00'
        },
        {
          categoryId: 11,
          name: 'Cafezinho',
          color: '#f59e0b',
          type: 'EXPENSE' as const,
          amount: '1.00',
          realizedAmount: '1.00',
          pendingAmount: '0.00',
          projectedAmount: '0.00'
        }
      ]
    });

    render(<FinancialDashboard />);

    await waitFor(() => {
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    const legend = screen.getByTestId('category-pie-legend');
    expect(within(legend).getByText(/Outras despesas/i)).toBeInTheDocument();
    expect(within(legend).queryByText(/Cafezinho/i)).not.toBeInTheDocument();
    expect(legend).toHaveTextContent('50,00');

    await user.click(screen.getByRole('button', { name: /Incluir pendentes/i }));
    expect(legend).toHaveTextContent('70,00');

    await user.click(screen.getByRole('button', { name: /Incluir projetadas/i }));
    expect(legend).toHaveTextContent('100,00');

    const thresholdInput = screen.getByLabelText(/Agrupar fatias menores que/i);
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '5');
    await user.click(screen.getByRole('button', { name: /Salvar preferencias/i }));

    await waitFor(() => {
      expect(updatePreferenceMock).toHaveBeenCalledWith({
        trackedExpenseCategoryIds: [10],
        smallSliceThresholdPercent: 5
      });
    });
  });

  it('groups subcategories under the parent, allows expansion, and navigates to transactions', async () => {
    const user = userEvent.setup();

    apiGetMock.mockResolvedValue({
      data: [
        { id: 10, name: 'Moradia', color: '#ef4444', type: 'EXPENSE', parentId: null },
        { id: 11, name: 'Aluguel', color: '#fb7185', type: 'EXPENSE', parentId: 10 },
        { id: 12, name: 'Condominio', color: '#f97316', type: 'EXPENSE', parentId: 10 }
      ]
    });
    getMonthlyMock.mockResolvedValue({
      ...buildMonthlyResponse(currentMonth),
      categoryTotals: [
        {
          categoryId: 11,
          name: 'Aluguel',
          color: '#fb7185',
          type: 'EXPENSE' as const,
          amount: '80.00',
          realizedAmount: '80.00',
          pendingAmount: '0.00',
          projectedAmount: '0.00'
        },
        {
          categoryId: 12,
          name: 'Condominio',
          color: '#f97316',
          type: 'EXPENSE' as const,
          amount: '20.00',
          realizedAmount: '20.00',
          pendingAmount: '0.00',
          projectedAmount: '0.00'
        }
      ]
    });

    render(<FinancialDashboard />);

    await waitFor(() => {
      expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    });

    const legend = screen.getByTestId('category-pie-legend');
    expect(within(legend).getByText('Moradia')).toBeInTheDocument();
    expect(within(legend).queryByText('Aluguel')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Expandir Moradia/i }));
    expect(within(legend).getByText('Aluguel')).toBeInTheDocument();
    expect(within(legend).getByText('Condominio')).toBeInTheDocument();

    await user.click(within(legend).getByRole('button', { name: /Aluguel/i }));

    expect(pushMock).toHaveBeenCalledWith({
      pathname: '/financial/transactions',
      query: {
        categoryId: '11',
        dateField: 'dueDate',
        endDate: buildMonthlyResponse(currentMonth).period.endDate.slice(0, 10),
        showOnlyMaterialized: 'true',
        startDate: buildMonthlyResponse(currentMonth).period.startDate.slice(0, 10),
        status: 'COMPLETED'
      }
    });

    await user.click(screen.getByRole('button', { name: /Quebrar em subcategorias/i }));

    expect(within(legend).getByText('Moradia / Aluguel')).toBeInTheDocument();
    expect(within(legend).getByText('Moradia / Condominio')).toBeInTheDocument();
  });

  it('switches to the history view and shows the empty category state until categories are selected', async () => {
    const user = userEvent.setup();

    render(<FinancialDashboard />);

    const viewSelect = await screen.findByRole('combobox', {
      name: /Selecione a visao do dashboard/i
    });
    await user.selectOptions(viewSelect, 'history');

    await waitFor(() => {
      expect(getHistoryMock).toHaveBeenCalledWith({
        months: 12,
        categoryIds: []
      });
    });

    expect(
      await screen.findByText(/Nenhuma categoria selecionada para o grafico historico/i)
    ).toBeInTheDocument();
  });

  it('normalizes a past month from the query string back to the current month', async () => {
    routerState.query = {
      view: 'monthly',
      month: '2025-01'
    };

    render(<FinancialDashboard />);

    await waitFor(() => {
      expect(getMonthlyMock).toHaveBeenCalledWith(currentMonth);
    });

    expect(replaceMock).toHaveBeenCalled();
    expect(getMonthlyMock).toHaveBeenCalledWith(currentMonth);
  });
});
