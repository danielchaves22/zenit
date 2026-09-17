import { Prisma } from "@prisma/client";

export const FINANCIAL_BUDGET_SCENARIO_METHODOLOGY_VERSION = 1;

export type FinancialBudgetScenarioFlexibility =
  "PROTECTED" | "MODERATE" | "FLEXIBLE";

export type FinancialBudgetScenarioSource = {
  key: string;
  kind: string;
  label: string;
  monthlyAmount: string;
  selected: boolean;
  metadata: Record<string, unknown>;
};

export type FinancialBudgetScenarioAdjustment = {
  sourceKey: string;
  categoryId: number | null;
  categoryName: string;
  flexibility: Exclude<FinancialBudgetScenarioFlexibility, "PROTECTED">;
  currentAmount: string;
  minimumMonthlyAmount: string;
  adjustableAmount: string;
  proposedReduction: string;
  suggestedMonthlyLimit: string;
  explanation: string;
};

export type FinancialBudgetScenario = {
  id: "PRESERVE_PRIORITIES" | "BALANCED";
  label: string;
  description: string;
  feasibility: "FEASIBLE" | "PARTIAL" | "NO_ADJUSTABLE_EXPENSES";
  requiredReduction: string;
  proposedReduction: string;
  remainingGap: string;
  projectedMonthlyAvailableBeforeGoal: string;
  projectedMonthlyBalanceAfterGoal: string;
  adjustments: FinancialBudgetScenarioAdjustment[];
  assumptions: string[];
  warnings: string[];
};

export type FinancialBudgetScenarioResult = {
  recommendationMethodologyVersion: number;
  status: "TARGET_ALREADY_MET" | "ADJUSTMENT_REQUIRED";
  targetMonthlySavings: string;
  currentMonthlyAvailableBeforeGoal: string;
  currentMonthlyBalanceAfterGoal: string;
  requiredReduction: string;
  scenarios: FinancialBudgetScenario[];
};

type Candidate = {
  source: FinancialBudgetScenarioSource;
  categoryId: number | null;
  categoryName: string;
  flexibility: Exclude<FinancialBudgetScenarioFlexibility, "PROTECTED">;
  currentCents: number;
  minimumCents: number;
  adjustableCents: number;
};

function toMoney(value: string | number | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(
    2,
    Prisma.Decimal.ROUND_HALF_UP,
  );
}

function toCents(value: string | number | Prisma.Decimal): number {
  return toMoney(value)
    .mul(100)
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
    .toNumber();
}

