import { createHash } from 'crypto';
import { z } from 'zod';
import {
  LEGACY_OPENAI_MODEL_FALLBACK,
  resolveOpenAiModel,
  shouldRetryWithLegacyOpenAiModel
} from '../constants/openai';
import FinancialPlanningAnalysisService, {
  FinancialPlanningAnalysisError
} from './financial-planning-analysis.service';
import OpenAiIntegrationService from './openai-integration.service';

export const FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION = 'financial-guidance-v1';

const guidancePayloadSchema = z.object({
  headline: z.string().trim().min(5).max(100),
  summary: z.string().trim().min(10).max(800),
  priorities: z.array(
    z.object({
      findingId: z.string().trim().min(1),
      title: z.string().trim().min(3).max(100),
      explanation: z.string().trim().min(10).max(500),
      nextStep: z.string().trim().min(5).max(300)
    })
  ).min(1).max(3),
  scenarioComparison: z.object({
    scenarioId: z.enum(['NONE', 'PRESERVE_PRIORITIES', 'BALANCED']),
    explanation: z.string().trim().min(10).max(500)
  }),
  cautions: z.array(
    z.object({
      findingId: z.string().trim().min(1).nullable(),
      message: z.string().trim().min(5).max(300)
    })
  ).max(3),
  referenceIds: z.array(z.string().trim().min(1)).min(1).max(4)
});

export type FinancialPlanningGuidancePayload = z.infer<typeof guidancePayloadSchema>;

const GUIDANCE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    priorities: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          findingId: { type: 'string' },
          title: { type: 'string' },
          explanation: { type: 'string' },
          nextStep: { type: 'string' }
        },
        required: ['findingId', 'title', 'explanation', 'nextStep']
      }
    },
    scenarioComparison: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scenarioId: {
          type: 'string',
          enum: ['NONE', 'PRESERVE_PRIORITIES', 'BALANCED']
        },
        explanation: { type: 'string' }
      },
      required: ['scenarioId', 'explanation']
    },
    cautions: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          findingId: { type: ['string', 'null'] },
          message: { type: 'string' }
        },
        required: ['findingId', 'message']
      }
    },
    referenceIds: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: { type: 'string' }
    }
  },
  required: [
    'headline',
    'summary',
    'priorities',
    'scenarioComparison',
    'cautions',
    'referenceIds'
  ]
};

type ResponsesApiResult = {
  ok: boolean;
  status: number;
  raw: string;
  parsed: any;
};

function parseJsonSafe(raw: string | null | undefined): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractOutputText(parsed: any): string {
  if (typeof parsed?.output_text === 'string' && parsed.output_text.trim()) {
    return parsed.output_text.trim();
  }
  const output = Array.isArray(parsed?.output) ? parsed.output : [];
  for (const item of output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content?.text === 'string' && content.text.trim()) {
        return content.text.trim();
      }
    }
  }
  return '';
}

function buildInstructions(): string {
  return [
    'Voce explica um retrato financeiro pessoal usando exclusivamente o pacote estruturado recebido.',
    'Os calculos, severidades e cenarios ja foram determinados pelo Zenit e nao podem ser refeitos ou contestados.',
    'Nao introduza numeros, percentuais, datas, quantidades, metas ou valores monetarios no texto.',
    'Nao invente fatos, referencias, achados ou cenarios.',
    'Cite somente findingId e referenceIds existentes no pacote.',
    'Nao apresente regras universais de gasto, garantias de resultado ou aconselhamento de investimento.',
    'Priorize os achados mais relevantes, explique os tradeoffs e proponha proximos passos revisaveis.',
    'Se os cenarios nao forem suficientes ou a qualidade dos dados exigir cautela, diga isso claramente.',
    'Responda em portugues do Brasil, com linguagem direta, respeitosa e sem alarmismo.'
  ].join(' ');
}

function narrativeTexts(payload: FinancialPlanningGuidancePayload): string[] {
  return [
    payload.headline,
    payload.summary,
    payload.scenarioComparison.explanation,
    ...payload.priorities.flatMap((priority) => [
      priority.title,
      priority.explanation,
      priority.nextStep
    ]),
    ...payload.cautions.map((caution) => caution.message)
  ];
}

function validateGrounding(params: {
  payload: FinancialPlanningGuidancePayload;
  evidence: {
    findings: Array<{ id: string; referenceIds: string[] }>;
    references: Array<{ id: string }>;
  };
  scenarios: Array<{ id: string }>;
  targetAlreadyMet: boolean;
}) {
  if (narrativeTexts(params.payload).some((text) => /\d/.test(text))) {
    throw new Error('A explicação da IA introduziu números fora da camada determinística');
  }

  const findingById = new Map(params.evidence.findings.map((finding) => [finding.id, finding]));
  const citedFindingIds = new Set([
    ...params.payload.priorities.map((priority) => priority.findingId),
    ...params.payload.cautions.flatMap((caution) => caution.findingId ? [caution.findingId] : [])
  ]);
  if (Array.from(citedFindingIds).some((id) => !findingById.has(id))) {
    throw new Error('A explicação da IA citou um achado inexistente');
  }

  const existingReferenceIds = new Set(params.evidence.references.map((reference) => reference.id));
  const groundedReferenceIds = new Set(
    Array.from(citedFindingIds).flatMap((id) => findingById.get(id)?.referenceIds ?? [])
  );
  if (
    params.payload.referenceIds.some(
      (id) => !existingReferenceIds.has(id) || !groundedReferenceIds.has(id)
    )
  ) {
    throw new Error('A explicação da IA citou uma referência sem vínculo com os achados utilizados');
  }

  const scenarioId = params.payload.scenarioComparison.scenarioId;
  if (params.targetAlreadyMet && scenarioId !== 'NONE') {
    throw new Error('A explicação da IA escolheu um cenário quando a meta já está atendida');
  }
  if (
    scenarioId !== 'NONE' &&
    !params.scenarios.some((scenario) => scenario.id === scenarioId)
  ) {
    throw new Error('A explicação da IA citou um cenário inexistente');
  }
}

