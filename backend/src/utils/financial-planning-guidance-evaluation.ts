import { z } from 'zod';

export const FINANCIAL_PLANNING_GUIDANCE_EVALUATION_VERSION = 1;

export const financialPlanningGuidanceEvaluationCheckIdSchema = z.enum([
  'NO_UNSUPPORTED_NUMBERS',
  'KNOWN_FINDINGS',
  'GROUNDED_REFERENCES',
  'GROUNDED_SCENARIO',
  'IMPORTANT_FINDING_COVERAGE',
  'DATA_QUALITY_CAUTION'
]);

export const financialPlanningGuidanceEvaluationSchema = z.object({
  methodologyVersion: z.number().int().positive(),
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  checks: z.array(z.object({
    id: financialPlanningGuidanceEvaluationCheckIdSchema,
    passed: z.boolean(),
    weight: z.number().int().positive(),
    message: z.string().min(1)
  }).strict()).length(6)
}).strict();

export type FinancialPlanningGuidanceEvaluation = z.infer<
  typeof financialPlanningGuidanceEvaluationSchema
>;

type GuidancePayload = {
  headline: string;
  summary: string;
  priorities: ReadonlyArray<{
    findingId: string;
    title: string;
    explanation: string;
    nextStep: string;
  }>;
  scenarioComparison: { scenarioId: string; explanation: string };
  cautions: ReadonlyArray<{ findingId: string | null; message: string }>;
  referenceIds: ReadonlyArray<string>;
};

type GuidanceFinding = {
  id: string;
  severity: 'POSITIVE' | 'INFORMATIONAL' | 'ATTENTION' | 'CRITICAL';
  referenceIds: ReadonlyArray<string>;
};

type GuidanceEvidence = {
  findings: ReadonlyArray<GuidanceFinding>;
  references: ReadonlyArray<{ id: string }>;
};

type EvaluationCheck = FinancialPlanningGuidanceEvaluation['checks'][number];

const SEVERITY_WEIGHT: Record<GuidanceFinding['severity'], number> = {
  CRITICAL: 4,
  ATTENTION: 3,
  POSITIVE: 2,
  INFORMATIONAL: 1
};

const UNSUPPORTED_NUMBER_PATTERN = /\d|(?:^|[\s(])(zero|dois|duas|tr[eê]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil|milh[aã]o|milh[oõ]es|metade|dobro|triplo)(?=$|[\s),.;:%])/iu;

function narrativeTexts(payload: GuidancePayload): string[] {
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

function check(
  id: EvaluationCheck['id'],
  passed: boolean,
  weight: number,
  successMessage: string,
  failureMessage: string
): EvaluationCheck {
  return { id, passed, weight, message: passed ? successMessage : failureMessage };
}

export function evaluateFinancialPlanningGuidance(params: {
  payload: GuidancePayload;
  evidence: GuidanceEvidence;
  scenarios: ReadonlyArray<{ id: string }>;
  targetAlreadyMet: boolean;
}): FinancialPlanningGuidanceEvaluation {
  const findingById = new Map(params.evidence.findings.map((finding) => [finding.id, finding]));
  const existingReferenceIds = new Set(params.evidence.references.map((reference) => reference.id));
  const citedFindingIds = new Set([
    ...params.payload.priorities.map((priority) => priority.findingId),
    ...params.payload.cautions.flatMap((caution) => caution.findingId ? [caution.findingId] : [])
  ]);
  const citedFindingsAreKnown = Array.from(citedFindingIds).every((id) => findingById.has(id));
  const groundedReferenceIds = new Set(
    Array.from(citedFindingIds).flatMap((id) => findingById.get(id)?.referenceIds ?? [])
  );
  const referencesAreGrounded = params.payload.referenceIds.every(
    (id) => existingReferenceIds.has(id) && groundedReferenceIds.has(id)
  );
  const scenarioId = params.payload.scenarioComparison.scenarioId;
  const scenarioIsGrounded = params.targetAlreadyMet
    ? scenarioId === 'NONE'
    : scenarioId === 'NONE' || params.scenarios.some((scenario) => scenario.id === scenarioId);
  const highestSeverity = Math.max(
    ...params.evidence.findings.map((finding) => SEVERITY_WEIGHT[finding.severity]),
    0
  );
  const importantFindingIsCovered = params.evidence.findings.some(
    (finding) => SEVERITY_WEIGHT[finding.severity] === highestSeverity && citedFindingIds.has(finding.id)
  );
  const dataQualityFinding = findingById.get('DATA_QUALITY');
  const dataQualityCautionIsCovered =
    !dataQualityFinding ||
    dataQualityFinding.severity !== 'ATTENTION' ||
    citedFindingIds.has(dataQualityFinding.id);

  const checks: EvaluationCheck[] = [
    check(
      'NO_UNSUPPORTED_NUMBERS',
      narrativeTexts(params.payload).every((text) => !UNSUPPORTED_NUMBER_PATTERN.test(text)),
      20,
      'A narrativa não introduz números fora da camada determinística.',
      'A narrativa introduz números que não podem ser auditados pelo pacote estruturado.'
    ),
    check(
      'KNOWN_FINDINGS',
      citedFindingsAreKnown,
      15,
      'Todos os achados citados existem no pacote de evidências.',
      'O parecer cita ao menos um achado inexistente.'
    ),
    check(
      'GROUNDED_REFERENCES',
      referencesAreGrounded,
      15,
      'Todas as referências estão vinculadas aos achados utilizados.',
      'O parecer cita uma referência inexistente ou sem vínculo com os achados utilizados.'
    ),
    check(
      'GROUNDED_SCENARIO',
      scenarioIsGrounded,
      15,
      'A comparação usa um cenário compatível com o diagnóstico.',
      'A comparação usa um cenário inexistente ou incompatível com o diagnóstico.'
    ),
    check(
      'IMPORTANT_FINDING_COVERAGE',
      importantFindingIsCovered,
      20,
      'O parecer cobre ao menos um dos achados de maior severidade.',
      'O parecer ignora todos os achados de maior severidade.'
    ),
    check(
      'DATA_QUALITY_CAUTION',
      dataQualityCautionIsCovered,
      15,
      'A qualidade dos dados recebeu a cautela exigida pela metodologia.',
      'O parecer não destaca a cautela exigida pela qualidade dos dados.'
    )
  ];
  const score = checks.reduce((total, item) => total + (item.passed ? item.weight : 0), 0);

  return {
    methodologyVersion: FINANCIAL_PLANNING_GUIDANCE_EVALUATION_VERSION,
    passed: checks.every((item) => item.passed),
    score,
    checks
  };
}
