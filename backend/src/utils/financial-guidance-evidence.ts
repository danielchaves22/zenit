import { Prisma } from '@prisma/client';
import {
  FinancialBudgetScenarioResult,
  FinancialBudgetScenarioSource
} from './financial-budget-scenario';

export const FINANCIAL_GUIDANCE_EVIDENCE_METHODOLOGY_VERSION = 1;

export type FinancialGuidanceReference = {
  id: 'BCB_CIDADANIA_FINANCEIRA' | 'CAIXA_ORCAMENTO_PRATICO' | 'CFPB_FINANCIAL_WELL_BEING' | 'OECD_INFE_2023';
  organization: string;
  title: string;
  url: string;
  purpose: string;
};

export type FinancialGuidanceEvidenceMetric = {
  key: string;
  label: string;
  value: string;
  format: 'MONEY' | 'PERCENT' | 'NUMBER';
};

export type FinancialGuidanceFinding = {
  id:
    | 'BASE_BALANCE'
    | 'GOAL_FIT'
    | 'COMMITTED_INCOME_SHARE'
    | 'VARIABLE_EXPENSE_CONCENTRATION'
    | 'ADJUSTMENT_CAPACITY'
    | 'DATA_QUALITY';
  severity: 'POSITIVE' | 'INFORMATIONAL' | 'ATTENTION' | 'CRITICAL';
  title: string;
  summary: string;
  evidence: FinancialGuidanceEvidenceMetric[];
  referenceIds: FinancialGuidanceReference['id'][];
};

export type FinancialGuidanceEvidence = {
  methodologyVersion: number;
  findings: FinancialGuidanceFinding[];
  references: FinancialGuidanceReference[];
  limitations: string[];
};

const REFERENCES: FinancialGuidanceReference[] = [
  {
    id: 'BCB_CIDADANIA_FINANCEIRA',
    organization: 'Banco Central do Brasil',
    title: 'Cidadania Financeira',
    url: 'https://www.bcb.gov.br/cidadaniafinanceira/indexcidadaniafinanceira',
    purpose: 'Decisões financeiras conscientes, equilíbrio e preparação para objetivos e imprevistos.'
  },
  {
    id: 'CAIXA_ORCAMENTO_PRATICO',
    organization: 'CAIXA',
    title: 'Fazendo seu orçamento na prática',
    url: 'https://www.caixa.gov.br/educacao-financeira/voce/orcamento-pratica/Paginas/default.aspx',
    purpose: 'Mapeamento de receitas, despesas fixas, variáveis e eventuais antes de definir objetivos.'
  },
  {
    id: 'CFPB_FINANCIAL_WELL_BEING',
    organization: 'Consumer Financial Protection Bureau',
    title: 'Financial well-being resources',
    url: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/financial-well-being-resources/',
    purpose: 'Bem-estar financeiro como controle cotidiano, resiliência, progresso em metas e liberdade de escolha.'
  },
  {
    id: 'OECD_INFE_2023',
    organization: 'OECD/INFE',
    title: '2023 International Survey of Adult Financial Literacy',
    url: 'https://www.oecd.org/en/publications/oecd-infe-2023-international-survey-of-adult-financial-literacy_56003a32-en.html',
    purpose: 'Planejamento, comportamento financeiro e acompanhamento de objetivos como dimensões da educação financeira.'
  }
];

function decimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function money(value: Prisma.Decimal | string | number): string {
  return decimal(value instanceof Prisma.Decimal ? value.toString() : value).toDecimalPlaces(2).toFixed(2);
}

function percent(numerator: Prisma.Decimal, denominator: Prisma.Decimal): string {
  if (denominator.lessThanOrEqualTo(0)) return '0.0';
  return numerator.mul(100).div(denominator).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP).toFixed(1);
}

