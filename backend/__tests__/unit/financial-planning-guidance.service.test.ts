import FinancialPlanningAnalysisService from '../../src/services/financial-planning-analysis.service';
import FinancialPlanningGuidanceService, {
  __private__
} from '../../src/services/financial-planning-guidance.service';
import OpenAiIntegrationService from '../../src/services/openai-integration.service';
import prisma from '../../src/lib/prisma';
import * as metrics from '../../src/metrics';

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
    jest.spyOn(metrics, 'observeFinancialPlanningGuidance').mockImplementation(() => undefined);
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
    jest.spyOn(prisma.financialPlanningGuidanceRecord, 'create').mockImplementation((
      async ({ data }: any) => ({
        id: 81,
        ...data,
        provider: data.provider ?? 'OPENAI',
        providerResponseId: data.providerResponseId ?? null,
        inputTokens: data.inputTokens ?? null,
        outputTokens: data.outputTokens ?? null,
        totalTokens: data.totalTokens ?? null,
        usedFallbackModel: data.usedFallbackModel ?? false,
        createdAt: new Date('2026-09-18T12:00:01.000Z')
      }) as any
    ) as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  function mockGuidanceResponse(payload: unknown) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        id: 'resp_guidance_test',
        output_text: JSON.stringify(payload),
        usage: { input_tokens: 450, output_tokens: 120, total_tokens: 570 }
      })
    }) as jest.Mock;
  }

  it('sends only structured evidence and accepts a grounded explanation', async () => {
    mockGuidanceResponse(validGuidance);

    const result = await FinancialPlanningGuidanceService.generate({
      companyId: 7,
      userId: 11,
      snapshotId: 50
    });

    expect(result).toMatchObject({
      recordId: 81,
      guidance: validGuidance,
      evaluation: {
        methodologyVersion: 1,
        passed: true,
        score: 100
      },
      telemetry: {
        providerResponseId: 'resp_guidance_test',
        usage: { inputTokens: 450, outputTokens: 120, totalTokens: 570 }
      },
      audit: {
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }
    });
    expect(result.telemetry).toMatchObject({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      promptVersion: 'financial-guidance-v2'
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
      snapshot: scenarioResult.snapshot,
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
    expect(prisma.financialPlanningGuidanceRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        snapshotId: 50,
        createdByUserId: 11,
        companyId: 7,
        providerResponseId: 'resp_guidance_test',
        inputTokens: 450,
        outputTokens: 120,
        totalTokens: 570,
        evaluationMethodologyVersion: 1,
        evaluationScore: 100,
        evaluation: expect.objectContaining({
          methodologyVersion: 1,
          passed: true,
          score: 100
        }),
        inputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    });
    expect(metrics.observeFinancialPlanningGuidance).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        promptVersion: 'financial-guidance-v2',
        outcome: 'success',
        evaluationScore: 100,
        inputTokens: 450,
        outputTokens: 120,
        totalTokens: 570
      })
    );
  });

  it('rejects a saved record when its audited content was changed', async () => {
    mockGuidanceResponse(validGuidance);
    await FinancialPlanningGuidanceService.generate({ companyId: 7, userId: 11, snapshotId: 50 });
    const data = (prisma.financialPlanningGuidanceRecord.create as jest.Mock).mock.calls[0][0].data;

    expect(() => __private__.serializeRecord({
      id: 81,
      ...data,
      contentHash: '0'.repeat(64),
      createdAt: new Date('2026-09-18T12:00:01.000Z')
    } as any)).toThrow(expect.objectContaining({
      code: 'FINANCIAL_PLANNING_GUIDANCE_INTEGRITY_CONFLICT',
      statusCode: 409
    }));
  });

  it('keeps a legacy saved record readable without inventing an evaluation', async () => {
    mockGuidanceResponse(validGuidance);
    await FinancialPlanningGuidanceService.generate({ companyId: 7, userId: 11, snapshotId: 50 });
    const data = (prisma.financialPlanningGuidanceRecord.create as jest.Mock).mock.calls[0][0].data;
    const legacyHash = __private__.buildLegacyContentHash({
      snapshotId: data.snapshotId,
      provider: data.provider,
      providerResponseId: data.providerResponseId,
      model: data.model,
      promptVersion: 'financial-guidance-v1',
      guidanceMethodologyVersion: data.guidanceMethodologyVersion,
      evidenceMethodologyVersion: data.evidenceMethodologyVersion,
      recommendationMethodologyVersion: data.recommendationMethodologyVersion,
      inputHash: data.inputHash,
      guidance: data.guidance,
      latencyMs: data.latencyMs,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.totalTokens,
      usedFallbackModel: data.usedFallbackModel,
      generatedAt: data.generatedAt.toISOString()
    });

    const serialized = __private__.serializeRecord({
      id: 80,
      ...data,
      promptVersion: 'financial-guidance-v1',
      evaluationMethodologyVersion: null,
      evaluationScore: null,
      evaluation: null,
      contentHash: legacyHash,
      createdAt: new Date('2026-09-18T12:00:01.000Z')
    } as any);

    expect(serialized).toMatchObject({
      recordId: 80,
      telemetry: { promptVersion: 'financial-guidance-v1' }
    });
    expect(serialized.evaluation).toBeUndefined();
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
    expect(prisma.financialPlanningGuidanceRecord.create).not.toHaveBeenCalled();
    expect(metrics.observeFinancialPlanningGuidance).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'evaluation_invalid' })
    );
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
    expect(prisma.financialPlanningGuidanceRecord.create).not.toHaveBeenCalled();
    expect(metrics.observeFinancialPlanningGuidance).toHaveBeenCalledWith(
      expect.objectContaining({
        promptVersion: 'financial-guidance-v2',
        outcome: 'unavailable'
      })
    );
  });
});
