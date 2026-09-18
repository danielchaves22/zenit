import FinancialPlanningAnalysisService from '../../src/services/financial-planning-analysis.service';
import FinancialPlanningGuidanceService from '../../src/services/financial-planning-guidance.service';
import OpenAiIntegrationService from '../../src/services/openai-integration.service';

const scenarioResult = {
  snapshot: {
    id: 50,
    basisHash: 'a'.repeat(64),
    confirmedAt: '2026-09-17T12:00:00.000Z'
  },
  recommendationMethodologyVersion: 1,
  status: 'ADJUSTMENT_REQUIRED' as const,
  targetMonthlySavings: '7000.00',
  currentMonthlyAvailableBeforeGoal: '6700.00',
  currentMonthlyBalanceAfterGoal: '-300.00',
  requiredReduction: '300.00',
  scenarios: [
    {
      id: 'PRESERVE_PRIORITIES' as const,
      label: 'Preservar prioridades',
      description: 'Ajuste apenas em categorias flexíveis.',
      feasibility: 'FEASIBLE' as const,
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
          flexibility: 'FLEXIBLE' as const,
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
  ],
  guidanceEvidence: {
    methodologyVersion: 1,
    findings: [
      {
        id: 'GOAL_FIT' as const,
        severity: 'ATTENTION' as const,
        title: 'A meta exige ajuste na base atual',
        summary: 'A disponibilidade ainda é menor que a economia desejada.',
        evidence: [
          {
            key: 'monthlyBalanceAfterGoal',
            label: 'Saldo depois da meta',
            value: '-300.00',
            format: 'MONEY' as const
          }
        ],
        referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
      },
      {
        id: 'ADJUSTMENT_CAPACITY' as const,
        severity: 'POSITIVE' as const,
        title: 'Há capacidade de ajuste',
        summary: 'Os gastos flexíveis comportam a mudança proposta.',
        evidence: [],
        referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
      }
    ],
    references: [
      {
        id: 'CAIXA_ORCAMENTO_PRATICO',
        organization: 'CAIXA',
        title: 'Fazendo seu orçamento na prática',
        url: 'https://example.com/orcamento',
        purpose: 'Organização do orçamento.'
      }
    ],
    limitations: ['A análise depende da base confirmada.']
  }
};

const validGuidance = {
  headline: 'A meta pede uma escolha consciente',
  summary: 'A base mostra espaço para ajuste, desde que as prioridades pessoais sejam preservadas.',
  priorities: [
    {
      findingId: 'GOAL_FIT',
      title: 'Aproxime a meta da rotina',
      explanation: 'A diferença pode ser trabalhada nas categorias que você marcou como flexíveis.',
      nextStep: 'Revise o cenário proposto e confirme se ele respeita sua rotina.'
    }
  ],
  scenarioComparison: {
    scenarioId: 'PRESERVE_PRIORITIES',
    explanation: 'Este cenário concentra o esforço onde você declarou maior liberdade de ajuste.'
  },
  cautions: [
    {
      findingId: 'GOAL_FIT',
      message: 'A proposta depende da manutenção das receitas e dos compromissos considerados.'
    }
  ],
  referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
};

describe('FinancialPlanningGuidanceService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.spyOn(FinancialPlanningAnalysisService, 'getScenarios').mockResolvedValue(
      scenarioResult as Awaited<ReturnType<typeof FinancialPlanningAnalysisService.getScenarios>>
    );
    jest.spyOn(OpenAiIntegrationService, 'getDecryptedCredential').mockResolvedValue({
      companyId: 7,
      provider: 'OPENAI',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      promptVersion: 'v1',
      isActive: true,
      updatedAt: new Date('2026-09-17T12:00:00.000Z')
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  function mockGuidanceResponse(payload: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ output_text: JSON.stringify(payload) })
    }) as jest.Mock;
  }

  it('sends only structured evidence and accepts a grounded explanation', async () => {
    mockGuidanceResponse(validGuidance);

    const result = await FinancialPlanningGuidanceService.generate({
      companyId: 7,
      userId: 11,
      snapshotId: 50
    });

    expect(result.guidance).toEqual(validGuidance);
    expect(result.telemetry).toMatchObject({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      promptVersion: 'financial-guidance-v1'
    });
    expect(FinancialPlanningAnalysisService.getScenarios).toHaveBeenCalledWith({
      companyId: 7,
      userId: 11,
      snapshotId: 50
    });

    const request = (global.fetch as jest.Mock).mock.calls[0];
    expect(request[0]).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(request[1].body);
    expect(body).toMatchObject({
      model: 'gpt-4o-mini',
      store: false,
      tools: [],
      tool_choice: 'none',
      text: {
        format: {
          type: 'json_schema',
          name: 'financial_planning_guidance',
          strict: true
        }
      }
    });
    const input = JSON.parse(body.input);
    expect(input).toMatchObject({
      objective: { kind: 'MONTHLY_SAVINGS', status: 'ADJUSTMENT_REQUIRED' },
      evidence: scenarioResult.guidanceEvidence,
      scenarios: [
        expect.objectContaining({
          id: 'PRESERVE_PRIORITIES',
          findingIds: ['ADJUSTMENT_CAPACITY']
        })
      ]
    });
    expect(input).not.toHaveProperty('transactions');
    expect(body.safety_identifier).not.toContain('11');
  });

  it.each([
    [
      'números recalculados',
      { ...validGuidance, summary: 'Ajuste em 10 por cento para atingir a meta.' }
    ],
    [
      'referência sem vínculo',
      { ...validGuidance, referenceIds: ['REFERENCIA_INVENTADA'] }
    ],
    [
      'cenário inexistente',
      {
        ...validGuidance,
        scenarioComparison: {
          scenarioId: 'BALANCED',
          explanation: validGuidance.scenarioComparison.explanation
        }
      }
    ]
  ])('rejects a response with %s', async (_label, payload) => {
    mockGuidanceResponse(payload);

    await expect(
      FinancialPlanningGuidanceService.generate({ companyId: 7, userId: 11, snapshotId: 50 })
    ).rejects.toMatchObject({
      code: 'FINANCIAL_PLANNING_AI_INVALID_RESPONSE',
      statusCode: 502
    });
  });

  it('does not call the provider when the workspace integration is unavailable', async () => {
    jest.spyOn(OpenAiIntegrationService, 'getDecryptedCredential').mockRejectedValue(
      new Error('not configured')
    );
    global.fetch = jest.fn() as jest.Mock;

    await expect(
      FinancialPlanningGuidanceService.generate({ companyId: 7, userId: 11, snapshotId: 50 })
    ).rejects.toMatchObject({
      code: 'FINANCIAL_PLANNING_AI_UNAVAILABLE',
      statusCode: 503
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
