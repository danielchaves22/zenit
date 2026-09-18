export const FINANCIAL_PLANNING_GUIDANCE_EVALUATION_CASESET_VERSION = 1;

export const baseEvaluationEvidence = {
  findings: [
    {
      id: 'GOAL_FIT',
      severity: 'ATTENTION' as const,
      referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
    },
    {
      id: 'ADJUSTMENT_CAPACITY',
      severity: 'POSITIVE' as const,
      referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
    },
    {
      id: 'DATA_QUALITY',
      severity: 'POSITIVE' as const,
      referenceIds: ['OECD_INFE_2023']
    }
  ],
  references: [
    { id: 'CAIXA_ORCAMENTO_PRATICO' },
    { id: 'OECD_INFE_2023' }
  ]
};

export const baseEvaluationPayload = {
  headline: 'A meta pede uma escolha consciente',
  summary: 'A base mostra espaço para ajuste sem substituir sua decisão pessoal.',
  priorities: [
    {
      findingId: 'GOAL_FIT',
      title: 'Revise as escolhas flexíveis',
      explanation: 'A diferença pode ser trabalhada nas categorias declaradas como flexíveis.',
      nextStep: 'Confira se o cenário continua adequado para sua rotina.'
    }
  ],
  scenarioComparison: {
    scenarioId: 'PRESERVE_PRIORITIES',
    explanation: 'O cenário concentra o esforço nas escolhas com maior liberdade de ajuste.'
  },
  cautions: [
    {
      findingId: 'GOAL_FIT',
      message: 'A proposta depende da manutenção da base financeira confirmada.'
    }
  ],
  referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
};

export const passingEvaluationCases = [
  {
    name: 'meta que exige ajuste com cenário fundamentado',
    params: {
      payload: baseEvaluationPayload,
      evidence: baseEvaluationEvidence,
      scenarios: [{ id: 'PRESERVE_PRIORITIES' }, { id: 'BALANCED' }],
      targetAlreadyMet: false
    }
  },
  {
    name: 'meta já atendida sem escolher um cenário de corte',
    params: {
      payload: {
        ...baseEvaluationPayload,
        priorities: [
          {
            ...baseEvaluationPayload.priorities[0],
            findingId: 'GOAL_FIT'
          }
        ],
        scenarioComparison: {
          scenarioId: 'NONE',
          explanation: 'A leitura confirma que a meta cabe na base financeira selecionada.'
        }
      },
      evidence: {
        ...baseEvaluationEvidence,
        findings: [
          {
            id: 'GOAL_FIT',
            severity: 'POSITIVE' as const,
            referenceIds: ['CAIXA_ORCAMENTO_PRATICO']
          },
          baseEvaluationEvidence.findings[2]
        ]
      },
      scenarios: [],
      targetAlreadyMet: true
    }
  },
  {
    name: 'base incompleta com cautela explícita sobre qualidade',
    params: {
      payload: {
        ...baseEvaluationPayload,
        cautions: [
          ...baseEvaluationPayload.cautions,
          {
            findingId: 'DATA_QUALITY',
            message: 'A cobertura disponível exige cautela antes de transformar a leitura em decisão.'
          }
        ]
      },
      evidence: {
        ...baseEvaluationEvidence,
        findings: baseEvaluationEvidence.findings.map((finding) =>
          finding.id === 'DATA_QUALITY'
            ? { ...finding, severity: 'ATTENTION' as const }
            : finding
        )
      },
      scenarios: [{ id: 'PRESERVE_PRIORITIES' }],
      targetAlreadyMet: false
    }
  }
] as const;

export const failingEvaluationCases = [
  {
    name: 'número sem suporte determinístico',
    expectedCheckId: 'NO_UNSUPPORTED_NUMBERS',
    payload: { ...baseEvaluationPayload, summary: 'Reduza dez por cento para atingir a meta.' }
  },
  {
    name: 'achado inexistente',
    expectedCheckId: 'KNOWN_FINDINGS',
    payload: {
      ...baseEvaluationPayload,
      priorities: [{ ...baseEvaluationPayload.priorities[0], findingId: 'INVENTED_FINDING' }],
      cautions: []
    }
  },
  {
    name: 'referência sem vínculo',
    expectedCheckId: 'GROUNDED_REFERENCES',
    payload: { ...baseEvaluationPayload, referenceIds: ['OECD_INFE_2023'] }
  },
  {
    name: 'cenário inexistente',
    expectedCheckId: 'GROUNDED_SCENARIO',
    payload: {
      ...baseEvaluationPayload,
      scenarioComparison: {
        scenarioId: 'UNKNOWN_SCENARIO',
        explanation: baseEvaluationPayload.scenarioComparison.explanation
      }
    }
  },
  {
    name: 'achado mais importante ignorado',
    expectedCheckId: 'IMPORTANT_FINDING_COVERAGE',
    payload: {
      ...baseEvaluationPayload,
      priorities: [
        { ...baseEvaluationPayload.priorities[0], findingId: 'ADJUSTMENT_CAPACITY' }
      ],
      cautions: []
    }
  }
] as const;