function fromCents(value: number): string {
  return new Prisma.Decimal(value).div(100).toFixed(2);
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readFlexibility(
  value: unknown,
): FinancialBudgetScenarioFlexibility | null {
  return value === "PROTECTED" || value === "MODERATE" || value === "FLEXIBLE"
    ? value
    : null;
}

function readMinimumMonthlyAmount(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return 0;
  try {
    return Math.max(0, toCents(value));
  } catch {
    return 0;
  }
}

function candidatesFrom(sources: FinancialBudgetScenarioSource[]): Candidate[] {
  return sources
    .filter((source) => source.selected && source.kind === "VARIABLE_EXPENSE")
    .flatMap((source): Candidate[] => {
      const flexibility = readFlexibility(source.metadata.flexibility);
      if (!flexibility || flexibility === "PROTECTED") return [];
      const currentCents = Math.max(0, toCents(source.monthlyAmount));
      const declaredMinimumCents = readMinimumMonthlyAmount(
        source.metadata.minimumMonthlyAmount,
      );
      const minimumCents = Math.min(currentCents, declaredMinimumCents);
      const adjustableCents = currentCents - minimumCents;
      if (adjustableCents === 0) return [];
      return [
        {
          source,
          categoryId:
            typeof source.metadata.categoryId === "number"
              ? source.metadata.categoryId
              : null,
          categoryName:
            typeof source.metadata.categoryName === "string"
              ? source.metadata.categoryName
              : source.label,
          flexibility,
          currentCents,
          minimumCents,
          adjustableCents,
        },
      ];
    })
    .sort((left, right) => compareKeys(left.source.key, right.source.key));
}

function allocateProportionally(
  candidates: Candidate[],
  requestedCents: number,
): Map<string, number> {
  const allocations = new Map<string, number>();
  const totalCapacity = candidates.reduce(
    (total, candidate) => total + candidate.adjustableCents,
    0,
  );
  const amountToAllocate = Math.min(Math.max(0, requestedCents), totalCapacity);
  if (amountToAllocate === 0 || totalCapacity === 0) return allocations;

  const denominator = BigInt(totalCapacity);
  const shares = candidates.map((candidate) => {
    const numerator =
      BigInt(amountToAllocate) * BigInt(candidate.adjustableCents);
    const cents = Number(numerator / denominator);
    return {
      candidate,
      cents,
      remainder: numerator % denominator,
    };
  });
  let remaining =
    amountToAllocate - shares.reduce((total, share) => total + share.cents, 0);
  shares
    .sort((left, right) => {
      if (left.remainder !== right.remainder)
        return left.remainder > right.remainder ? -1 : 1;
      return compareKeys(left.candidate.source.key, right.candidate.source.key);
    })
    .forEach((share) => {
      if (remaining > 0 && share.cents < share.candidate.adjustableCents) {
        share.cents += 1;
        remaining -= 1;
      }
    });
  shares.forEach((share) =>
    allocations.set(share.candidate.source.key, share.cents),
  );
  return allocations;
}

function buildScenario(params: {
  id: FinancialBudgetScenario["id"];
  label: string;
  description: string;
  requiredCents: number;
  availableBeforeGoalCents: number;
  balanceAfterGoalCents: number;
  candidates: Candidate[];
  tiers: Array<Candidate["flexibility"]>;
}): FinancialBudgetScenario {
  const allocations = new Map<string, number>();
  let remainingToAllocate = params.requiredCents;

  params.tiers.forEach((tier) => {
    if (remainingToAllocate === 0) return;
    const tierCandidates = params.candidates.filter(
      (candidate) => candidate.flexibility === tier,
    );
    const tierAllocations = allocateProportionally(
      tierCandidates,
      remainingToAllocate,
    );
    tierAllocations.forEach((amount, key) => allocations.set(key, amount));
    remainingToAllocate -= Array.from(tierAllocations.values()).reduce(
      (total, amount) => total + amount,
      0,
    );
  });

  const proposedCents = params.requiredCents - remainingToAllocate;
  const feasibility: FinancialBudgetScenario["feasibility"] =
    remainingToAllocate === 0
      ? "FEASIBLE"
      : proposedCents > 0
        ? "PARTIAL"
        : "NO_ADJUSTABLE_EXPENSES";
  const adjustments = params.candidates
    .map((candidate): FinancialBudgetScenarioAdjustment | null => {
      const reductionCents = allocations.get(candidate.source.key) ?? 0;
      if (reductionCents === 0) return null;
      return {
        sourceKey: candidate.source.key,
        categoryId: candidate.categoryId,
        categoryName: candidate.categoryName,
        flexibility: candidate.flexibility,
        currentAmount: fromCents(candidate.currentCents),
        minimumMonthlyAmount: fromCents(candidate.minimumCents),
        adjustableAmount: fromCents(candidate.adjustableCents),
        proposedReduction: fromCents(reductionCents),
        suggestedMonthlyLimit: fromCents(
          candidate.currentCents - reductionCents,
        ),
        explanation:
          candidate.flexibility === "FLEXIBLE"
            ? "Ajuste distribuído entre categorias flexíveis, respeitando o mínimo mensal informado."
            : "Ajuste complementar em categoria moderada, após utilizar a capacidade das categorias flexíveis.",
      };
    })
    .filter(
      (adjustment): adjustment is FinancialBudgetScenarioAdjustment =>
        adjustment !== null,
    );

  return {
    id: params.id,
    label: params.label,
    description: params.description,
    feasibility,
    requiredReduction: fromCents(params.requiredCents),
    proposedReduction: fromCents(proposedCents),
    remainingGap: fromCents(remainingToAllocate),
    projectedMonthlyAvailableBeforeGoal: fromCents(
      params.availableBeforeGoalCents + proposedCents,
    ),
    projectedMonthlyBalanceAfterGoal: fromCents(
      params.balanceAfterGoalCents + proposedCents,
    ),
    adjustments,
    assumptions: [
      "Somente médias de gastos variáveis selecionadas foram ajustadas.",
      "Categorias protegidas, despesas fixas, parcelas e provisões permaneceram intactas.",
      "Os valores são referências mensais e não alteram dados automaticamente.",
    ],
    warnings:
      feasibility === "FEASIBLE"
        ? []
        : [
            "A capacidade de ajuste deste cenário não cobre toda a diferença até a meta. Revise o objetivo ou outros compromissos antes de decidir.",
          ],
  };
}

export function buildFinancialBudgetScenarios(input: {
  targetMonthlySavings: string;
  monthlyAvailableBeforeGoal: string;
  monthlyBalanceAfterGoal: string;
  sources: FinancialBudgetScenarioSource[];
}): FinancialBudgetScenarioResult {
  const availableBeforeGoalCents = toCents(input.monthlyAvailableBeforeGoal);
  const balanceAfterGoalCents = toCents(input.monthlyBalanceAfterGoal);
  const requiredCents = Math.max(0, -balanceAfterGoalCents);
  const base = {
    recommendationMethodologyVersion:
      FINANCIAL_BUDGET_SCENARIO_METHODOLOGY_VERSION,
    targetMonthlySavings: fromCents(toCents(input.targetMonthlySavings)),
    currentMonthlyAvailableBeforeGoal: fromCents(availableBeforeGoalCents),
    currentMonthlyBalanceAfterGoal: fromCents(balanceAfterGoalCents),
    requiredReduction: fromCents(requiredCents),
  };

  if (requiredCents === 0) {
    return { ...base, status: "TARGET_ALREADY_MET", scenarios: [] };
  }

  const candidates = candidatesFrom(input.sources);
  return {
    ...base,
    status: "ADJUSTMENT_REQUIRED",
    scenarios: [
      buildScenario({
        id: "PRESERVE_PRIORITIES",
        label: "Preservar prioridades",
        description:
          "Propõe ajustes apenas nas categorias marcadas como flexíveis.",
        requiredCents,
        availableBeforeGoalCents,
        balanceAfterGoalCents,
        candidates,
        tiers: ["FLEXIBLE"],
      }),
      buildScenario({
        id: "BALANCED",
        label: "Ajuste equilibrado",
        description:
          "Usa primeiro as categorias flexíveis e, se necessário, as moderadas.",
        requiredCents,
        availableBeforeGoalCents,
        balanceAfterGoalCents,
        candidates,
        tiers: ["FLEXIBLE", "MODERATE"],
      }),
    ],
  };
}
