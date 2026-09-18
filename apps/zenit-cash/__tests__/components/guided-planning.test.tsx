import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GuidedPlanning } from '@/components/financial/budgets/GuidedPlanning';

const { addToastMock, confirmMock, detailMock, getMock, guidanceHistoryMock, guidanceMock, historyMock, scenariosMock } = vi.hoisted(() => ({
  addToastMock: vi.fn(),
  confirmMock: vi.fn(),
  detailMock: vi.fn(),
  guidanceMock: vi.fn(),
  historyMock: vi.fn(),
  getMock: vi.fn(),
  guidanceHistoryMock: vi.fn(),
  scenariosMock: vi.fn()
}));

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, headerTitle }: { children: ReactNode; headerTitle?: string }) => (
    <section>
      {headerTitle && <h3>{headerTitle}</h3>}
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

vi.mock('@/lib/financial-planning-analysis', async () => {
  const actual = await vi.importActual<typeof import('@/lib/financial-planning-analysis')>(
    '@/lib/financial-planning-analysis'
  );
  return {
    ...actual,
    getFinancialPlanningPreview: (...args: unknown[]) => getMock(...args),
    confirmFinancialPlanningSnapshot: (...args: unknown[]) => confirmMock(...args),
    getFinancialPlanningSnapshots: (...args: unknown[]) => historyMock(...args),
    getFinancialPlanningSnapshot: (...args: unknown[]) => detailMock(...args),
    getFinancialPlanningSnapshotScenarios: (...args: unknown[]) => scenariosMock(...args),
    generateFinancialPlanningGuidance: (...args: unknown[]) => guidanceMock(...args),
    getFinancialPlanningGuidance: (...args: unknown[]) => guidanceHistoryMock(...args)
  };
});

const dataQuality = {
  score: 92,
  rating: 'HIGH' as const,
  requestedMonths: 6,
  monthsWithData: 6,
  historyTransactionCount: 30,
  expenseTransactionCount: 24,
  categorizedExpenseCount: 23,
  breakdown: [
    { key: 'PROFILE', label: 'Perfil financeiro', points: 20, maximum: 20 },
    { key: 'HISTORY', label: 'Histórico disponível', points: 25, maximum: 25 }
  ],
  issues: []
};

const sources = [
  {
    key: 'RECURRING_TRANSACTION:1',
    kind: 'FIXED_INCOME' as const,
    origin: 'RECURRING_TRANSACTION' as const,
    label: 'Salário',
    detail: 'Mensal',
    monthlyAmount: '10000.00',
    selectedByDefault: true,
    metadata: {}
  },
  {
    key: 'RECURRING_TRANSACTION:2',
    kind: 'FIXED_EXPENSE' as const,
    origin: 'RECURRING_TRANSACTION' as const,
    label: 'Aluguel',
    detail: 'Mensal · Moradia',
    monthlyAmount: '2500.00',
    selectedByDefault: true,
    metadata: {}
  },
  {
    key: 'HISTORICAL_CATEGORY:3',
    kind: 'VARIABLE_EXPENSE' as const,
    origin: 'HISTORICAL_CATEGORY' as const,
    label: 'Lazer',
    detail: 'Média de 12 lançamentos',
    monthlyAmount: '800.00',
    selectedByDefault: true,
    metadata: {}
  }
];

const preview = {
  workspace: { id: 10, name: 'Workspace pessoal de Ana' },
  methodologyVersion: 1,
  basisHash: 'a'.repeat(64),
  profile: {
    version: 2,
    financialDataCoverage: 'FULL' as const,
    lastReviewedAt: '2026-09-15T12:00:00.000Z'
  },
  period: { historyMonths: 6, startDate: '2026-03-01', endDate: '2026-08-31' },
  dataQuality,
  sources,
  defaultSelectedSourceKeys: sources.map((source) => source.key),
  defaultTotals: {
    monthlyIncome: '10000.00',
    monthlyCommittedExpenses: '2500.00',
    monthlyVariableExpenses: '800.00',
    monthlyProvisionContribution: '0.00',
    monthlyAvailableBeforeGoal: '6700.00',
    monthlyBalanceAfterGoal: '6700.00'
  },
  latestSnapshot: null
};

const snapshot = {
  id: 50,
  objectiveKind: 'MONTHLY_SAVINGS' as const,
  targetMonthlySavings: '1000.00',
  historyMonths: 6,
  historyStartDate: '2026-03-01',
  historyEndDate: '2026-08-31',
  profileVersion: 2,
  methodologyVersion: 1,
  basisHash: 'a'.repeat(64),
  dataQualityScore: 92,
  dataQuality,
  sources: sources.map((source) => ({ ...source, selected: source.key !== 'HISTORICAL_CATEGORY:3' })),
  selectedSourceKeys: ['RECURRING_TRANSACTION:1', 'RECURRING_TRANSACTION:2'],
  totals: {
    monthlyIncome: '10000.00',
    monthlyCommittedExpenses: '2500.00',
    monthlyVariableExpenses: '0.00',
    monthlyProvisionContribution: '0.00',
    monthlyAvailableBeforeGoal: '7500.00',
    monthlyBalanceAfterGoal: '6500.00'
  },
  status: 'CONFIRMED' as const,
  confirmedAt: '2026-09-15T12:00:00.000Z',
  createdAt: '2026-09-15T12:00:00.000Z'
};

describe('GuidedPlanning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockResolvedValue(preview);
    confirmMock.mockResolvedValue(snapshot);
    historyMock.mockResolvedValue({
      items: [{ ...snapshot, selectedSourceCount: snapshot.selectedSourceKeys.length }],
      nextCursor: null
    });
    detailMock.mockResolvedValue(snapshot);
    guidanceHistoryMock.mockResolvedValue({ items: [], nextCursor: null });
    scenariosMock.mockResolvedValue({
      snapshot: { id: 50, basisHash: 'a'.repeat(64), confirmedAt: snapshot.confirmedAt },
      recommendationMethodologyVersion: 1,
      status: 'ADJUSTMENT_REQUIRED',
      targetMonthlySavings: '7000.00',
      currentMonthlyAvailableBeforeGoal: '6700.00',
      currentMonthlyBalanceAfterGoal: '-300.00',
      requiredReduction: '300.00',
      guidanceEvidence: {
        methodologyVersion: 1,
        findings: [
          {
            id: 'GOAL_FIT',
            severity: 'ATTENTION',
            title: 'A meta exige ajuste na base atual',
            summary: 'Existe disponibilidade mensal, mas ela ainda é menor que a economia desejada.',
            evidence: [
              {
                key: 'monthlyBalanceAfterGoal',
                label: 'Saldo depois da meta',
                value: '-300.00',
                format: 'MONEY'
              }
            ],
            referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
          }
        ],
        references: [
          {
            id: 'CAIXA_ORCAMENTO_PRATICO',
            organization: 'CAIXA',
            title: 'Fazendo seu orçamento na prática',
            url: 'https://www.caixa.gov.br/educacao-financeira/voce/orcamento-pratica/Paginas/default.aspx',
            purpose: 'Organização do orçamento.'
          }
        ],
        limitations: ['Os percentuais não são limites universais de gasto.']
      },
      scenarios: [
        {
          id: 'PRESERVE_PRIORITIES',
          label: 'Preservar prioridades',
          description: 'Propõe ajustes apenas nas categorias marcadas como flexíveis.',
          feasibility: 'FEASIBLE',
          requiredReduction: '300.00',
          proposedReduction: '300.00',
          remainingGap: '0.00',
          projectedMonthlyAvailableBeforeGoal: '7000.00',
          projectedMonthlyBalanceAfterGoal: '0.00',
          adjustments: [
            {
              sourceKey: 'HISTORICAL_CATEGORY:3',
              categoryId: 3,
              categoryName: 'Lazer',
              flexibility: 'FLEXIBLE',
              currentAmount: '800.00',
              minimumMonthlyAmount: '300.00',
              adjustableAmount: '500.00',
              proposedReduction: '300.00',
              suggestedMonthlyLimit: '500.00',
              explanation: 'Ajuste distribuído entre categorias flexíveis.'
            }
          ],
          assumptions: ['Somente gastos variáveis foram ajustados.'],
          warnings: []
        }
      ]
    });
    guidanceMock.mockResolvedValue({
      recordId: 81,
      snapshot: { id: 50, basisHash: 'a'.repeat(64), confirmedAt: snapshot.confirmedAt },
      evidenceMethodologyVersion: 1,
      recommendationMethodologyVersion: 1,
      guidanceMethodologyVersion: 1,
      evaluation: {
        methodologyVersion: 1,
        passed: true,
        score: 100,
        checks: []
      },
      guidanceEvidence: {
        methodologyVersion: 1,
        findings: [
          {
            id: 'GOAL_FIT',
            severity: 'ATTENTION',
            title: 'A meta exige ajuste na base atual',
            summary: 'Existe disponibilidade mensal, mas ela ainda é menor que a economia desejada.',
            evidence: [],
            referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
          }
        ],
        references: [
          {
            id: 'CAIXA_ORCAMENTO_PRATICO',
            organization: 'CAIXA',
            title: 'Fazendo seu orçamento na prática',
            url: 'https://www.caixa.gov.br/educacao-financeira/voce/orcamento-pratica/Paginas/default.aspx',
            purpose: 'Organização do orçamento.'
          }
        ],
        limitations: []
      },
      scenarioContext: [
        {
          id: 'PRESERVE_PRIORITIES',
          label: 'Preservar prioridades',
          feasibility: 'FEASIBLE',
          findingIds: ['ADJUSTMENT_CAPACITY'],
          assumptions: [],
          warnings: []
        }
      ],
      guidance: {
        headline: 'A meta pede uma escolha consciente',
        summary: 'A base mostra espaço para ajuste sem substituir sua decisão pessoal.',
        priorities: [
          {
            findingId: 'GOAL_FIT',
            title: 'Revise a flexibilidade declarada',
            explanation: 'O cenário usa somente as categorias que aceitam ajuste.',
            nextStep: 'Confira se a proposta continua adequada para sua rotina.'
          }
        ],
        scenarioComparison: {
          scenarioId: 'PRESERVE_PRIORITIES',
          explanation: 'Este cenário concentra o esforço nas escolhas com maior flexibilidade.'
        },
        cautions: [
          {
            findingId: 'GOAL_FIT',
            message: 'O parecer depende da base financeira confirmada.'
          }
        ],
        referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
      },
      telemetry: {
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        promptVersion: 'financial-guidance-v2',
        latencyMs: 120
      },
      audit: {
        inputHash: 'b'.repeat(64),
        contentHash: 'c'.repeat(64)
      },
      generatedAt: '2026-09-17T12:00:00.000Z'
    });
  });

  it('lets the user choose sources before confirming an immutable snapshot', async () => {
    const user = userEvent.setup();
    render(<GuidedPlanning />);

    expect(await screen.findByText('Workspace pessoal de Ana')).toBeInTheDocument();
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('Qualidade alta')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Quanto deseja economizar por mês?'));
    await user.type(screen.getByLabelText('Quanto deseja economizar por mês?'), '1000.00');
    await user.click(screen.getByRole('checkbox', { name: 'Considerar Lazer' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar retrato financeiro' }));

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalledWith({
        objectiveKind: 'MONTHLY_SAVINGS',
        targetMonthlySavings: '1000.00',
        historyMonths: 6,
        selectedSourceKeys: ['RECURRING_TRANSACTION:1', 'RECURRING_TRANSACTION:2'],
        basisHash: 'a'.repeat(64)
      });
    });
    expect(await screen.findByText('Base confirmada e atual')).toBeInTheDocument();
    expect(screen.getByText('Retrato confirmado agora')).toBeInTheDocument();
    expect(addToastMock).toHaveBeenCalledWith('Retrato financeiro confirmado', 'success');
  });

  it('directs the user to configure the financial profile when required', async () => {
    getMock.mockRejectedValue({
      response: {
        data: {
          code: 'FINANCIAL_PROFILE_REQUIRED',
          error: 'Conclua seu perfil antes de preparar uma análise'
        }
      }
    });

    render(<GuidedPlanning />);

    expect(await screen.findByText('Perfil financeiro necessário')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Configurar perfil financeiro' });
    expect(link).toHaveAttribute(
      'href',
      '/profile/financial?returnTo=%2Ffinancial%2Fbudgets%3Fview%3Dguided'
    );
  });

  it('compares deterministic scenarios only after using a current confirmed portrait', async () => {
    const user = userEvent.setup();
    const onReviewScenario = vi.fn();
    getMock.mockResolvedValue({ ...preview, latestSnapshot: snapshot });

    render(<GuidedPlanning onReviewScenario={onReviewScenario} />);

    expect(await screen.findByText('Cenários para alcançar a meta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Calcular cenários' }));

    await waitFor(() => expect(scenariosMock).toHaveBeenCalledWith(50));
    await waitFor(() => expect(guidanceHistoryMock).toHaveBeenCalledWith(50, { limit: 10 }));
    expect(guidanceMock).not.toHaveBeenCalled();
    expect(await screen.findByText('Preservar prioridades')).toBeInTheDocument();
    expect(screen.getByText('Leitura dos dados confirmados')).toBeInTheDocument();
    expect(screen.getByText('A meta exige ajuste na base atual')).toBeInTheDocument();
    expect(screen.getByText('Meta alcançável neste cenário')).toBeInTheDocument();
    expect(screen.getByText('R$ 500,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revisar como rascunho mensal' }));
    expect(onReviewScenario).toHaveBeenCalledWith({
      snapshotId: 50,
      scenario: expect.objectContaining({ id: 'PRESERVE_PRIORITIES' })
    });
  });

  it('generates the AI explanation only after an explicit request', async () => {
    const user = userEvent.setup();
    getMock.mockResolvedValue({ ...preview, latestSnapshot: snapshot });

    render(<GuidedPlanning />);

    await screen.findByText('Cenários para alcançar a meta');
    await user.click(screen.getByRole('button', { name: 'Calcular cenários' }));
    expect(await screen.findByText('Parecer explicativo com IA')).toBeInTheDocument();
    expect(guidanceMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Gerar parecer com IA' }));

    await waitFor(() => expect(guidanceMock).toHaveBeenCalledWith(50));
    expect(await screen.findByText('A meta pede uma escolha consciente')).toBeInTheDocument();
    expect(screen.getByText('Revise a flexibilidade declarada')).toBeInTheDocument();
    expect(screen.getByText(/registro #81/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'CAIXA' })).toHaveAttribute(
      'href',
      'https://www.caixa.gov.br/educacao-financeira/voce/orcamento-pratica/Paginas/default.aspx'
    );
    await user.click(screen.getByText('Ver auditoria do parecer'));
    expect(screen.getByText('Validação determinística:').parentElement).toHaveTextContent(
      'aprovada · 100% · metodologia v1'
    );

    const firstGuidance = await guidanceMock.mock.results[0].value;
    guidanceMock.mockResolvedValueOnce({
      ...firstGuidance,
      recordId: 82,
      guidance: {
        ...firstGuidance.guidance,
        headline: 'Uma nova leitura preservada'
      },
      audit: {
        inputHash: 'd'.repeat(64),
        contentHash: 'e'.repeat(64)
      },
      generatedAt: '2026-09-18T13:00:00.000Z'
    });

    await user.click(screen.getByRole('button', { name: 'Gerar novo parecer' }));

    expect(await screen.findByText('Uma nova leitura preservada')).toBeInTheDocument();
    expect(screen.getByText(/registro #82/)).toBeInTheDocument();
    await user.click(screen.getByText('Outros pareceres salvos (1)'));
    await user.click(screen.getByRole('button', { name: /#81/ }));
    expect(await screen.findByText('A meta pede uma escolha consciente')).toBeInTheDocument();
    expect(screen.getByText(/registro #81/)).toBeInTheDocument();
  });

  it('reopens a saved AI explanation without requesting a new generation', async () => {
    const user = userEvent.setup();
    const savedGuidance = await guidanceMock();
    guidanceMock.mockClear();
    guidanceHistoryMock.mockResolvedValue({ items: [savedGuidance], nextCursor: null });
    getMock.mockResolvedValue({ ...preview, latestSnapshot: snapshot });

    render(<GuidedPlanning />);

    await screen.findByText('Cenários para alcançar a meta');
    await user.click(screen.getByRole('button', { name: 'Calcular cenários' }));

    await waitFor(() => expect(guidanceHistoryMock).toHaveBeenCalledWith(50, { limit: 10 }));
    expect(await screen.findByText('A meta pede uma escolha consciente')).toBeInTheDocument();
    expect(screen.getByText(/registro #81/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar novo parecer' })).toBeInTheDocument();
    expect(guidanceMock).not.toHaveBeenCalled();
  });

  it('refreshes the preview when the reviewed financial basis became stale', async () => {
    const user = userEvent.setup();
    const refreshedPreview = { ...preview, basisHash: 'b'.repeat(64) };
    getMock.mockResolvedValueOnce(preview).mockResolvedValueOnce(refreshedPreview);
    confirmMock.mockRejectedValueOnce({
      response: {
        data: {
          code: 'FINANCIAL_PLANNING_PREVIEW_STALE',
          error: 'Os dados financeiros mudaram desde a prévia'
        }
      }
    });
    render(<GuidedPlanning />);

    await screen.findByText('Workspace pessoal de Ana');
    await user.clear(screen.getByLabelText('Quanto deseja economizar por mês?'));
    await user.type(screen.getByLabelText('Quanto deseja economizar por mês?'), '1000.00');
    await user.click(screen.getByRole('checkbox', { name: 'Considerar Lazer' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar retrato financeiro' }));

    await waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('checkbox', { name: 'Considerar Lazer' })).toBeChecked();
    expect(addToastMock).toHaveBeenCalledWith(
      'Os dados financeiros mudaram desde a prévia',
      'error'
    );
  });

  it('marks the latest confirmed portrait as stale when its basis no longer matches', async () => {
    getMock.mockResolvedValue({
      ...preview,
      latestSnapshot: { ...snapshot, basisHash: 'b'.repeat(64) }
    });

    render(<GuidedPlanning />);

    expect(await screen.findByText('Retrato financeiro desatualizado')).toBeInTheDocument();
    expect(
      screen.getByText(/Receitas, compromissos, histórico, perfil ou metodologia mudaram/)
    ).toBeInTheDocument();
    expect(screen.getByText('Último retrato confirmado')).toBeInTheDocument();
  });

  it('does not claim freshness for a legacy portrait without an integrity hash', async () => {
    getMock.mockResolvedValue({
      ...preview,
      latestSnapshot: { ...snapshot, basisHash: null }
    });

    render(<GuidedPlanning />);

    expect(await screen.findByText('Validade não verificável')).toBeInTheDocument();
    expect(screen.getByText(/antes do controle de integridade da base/)).toBeInTheDocument();
  });

  it('loads the immutable diagnosis history and its audit details on demand', async () => {
    const user = userEvent.setup();
    render(<GuidedPlanning />);

    await screen.findByText('Workspace pessoal de Ana');
    await user.click(screen.getByRole('button', { name: 'Ver histórico' }));

    await waitFor(() => {
      expect(historyMock).toHaveBeenCalledWith({ limit: 10 });
    });
    const snapshotButton = await screen.findByRole('button', { name: /Snapshot #50/ });
    await user.click(snapshotButton);

    await waitFor(() => expect(detailMock).toHaveBeenCalledWith(50));
    expect(await screen.findByText('Identificador da base')).toBeInTheDocument();
    expect(screen.getAllByText('Salário')).toHaveLength(2);
    expect(screen.getByText('v2')).toBeInTheDocument();
  });
});
