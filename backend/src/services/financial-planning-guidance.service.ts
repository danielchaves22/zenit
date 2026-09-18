import { AiProvider, FinancialPlanningGuidanceRecord, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';
import {
  LEGACY_OPENAI_MODEL_FALLBACK,
  resolveOpenAiModel,
  shouldRetryWithLegacyOpenAiModel
} from '../constants/openai';
import FinancialPlanningAnalysisService, {
  FinancialPlanningAnalysisError
} from './financial-planning-analysis.service';
import OpenAiIntegrationService from './openai-integration.service';
import { hashCanonicalPayload } from '../utils/canonical-hash';
import { logger } from '../logger';
import { observeFinancialPlanningGuidance } from '../metrics';
import {
  evaluateFinancialPlanningGuidance,
  financialPlanningGuidanceEvaluationSchema,
  FinancialPlanningGuidanceEvaluation
} from '../utils/financial-planning-guidance-evaluation';

export const FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION = 'financial-guidance-v2';

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

type FinancialPlanningGuidanceInput = {
  snapshot: {
    id: number;
    basisHash: string | null;
    confirmedAt: string;
  };
  objective: {
    kind: 'MONTHLY_SAVINGS';
    status: 'TARGET_ALREADY_MET' | 'ADJUSTMENT_REQUIRED';
  };
  evidence: {
    methodologyVersion: number;
    findings: Array<{
      id: string;
      severity: 'POSITIVE' | 'INFORMATIONAL' | 'ATTENTION' | 'CRITICAL';
      referenceIds: string[];
    }>;
    references: Array<{ id: string }>;
    limitations: string[];
  } & Record<string, unknown>;
  scenarios: Array<{
    id: string;
    label: string;
    feasibility: string;
    findingIds: string[];
    assumptions: string[];
    warnings: string[];
  }>;
};

function optionalTokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

type LegacyContentHashParams = {
  snapshotId: number;
  provider: AiProvider;
  providerResponseId: string | null;
  model: string;
  promptVersion: string;
  guidanceMethodologyVersion: number;
  evidenceMethodologyVersion: number;
  recommendationMethodologyVersion: number;
  inputHash: string;
  guidance: FinancialPlanningGuidancePayload;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  usedFallbackModel: boolean;
  generatedAt: string;
};

function buildLegacyContentHash(params: LegacyContentHashParams): string {
  return hashCanonicalPayload(params);
}

function buildContentHash(
  params: LegacyContentHashParams & {
    evaluationMethodologyVersion: number;
    evaluationScore: number;
    evaluation: FinancialPlanningGuidanceEvaluation;
  }
): string {
  return hashCanonicalPayload(params);
}

function invalidPersistedGuidance(): never {
  throw new FinancialPlanningAnalysisError(
    'O parecer financeiro salvo não passou na verificação de integridade',
    'FINANCIAL_PLANNING_GUIDANCE_INTEGRITY_CONFLICT',
    409
  );
}

function serializeRecord(record: FinancialPlanningGuidanceRecord) {
  const input = record.inputSnapshot as unknown as FinancialPlanningGuidanceInput;
  const parsedGuidance = guidancePayloadSchema.safeParse(record.guidance);
  if (
    !input ||
    typeof input !== 'object' ||
    !input.snapshot ||
    input.snapshot.id !== record.snapshotId ||
    !input.evidence ||
    !Array.isArray(input.evidence.findings) ||
    !Array.isArray(input.evidence.references) ||
    !Array.isArray(input.scenarios) ||
    !parsedGuidance.success
  ) {
    return invalidPersistedGuidance();
  }
  const inputHash = hashCanonicalPayload(input);
  const generatedAt = record.generatedAt.toISOString();
  const legacyHashParams: LegacyContentHashParams = {
    snapshotId: record.snapshotId,
    provider: record.provider,
    providerResponseId: record.providerResponseId,
    model: record.model,
    promptVersion: record.promptVersion,
    guidanceMethodologyVersion: record.guidanceMethodologyVersion,
    evidenceMethodologyVersion: record.evidenceMethodologyVersion,
    recommendationMethodologyVersion: record.recommendationMethodologyVersion,
    inputHash,
    guidance: parsedGuidance.data,
    latencyMs: record.latencyMs,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    usedFallbackModel: record.usedFallbackModel,
    generatedAt
  };
  const evaluationFields = [
    record.evaluationMethodologyVersion,
    record.evaluationScore,
    record.evaluation
  ];
  const hasEvaluation = evaluationFields.every((value) => value !== null);
  const hasPartialEvaluation = evaluationFields.some((value) => value !== null) && !hasEvaluation;
  let evaluation: FinancialPlanningGuidanceEvaluation | undefined;
  let contentHash: string;
  if (hasPartialEvaluation) return invalidPersistedGuidance();
  if (hasEvaluation) {
    const parsedEvaluation = financialPlanningGuidanceEvaluationSchema.safeParse(record.evaluation);
    if (
      !parsedEvaluation.success ||
      !parsedEvaluation.data.passed ||
      parsedEvaluation.data.methodologyVersion !== record.evaluationMethodologyVersion ||
      parsedEvaluation.data.score !== record.evaluationScore
    ) {
      return invalidPersistedGuidance();
    }
    const recalculatedEvaluation = evaluateFinancialPlanningGuidance({
      payload: parsedGuidance.data,
      evidence: input.evidence,
      scenarios: input.scenarios,
      targetAlreadyMet: input.objective.status === 'TARGET_ALREADY_MET'
    });
    if (
      hashCanonicalPayload(recalculatedEvaluation) !== hashCanonicalPayload(parsedEvaluation.data)
    ) {
      return invalidPersistedGuidance();
    }
    evaluation = parsedEvaluation.data;
    contentHash = buildContentHash({
      ...legacyHashParams,
      evaluationMethodologyVersion: record.evaluationMethodologyVersion!,
      evaluationScore: record.evaluationScore!,
      evaluation
    });
  } else {
    contentHash = buildLegacyContentHash(legacyHashParams);
  }
  if (inputHash !== record.inputHash || contentHash !== record.contentHash) {
    return invalidPersistedGuidance();
  }

  const hasUsage = [record.inputTokens, record.outputTokens, record.totalTokens].some(
    (value) => value !== null
  );
  return {
    recordId: record.id,
    snapshot: input.snapshot,
    evidenceMethodologyVersion: record.evidenceMethodologyVersion,
    recommendationMethodologyVersion: record.recommendationMethodologyVersion,
    guidanceMethodologyVersion: record.guidanceMethodologyVersion,
    evaluation,
    guidanceEvidence: input.evidence,
    scenarioContext: input.scenarios,
    guidance: parsedGuidance.data,
    telemetry: {
      provider: record.provider,
      model: record.model,
      promptVersion: record.promptVersion,
      latencyMs: record.latencyMs,
      providerResponseId: record.providerResponseId ?? undefined,
      usedFallbackModel: record.usedFallbackModel || undefined,
      usage: hasUsage
        ? {
            inputTokens: record.inputTokens,
            outputTokens: record.outputTokens,
            totalTokens: record.totalTokens
          }
        : undefined
    },
    audit: {
      createdByUserId: record.createdByUserId ?? null,
      inputHash: record.inputHash,
      contentHash: record.contentHash
    },
    generatedAt
  };
}

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
    'Voce explica um retrato financeiro usando exclusivamente o pacote estruturado recebido.',
    'Os calculos, severidades e cenarios ja foram determinados pelo Zenit e nao podem ser refeitos ou contestados.',
    'Nao introduza numeros, percentuais, datas, quantidades, metas ou valores monetarios no texto.',
    'Nao invente fatos, referencias, achados ou cenarios.',
    'Cite somente findingId e referenceIds existentes no pacote.',
    'Nao apresente regras universais de gasto, garantias de resultado ou aconselhamento de investimento.',
    'Priorize os achados mais relevantes, explique os tradeoffs e proponha proximos passos revisaveis.',
    'Cubra ao menos um dos achados com maior severidade no pacote.',
    'Quando DATA_QUALITY estiver em ATTENTION, cite esse achado em priorities ou cautions.',
    'Se os cenarios nao forem suficientes ou a qualidade dos dados exigir cautela, diga isso claramente.',
    'Responda em portugues do Brasil, com linguagem direta, respeitosa e sem alarmismo.'
  ].join(' ');
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
  static async list(params: {
    userId: number;
    companyId: number;
    snapshotId: number;
    cursor?: number;
    limit: number;
  }) {
    await FinancialPlanningAnalysisService.getSnapshot(params);
    const found = await prisma.financialPlanningGuidanceRecord.findMany({
      where: {
        snapshotId: params.snapshotId,
        companyId: params.companyId,
        ...(params.cursor ? { id: { lt: params.cursor } } : {})
      },
      orderBy: { id: 'desc' },
      take: params.limit + 1
    });
    const hasMore = found.length > params.limit;
    const records = found.slice(0, params.limit);
    return {
      items: records.map(serializeRecord),
      nextCursor: hasMore ? records[records.length - 1]!.id : null
    };
  }

  static async generate(params: { userId: number; companyId: number; snapshotId: number }) {
    const startedAt = Date.now();
    const scenarioResult = await FinancialPlanningAnalysisService.getScenarios(params);
    const evidence = scenarioResult.guidanceEvidence;
    let credential;
    try {
      credential = await OpenAiIntegrationService.getDecryptedCredential(params.companyId, true);
    } catch {
      observeFinancialPlanningGuidance({
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        outcome: 'unavailable',
        durationMs: Date.now() - startedAt
      });
      throw new FinancialPlanningAnalysisError(
        'A explicação por IA não está disponível neste workspace',
        'FINANCIAL_PLANNING_AI_UNAVAILABLE',
        503
      );
    }

    const input: FinancialPlanningGuidanceInput = {
      snapshot: scenarioResult.snapshot,
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
      observeFinancialPlanningGuidance({
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        outcome: 'provider_error',
        usedFallbackModel,
        durationMs: Date.now() - startedAt
      });
      throw new FinancialPlanningAnalysisError(
        'Não foi possível consultar a IA agora. Tente novamente mais tarde',
        'FINANCIAL_PLANNING_AI_PROVIDER_ERROR',
        502
      );
    }

    if (!response.ok) {
      observeFinancialPlanningGuidance({
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        outcome: 'provider_error',
        usedFallbackModel,
        durationMs: Date.now() - startedAt
      });
      throw new FinancialPlanningAnalysisError(
        'Não foi possível consultar a IA agora. Tente novamente mais tarde',
        'FINANCIAL_PLANNING_AI_PROVIDER_ERROR',
        502
      );
    }

    const usage = response.parsed?.usage;
    const inputTokens = optionalTokenCount(usage?.input_tokens);
    const outputTokens = optionalTokenCount(usage?.output_tokens);
    const totalTokens = optionalTokenCount(usage?.total_tokens);
    const parsedPayload = guidancePayloadSchema.safeParse(
      parseJsonSafe(extractOutputText(response.parsed))
    );
    if (!parsedPayload.success) {
      observeFinancialPlanningGuidance({
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        outcome: 'schema_invalid',
        usedFallbackModel,
        durationMs: Date.now() - startedAt,
        inputTokens,
        outputTokens,
        totalTokens
      });
      throw new FinancialPlanningAnalysisError(
        'A IA não devolveu uma explicação segura para esta análise',
        'FINANCIAL_PLANNING_AI_INVALID_RESPONSE',
        502
      );
    }
    const evaluation = evaluateFinancialPlanningGuidance({
      payload: parsedPayload.data,
      evidence,
      scenarios: scenarioResult.scenarios,
      targetAlreadyMet: scenarioResult.status === 'TARGET_ALREADY_MET'
    });
    if (!evaluation.passed) {
      const failedChecks = evaluation.checks
        .filter((item) => !item.passed)
        .map((item) => item.id);
      logger.warn('Financial planning guidance failed deterministic evaluation', {
        snapshotId: params.snapshotId,
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        evaluationMethodologyVersion: evaluation.methodologyVersion,
        evaluationScore: evaluation.score,
        failedChecks
      });
      observeFinancialPlanningGuidance({
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        outcome: 'evaluation_invalid',
        usedFallbackModel,
        durationMs: Date.now() - startedAt,
        evaluationScore: evaluation.score,
        inputTokens,
        outputTokens,
        totalTokens
      });
      throw new FinancialPlanningAnalysisError(
        'A IA não devolveu uma explicação segura para esta análise',
        'FINANCIAL_PLANNING_AI_INVALID_RESPONSE',
        502
      );
    }

    const generatedAt = new Date();
    const providerResponseId =
      typeof response.parsed?.id === 'string' && response.parsed.id.length <= 180
        ? response.parsed.id
        : null;
    const latencyMs = Date.now() - startedAt;
    const inputHash = hashCanonicalPayload(input);
    const contentHash = buildContentHash({
      snapshotId: params.snapshotId,
      provider: AiProvider.OPENAI,
      providerResponseId,
      model: selectedModel,
      promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
      guidanceMethodologyVersion: 1,
      evidenceMethodologyVersion: evidence.methodologyVersion,
      recommendationMethodologyVersion: scenarioResult.recommendationMethodologyVersion,
      evaluationMethodologyVersion: evaluation.methodologyVersion,
      evaluationScore: evaluation.score,
      inputHash,
      guidance: parsedPayload.data,
      evaluation,
      latencyMs,
      inputTokens,
      outputTokens,
      totalTokens,
      usedFallbackModel,
      generatedAt: generatedAt.toISOString()
    });

    try {
      const record = await prisma.financialPlanningGuidanceRecord.create({
        data: {
          snapshotId: params.snapshotId,
          createdByUserId: params.userId,
          companyId: params.companyId,
          provider: AiProvider.OPENAI,
          providerResponseId,
          model: selectedModel,
          promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
          guidanceMethodologyVersion: 1,
          evidenceMethodologyVersion: evidence.methodologyVersion,
          recommendationMethodologyVersion: scenarioResult.recommendationMethodologyVersion,
          evaluationMethodologyVersion: evaluation.methodologyVersion,
          evaluationScore: evaluation.score,
          inputHash,
          contentHash,
          inputSnapshot: input as unknown as Prisma.InputJsonValue,
          guidance: parsedPayload.data as Prisma.InputJsonValue,
          evaluation: evaluation as Prisma.InputJsonValue,
          latencyMs,
          inputTokens,
          outputTokens,
          totalTokens,
          usedFallbackModel,
          generatedAt
        }
      });
      const serialized = serializeRecord(record);
      observeFinancialPlanningGuidance({
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        outcome: 'success',
        usedFallbackModel,
        durationMs: Date.now() - startedAt,
        evaluationScore: evaluation.score,
        inputTokens,
        outputTokens,
        totalTokens
      });
      logger.info('Financial planning guidance generated and evaluated', {
        recordId: record.id,
        snapshotId: params.snapshotId,
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        evaluationMethodologyVersion: evaluation.methodologyVersion,
        evaluationScore: evaluation.score,
        latencyMs,
        usedFallbackModel
      });
      return serialized;
    } catch (error) {
      observeFinancialPlanningGuidance({
        model: selectedModel,
        promptVersion: FINANCIAL_PLANNING_GUIDANCE_PROMPT_VERSION,
        outcome: 'persistence_error',
        usedFallbackModel,
        durationMs: Date.now() - startedAt,
        evaluationScore: evaluation.score,
        inputTokens,
        outputTokens,
        totalTokens
      });
      if (error instanceof FinancialPlanningAnalysisError) throw error;
      throw new FinancialPlanningAnalysisError(
        'O parecer foi validado, mas não pôde ser salvo com segurança',
        'FINANCIAL_PLANNING_GUIDANCE_PERSISTENCE_ERROR',
        500
      );
    }
  }
}

export const __private__ = {
  GUIDANCE_JSON_SCHEMA,
  buildInstructions,
  buildLegacyContentHash,
  buildContentHash,
  extractOutputText,
  serializeRecord
};