function selectedVariableSources(sources: FinancialBudgetScenarioSource[]) {
  return sources
    .filter((source) => source.selected && source.kind === 'VARIABLE_EXPENSE')
    .map((source) => ({ source, amount: decimal(source.monthlyAmount) }))
    .filter((item) => item.amount.greaterThan(0))
    .sort((left, right) => {
      const byAmount = right.amount.comparedTo(left.amount);
      return byAmount !== 0 ? byAmount : left.source.key.localeCompare(right.source.key);
    });
}

export function buildFinancialGuidanceEvidence(input: {
  targetMonthlySavings: string;
  totals: {
    monthlyIncome: string;
    monthlyCommittedExpenses: string;
    monthlyVariableExpenses: string;
    monthlyProvisionContribution: string;
    monthlyAvailableBeforeGoal: string;
    monthlyBalanceAfterGoal: string;
  };
  dataQuality: { score: number; rating: 'HIGH' | 'MEDIUM' | 'LOW' };
  sources: FinancialBudgetScenarioSource[];
  scenarios: FinancialBudgetScenarioResult;
}): FinancialGuidanceEvidence {
  const income = decimal(input.totals.monthlyIncome);
  const committed = decimal(input.totals.monthlyCommittedExpenses).plus(
    input.totals.monthlyProvisionContribution
  );
  const availableBeforeGoal = decimal(input.totals.monthlyAvailableBeforeGoal);
  const balanceAfterGoal = decimal(input.totals.monthlyBalanceAfterGoal);
  const findings: FinancialGuidanceFinding[] = [];

  findings.push({
    id: availableBeforeGoal.isNegative() ? 'BASE_BALANCE' : 'GOAL_FIT',
    severity: availableBeforeGoal.isNegative()
      ? 'CRITICAL'
      : balanceAfterGoal.isNegative()
        ? 'ATTENTION'
        : 'POSITIVE',
    title: availableBeforeGoal.isNegative()
      ? 'A base mensal já está negativa antes da meta'
      : balanceAfterGoal.isNegative()
        ? 'A meta exige ajuste na base atual'
        : 'A meta cabe na base mensal confirmada',
    summary: availableBeforeGoal.isNegative()
      ? 'As fontes selecionadas indicam despesas superiores à renda recorrente antes de reservar o valor da meta.'
      : balanceAfterGoal.isNegative()
        ? 'Existe disponibilidade mensal, mas ela ainda é menor que a economia desejada.'
        : 'A disponibilidade estimada preserva a economia desejada sem exigir redução adicional.',
    evidence: [
      { key: 'monthlyAvailableBeforeGoal', label: 'Disponível antes da meta', value: money(availableBeforeGoal), format: 'MONEY' },
      { key: 'targetMonthlySavings', label: 'Meta mensal', value: money(input.targetMonthlySavings), format: 'MONEY' },
      { key: 'monthlyBalanceAfterGoal', label: 'Saldo depois da meta', value: money(balanceAfterGoal), format: 'MONEY' }
    ],
    referenceIds: ['CAIXA_ORCAMENTO_PRATICO', 'CFPB_FINANCIAL_WELL_BEING']
  });

  if (income.greaterThan(0)) {
    findings.push({
      id: 'COMMITTED_INCOME_SHARE',
      severity: committed.greaterThan(income) ? 'CRITICAL' : 'INFORMATIONAL',
      title: 'Parcela da renda destinada a compromissos',
      summary: `Despesas fixas, parcelas e provisões representam ${percent(committed, income)}% da renda recorrente selecionada.`,
      evidence: [
        { key: 'monthlyIncome', label: 'Renda selecionada', value: money(income), format: 'MONEY' },
        { key: 'monthlyCommittedAndProvisioned', label: 'Compromissos e provisões', value: money(committed), format: 'MONEY' },
        { key: 'committedIncomeShare', label: 'Participação na renda', value: percent(committed, income), format: 'PERCENT' }
      ],
      referenceIds: ['CAIXA_ORCAMENTO_PRATICO', 'BCB_CIDADANIA_FINANCEIRA']
    });
  }

  const variableSources = selectedVariableSources(input.sources);
  const variableTotal = variableSources.reduce(
    (total, item) => total.plus(item.amount),
    new Prisma.Decimal(0)
  );
  if (variableSources.length > 0 && variableTotal.greaterThan(0)) {
    const leading = variableSources[0]!;
    findings.push({
      id: 'VARIABLE_EXPENSE_CONCENTRATION',
      severity: 'INFORMATIONAL',
      title: 'Concentração dos gastos variáveis',
      summary: `${leading.source.label} é a maior média variável selecionada e representa ${percent(leading.amount, variableTotal)}% desse grupo.`,
      evidence: variableSources.slice(0, 3).map((item) => ({
        key: item.source.key,
        label: item.source.label,
        value: money(item.amount),
        format: 'MONEY' as const
      })),
      referenceIds: ['CAIXA_ORCAMENTO_PRATICO', 'OECD_INFE_2023']
    });
  }

  if (input.scenarios.status === 'ADJUSTMENT_REQUIRED') {
    const strongestScenario = [...input.scenarios.scenarios].sort((left, right) =>
      decimal(right.proposedReduction).comparedTo(left.proposedReduction)
    )[0];
    if (strongestScenario) {
      const remainingGap = decimal(strongestScenario.remainingGap);
      findings.push({
        id: 'ADJUSTMENT_CAPACITY',
        severity: remainingGap.isZero() ? 'POSITIVE' : 'ATTENTION',
        title: remainingGap.isZero()
          ? 'Há capacidade ajustável para atingir a meta'
          : 'Os ajustes protegidos não cobrem toda a meta',
        summary: remainingGap.isZero()
          ? 'Ao menos um cenário respeita os pisos e prioridades informados e elimina a diferença mensal.'
          : 'Mesmo o cenário com maior redução preserva uma diferença que exige revisar a meta, a renda ou outros compromissos.',
        evidence: [
          { key: 'requiredReduction', label: 'Redução necessária', value: money(input.scenarios.requiredReduction), format: 'MONEY' },
          { key: 'maximumProposedReduction', label: 'Maior redução proposta', value: money(strongestScenario.proposedReduction), format: 'MONEY' },
          { key: 'remainingGap', label: 'Diferença restante', value: money(remainingGap), format: 'MONEY' }
        ],
        referenceIds: ['CFPB_FINANCIAL_WELL_BEING', 'BCB_CIDADANIA_FINANCEIRA']
      });
    }
  }

  findings.push({
    id: 'DATA_QUALITY',
    severity: input.dataQuality.rating === 'HIGH' ? 'POSITIVE' : 'ATTENTION',
    title: input.dataQuality.rating === 'HIGH' ? 'Base com boa cobertura' : 'Interprete as conclusões com cautela',
    summary: input.dataQuality.rating === 'HIGH'
      ? 'A cobertura dos dados oferece uma base mais consistente para comparar os cenários.'
      : 'A cobertura disponível pode não representar integralmente a rotina financeira do período.',
    evidence: [
      { key: 'dataQualityScore', label: 'Qualidade dos dados', value: String(input.dataQuality.score), format: 'PERCENT' }
    ],
    referenceIds: ['OECD_INFE_2023']
  });

  return {
    methodologyVersion: FINANCIAL_GUIDANCE_EVIDENCE_METHODOLOGY_VERSION,
    findings,
    references: REFERENCES.map((reference) => ({ ...reference })),
    limitations: [
      'Os percentuais exibidos descrevem a base confirmada; não são limites universais de gasto.',
      'As faixas de atenção são regras internas versionadas e não substituem aconselhamento financeiro profissional.',
      'As referências sustentam princípios de organização e bem-estar financeiro, não uma recomendação individual pronta.',
      'Uma futura explicação por IA deverá usar somente estes fatos estruturados e não poderá recalcular valores.'
    ]
  };
}
