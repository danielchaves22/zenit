import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialProvisions } from '@/components/financial/budgets/FinancialProvisions';

const {
  addEntryMock,
  addToastMock,
  apiGetMock,
  cancelMock,
  createMock,
  getMock,
  updateMock,
  useMock
} = vi.hoisted(() => ({
  addEntryMock: vi.fn(),
  addToastMock: vi.fn(),
  apiGetMock: vi.fn(),
  cancelMock: vi.fn(),
  createMock: vi.fn(),
  getMock: vi.fn(),
  updateMock: vi.fn(),
  useMock: vi.fn()
}));

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGetMock }
}));

vi.mock('@/lib/financial-provisions', () => ({
  addFinancialProvisionEntry: (...args: unknown[]) => addEntryMock(...args),
  cancelFinancialProvision: (...args: unknown[]) => cancelMock(...args),
  createFinancialProvision: (...args: unknown[]) => createMock(...args),
  getFinancialProvisions: (...args: unknown[]) => getMock(...args),
  updateFinancialProvision: (...args: unknown[]) => updateMock(...args),
  useFinancialProvision: (...args: unknown[]) => useMock(...args)
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
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
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
    onChange
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <label>
      <span>{label}</span>
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />
}));

vi.mock('@/components/ui/InfoModalButton', () => ({
  InfoModalButton: () => <button type="button">Ajuda</button>
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type} {...props}>
      {children}
    </button>
  )
}));

const emptyResponse = {
  access: { canRead: true as const, canManage: true },
  summary: {
    activeCount: 0,
    fundedCount: 0,
    overdueCount: 0,
    expectedAmount: '0.00',
    reservedAmount: '0.00',
    remainingAmount: '0.00',
    monthlyContributionAmount: '0.00'
  },
  items: []
};

const provision = {
  id: 20,
  name: 'IPVA',
  notes: null,
  kind: 'ONE_TIME' as const,
  status: 'ACTIVE' as const,
  state: 'IN_PROGRESS' as const,
  category: {
    id: 10,
    name: 'Impostos',
    color: '#8b5cf6',
    icon: 'receipt',
    parentId: null
  },
  expectedAmount: '1200.00',
  reservedAmount: '200.00',
  remainingAmount: '1000.00',
  monthlyContributionAmount: '333.34',
  progressPercent: 16.7,
  monthsRemaining: 3,
  startMonth: '2026-09',
  targetDate: '2026-12-15',
  completedAt: null,
  canceledAt: null,
  lastUsedAt: null,
  lastUsedAmount: null,
  createdAt: '2026-09-15T12:00:00.000Z',
  updatedAt: '2026-09-15T12:00:00.000Z',
  entries: []
};

const responseWithProvision = {
  access: { canRead: true as const, canManage: true },
  summary: {
    activeCount: 1,
    fundedCount: 0,
    overdueCount: 0,
    expectedAmount: '1200.00',
    reservedAmount: '200.00',
    remainingAmount: '1000.00',
    monthlyContributionAmount: '333.34'
  },
  items: [provision]
};

describe('FinancialProvisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiGetMock.mockResolvedValue({
      data: [
        {
          id: 10,
          name: 'Impostos',
          type: 'EXPENSE',
          color: '#8b5cf6',
          icon: 'receipt',
          parentId: null
        }
      ]
    });
    getMock.mockResolvedValue(emptyResponse);
    createMock.mockResolvedValue(provision);
    addEntryMock.mockResolvedValue(provision);
    cancelMock.mockResolvedValue({ ...provision, status: 'CANCELED', state: 'CANCELED' });
  });

  it('creates an explicit one-time provision', async () => {
    const user = userEvent.setup();
    render(<FinancialProvisions />);

    await user.click(await screen.findByRole('button', { name: 'Nova provisão' }));
    await user.type(screen.getByLabelText(/Nome/), 'Seguro do carro');
    await user.selectOptions(screen.getByLabelText(/Categoria/), '10');
    await user.clear(screen.getByLabelText('Valor previsto'));
    await user.type(screen.getByLabelText('Valor previsto'), '2400.00');
    await user.clear(screen.getByLabelText('Valor já reservado'));
    await user.type(screen.getByLabelText('Valor já reservado'), '400.00');
    await user.click(screen.getByRole('button', { name: 'Criar provisão' }));

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Seguro do carro',
          categoryId: 10,
          kind: 'ONE_TIME',
          expectedAmount: '2400.00',
          initialReservedAmount: '400.00'
        })
      );
    });
  }, 10_000);

  it('uses the suggested monthly value when registering a contribution', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue(responseWithProvision);
    render(<FinancialProvisions />);

    await user.click(await screen.findByRole('button', { name: 'Registrar aporte' }));
    expect(screen.getByLabelText('Valor')).toHaveValue('333.34');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => {
      expect(addEntryMock).toHaveBeenCalledWith(
        20,
        expect.objectContaining({ type: 'CONTRIBUTION', amount: '333.34' })
      );
    });
  });

  it('requires confirmation before canceling a provision', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue(responseWithProvision);
    render(<FinancialProvisions />);

    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));
    expect(cancelMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancelar provisão' }));

    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith(20));
  });

  it('keeps provisions visible without exposing management actions to read-only members', async () => {
    getMock.mockResolvedValue({
      ...responseWithProvision,
      access: { canRead: true, canManage: false }
    });

    render(<FinancialProvisions />);

    expect(
      await screen.findByText(/Somente gestores do workspace podem alterá-las/i)
    ).toBeInTheDocument();
    expect(screen.getByText('IPVA')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova provisão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar aporte' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });
});
