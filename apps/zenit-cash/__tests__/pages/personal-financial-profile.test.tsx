import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersonalFinancialProfilePage from '@/pages/profile/financial';

const { addToastMock, getMock, pushMock, reloadMock, saveMock } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  getMock: vi.fn(),
  pushMock: vi.fn(),
  reloadMock: vi.fn(),
  saveMock: vi.fn()
}));

vi.mock('next/router', () => ({
  useRouter: () => ({
    query: { returnTo: '/financial/budgets?tab=overview' },
    push: pushMock,
    reload: reloadMock
  })
}));

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

vi.mock('@/components/ui/Breadcrumb', () => ({
  Breadcrumb: () => <nav aria-label="Breadcrumb" />
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, headerTitle }: { children: ReactNode; headerTitle?: string }) => (
    <section>
      {headerTitle && <h2>{headerTitle}</h2>}
      {children}
    </section>
  )
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type={type} {...props}>
      {children}
    </button>
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

vi.mock('@/components/ui/InfoModalButton', () => ({
  InfoModalButton: () => <button type="button">Ajuda</button>
}));

vi.mock('@/components/ui/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />
}));

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}));

vi.mock('@/utils/categoryIcons', () => ({
  CategoryIcon: () => <span aria-hidden="true">categoria</span>
}));

vi.mock('@/components/financial/CategorySelect', () => ({
  orderCategoriesForSelect: (categories: Array<Record<string, unknown>>) =>
    categories.map((category) => ({ category, level: 0, lineage: [] }))
}));

vi.mock('@/lib/personal-financial-profile', async () => {
  const actual = await vi.importActual<typeof import('@/lib/personal-financial-profile')>(
    '@/lib/personal-financial-profile'
  );
  return {
    ...actual,
    getPersonalFinancialProfile: (...args: unknown[]) => getMock(...args),
    savePersonalFinancialProfile: (...args: unknown[]) => saveMock(...args)
  };
});

const categories = [
  { id: 10, name: 'Moradia', color: '#3b82f6', icon: 'home', parentId: null },
  { id: 20, name: 'Lazer', color: '#8b5cf6', icon: 'party-popper', parentId: null }
];

const initialResponse = {
  state: 'NOT_CONFIGURED' as const,
  completionPercentage: 0,
  profile: null,
  workspace: { id: 7, name: 'Casa' },
  categories,
  access: { canRead: true, canManage: true }
};

const readyResponse = {
  ...initialResponse,
  state: 'READY' as const,
  completionPercentage: 100,
  profile: {
    id: 1,
    createdByUserId: 5,
    updatedByUserId: 5,
    workspace: initialResponse.workspace,
    planningContext: 'INDIVIDUAL' as const,
    adultsCount: 1,
    dependentsCount: 0,
    financialDataCoverage: 'FULL' as const,
    emergencyReserveTargetMonths: 6,
    planningStyle: 'BALANCED' as const,
    adjustmentPace: 'GRADUAL' as const,
    categoryPrioritiesReviewed: true,
    categoryPrioritiesReviewedAt: '2026-09-15T12:00:00.000Z',
    lastReviewedAt: '2026-09-15T12:00:00.000Z',
    version: 1,
    createdAt: '2026-09-15T12:00:00.000Z',
    updatedAt: '2026-09-15T12:00:00.000Z',
    categoryPreferences: [
      {
        categoryId: 10,
        flexibility: 'PROTECTED' as const,
        minimumMonthlyAmount: '800.00'
      },
      {
        categoryId: 20,
        flexibility: 'MODERATE' as const,
        minimumMonthlyAmount: null
      }
    ]
  }
};

describe('PersonalFinancialProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue(initialResponse);
    saveMock.mockResolvedValue(readyResponse);
    pushMock.mockResolvedValue(true);
  });

  it('builds a reviewed workspace profile and returns to the requesting feature', async () => {
    const user = userEvent.setup();
    render(<PersonalFinancialProfilePage />);

    await screen.findByRole('heading', { name: 'Contexto do planejamento' });
    expect(screen.getAllByText('Casa').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Apenas para mim' }));
    await user.type(screen.getByLabelText('Dependentes financeiros'), '0');
    await user.type(screen.getByLabelText(/^Reserva desejada em meses/), '6');
    await user.selectOptions(screen.getByLabelText('Estilo de planejamento'), 'BALANCED');
    await user.selectOptions(screen.getByLabelText('Ritmo dos ajustes'), 'GRADUAL');
    await user.click(screen.getByRole('button', { name: 'Protegida: Moradia' }));
    await user.clear(screen.getByLabelText('Mínimo para Moradia'));
    await user.type(screen.getByLabelText('Mínimo para Moradia'), '800.00');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Salvar perfil' }));

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith({
        planningContext: 'INDIVIDUAL',
        adultsCount: 1,
        dependentsCount: 0,
        financialDataCoverage: 'FULL',
        emergencyReserveTargetMonths: 6,
        planningStyle: 'BALANCED',
        adjustmentPace: 'GRADUAL',
        categoryPrioritiesReviewed: true,
        categoryPreferences: [
          {
            categoryId: 10,
            flexibility: 'PROTECTED',
            minimumMonthlyAmount: '800.00'
          },
          {
            categoryId: 20,
            flexibility: 'MODERATE',
            minimumMonthlyAmount: null
          }
        ]
      });
    });
    expect(pushMock).toHaveBeenCalledWith('/financial/budgets?tab=overview');
    expect(addToastMock).toHaveBeenCalledWith(
      'Perfil de planejamento financeiro pronto para uso',
      'success'
    );
  });
});