function safeUserIdentifier(userId: number): string {
  return createHash('sha256').update(`zenit-financial-guidance:${userId}`).digest('hex');
}

async function requestGuidance(params: {
  apiKey: string;
  model: string;
  userId: number;
  input: unknown;
}): Promise<ResponsesApiResult> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: params.model,
      instructions: buildInstructions(),
      input: JSON.stringify(params.input),
      store: false,
      tools: [],
      tool_choice: 'none',
      max_output_tokens: 1600,
      safety_identifier: safeUserIdentifier(params.userId),
      text: {
        format: {
          type: 'json_schema',
          name: 'financial_planning_guidance',
          strict: true,
          schema: GUIDANCE_JSON_SCHEMA
        }
      }
    })
  });
  const raw = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    raw,
    parsed: parseJsonSafe(raw)
  };
}

export default class FinancialPlanningGuidanceService {
  static async generate(params: { userId: number; companyId: number; snapshotId: number }) {
    const startedAt = Date.now();
    const scenarioResult = await FinancialPlanningAnalysisService.getScenarios(params);
    const evidence = scenarioResult.guidanceEvidence;
    let credential;
    try {
      credential = await OpenAiIntegrationService.getDecryptedCredential(params.companyId, true);
    } catch {
      throw new FinancialPlanningAnalysisError(
        'A explicação por IA não está disponível neste workspace',
        'FINANCIAL_PLANNING_AI_UNAVAILABLE',
        503
      );
    }

    const input = {
      objective: {
        kind: 'MONTHLY_SAVINGS',
        status: scenarioResult.status
      },
      evidence,
      scenarios: scenarioResult.scenarios.map((scenario) => ({
        id: scenario.id,
        label: scenario.label,
        feasibility: scenario.feasibility,
        findingIds: scenario.adjustments.length > 0 ? ['ADJUSTMENT_CAPACITY'] : [],
        assumptions: scenario.assumptions,
        warnings: scenario.warnings
      }))
    };
    let selectedModel = resolveOpenAiModel(credential.model);
    let usedFallbackModel = false;
    let response: ResponsesApiResult;
    try {
      response = await requestGuidance({
        apiKey: credential.apiKey,
        model: selectedModel,
        userId: params.userId,
        input
      });
      if (
        !response.ok &&
        shouldRetryWithLegacyOpenAiModel(selectedModel, response.status, response.raw)
      ) {
        selectedModel = LEGACY_OPENAI_MODEL_FALLBACK;
        usedFallbackModel = true;
        response = await requestGuidance({
          apiKey: credential.apiKey,
          model: selectedModel,
          userId: params.userId,
          input
        });
      }
    } catch {
      throw new FinancialPlanningAnalysisError(
        'Não foi possível consultar a IA agora. Tente novamente mais tarde',
        'FINANCIAL_PLANNING_AI_PROVIDER_ERROR',
        502
      );
    }

    if (!response.ok) {
      throw new FinancialPlanningAnalysisError(
        'Não foi possível consultar a IA agora. Tente novamente mais tarde',
        'FINANCIAL_PLANNING_AI_PROVIDER_ERROR',
        502
      );
    }

    const parsedPayload = guidancePayloadSchema.safeParse(
      parseJsonSafe(extractOutputText(response.parsed))
    );
    if (!parsedPayload.success) {
      throw new FinancialPlanningAnalysisError(
        'A IA não devolveu uma explicação segura para esta análise',
        'FINANCIAL_PLANNING_AI_INVALID_RESPONSE',
        502
      );
    }
    try {
      validateGrounding({
        payload: parsedPayload.data,
        evidence,
        scenarios: scenarioResult.scenarios,
        targetAlreadyMet: scenarioResult.status === 'TARGET_ALREADY_MET'
      });
    } catch {
      throw new FinancialPlanningAnalysisError(
        'A IA não devolveu uma explicação segura para esta análise',
        'FINANCIAL_PLANNING_AI_INVALID_RESPONSE',
        502
      );
    }

    return {
      snapshot: scenarioResult.snapshot,
      evidenceMethodologyVersion: evidence.methodologyVersion,
      recommendationMethodologyVersion: scenarioResult.recommendationMethodologyVersion,
      guidanceMethodologyVersion: 1,
      guidance: parsedPayload.data,
      telemetry: {
        provider: 'OPENAI' as const,
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        latencyMs: Date.now() - startedAt,
        usedFallbackModel: usedFallbackModel || undefined
      },
      generatedAt: new Date().toISOString()
    };
  }
}

export const __private__ = {
  GUIDANCE_JSON_SCHEMA,
  buildInstructions,
  extractOutputText,
  validateGrounding
};
