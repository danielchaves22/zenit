import { buildFinancialBudgetScenarios } from "../../src/utils/financial-budget-scenario";

function variableSource(params: {
  key: string;
  amount: string;
  flexibility: "PROTECTED" | "MODERATE" | "FLEXIBLE";
  minimum?: string | null;
}) {
  return {
    key: params.key,
    kind: "VARIABLE_EXPENSE",
    label: params.key,
    monthlyAmount: params.amount,
    selected: true,
    metadata: {
      categoryId: params.key.charCodeAt(0),
      categoryName: params.key,
      flexibility: params.flexibility,
      minimumMonthlyAmount: params.minimum ?? null,
    },
  };
}

describe("financial budget scenario calculator", () => {
  it("does not suggest cuts when the confirmed portrait already supports the target", () => {
    expect(
      buildFinancialBudgetScenarios({
        targetMonthlySavings: "1000.00",
        monthlyAvailableBeforeGoal: "1200.00",
        monthlyBalanceAfterGoal: "200.00",
        sources: [
          variableSource({
            key: "lazer",
            amount: "500.00",
            flexibility: "FLEXIBLE",
          }),
        ],
      }),
    ).toMatchObject({
      recommendationMethodologyVersion: 1,
      status: "TARGET_ALREADY_MET",
      requiredReduction: "0.00",
      scenarios: [],
    });
  });

  it("preserves protected categories and uses moderate ones only in the balanced scenario", () => {
    const result = buildFinancialBudgetScenarios({
      targetMonthlySavings: "1000.00",
      monthlyAvailableBeforeGoal: "820.00",
      monthlyBalanceAfterGoal: "-180.00",
      sources: [
        variableSource({
          key: "flexivel",
          amount: "200.00",
          flexibility: "FLEXIBLE",
          minimum: "100.00",
        }),
        variableSource({
          key: "moderada",
          amount: "300.00",
          flexibility: "MODERATE",
          minimum: "200.00",
        }),
        variableSource({
          key: "protegida",
          amount: "500.00",
          flexibility: "PROTECTED",
          minimum: "0.00",
        }),
      ],
    });

    expect(result.status).toBe("ADJUSTMENT_REQUIRED");
    expect(result.scenarios[0]).toMatchObject({
      id: "PRESERVE_PRIORITIES",
      feasibility: "PARTIAL",
      proposedReduction: "100.00",
      remainingGap: "80.00",
      projectedMonthlyAvailableBeforeGoal: "920.00",
      projectedMonthlyBalanceAfterGoal: "-80.00",
    });
    expect(result.scenarios[0].adjustments).toEqual([
      expect.objectContaining({
        sourceKey: "flexivel",
        proposedReduction: "100.00",
        suggestedMonthlyLimit: "100.00",
      }),
    ]);
    expect(result.scenarios[1]).toMatchObject({
      id: "BALANCED",
      feasibility: "FEASIBLE",
      proposedReduction: "180.00",
      remainingGap: "0.00",
      projectedMonthlyAvailableBeforeGoal: "1000.00",
      projectedMonthlyBalanceAfterGoal: "0.00",
    });
    expect(result.scenarios[1].adjustments).toEqual([
      expect.objectContaining({
        sourceKey: "flexivel",
        proposedReduction: "100.00",
      }),
      expect.objectContaining({
        sourceKey: "moderada",
        proposedReduction: "80.00",
        suggestedMonthlyLimit: "220.00",
      }),
    ]);
    expect(
      result.scenarios
        .flatMap((scenario) => scenario.adjustments)
        .some((adjustment) => adjustment.sourceKey === "protegida"),
    ).toBe(false);
  });

  it("distributes cents deterministically without exceeding floors or the required reduction", () => {
    const result = buildFinancialBudgetScenarios({
      targetMonthlySavings: "100.00",
      monthlyAvailableBeforeGoal: "99.99",
      monthlyBalanceAfterGoal: "-0.01",
      sources: [
        variableSource({ key: "b", amount: "1.00", flexibility: "FLEXIBLE" }),
        variableSource({ key: "a", amount: "1.00", flexibility: "FLEXIBLE" }),
      ],
    });

    expect(result.scenarios[0].proposedReduction).toBe("0.01");
    expect(result.scenarios[0].adjustments).toEqual([
      expect.objectContaining({
        sourceKey: "a",
        proposedReduction: "0.01",
        suggestedMonthlyLimit: "0.99",
      }),
    ]);
  });

  it("reports when there is no adjustable variable expense instead of claiming feasibility", () => {
    const result = buildFinancialBudgetScenarios({
      targetMonthlySavings: "1000.00",
      monthlyAvailableBeforeGoal: "900.00",
      monthlyBalanceAfterGoal: "-100.00",
      sources: [
        variableSource({
          key: "essencial",
          amount: "500.00",
          flexibility: "PROTECTED",
        }),
      ],
    });

    expect(result.scenarios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feasibility: "NO_ADJUSTABLE_EXPENSES",
          proposedReduction: "0.00",
          remainingGap: "100.00",
          adjustments: [],
        }),
      ]),
    );
  });
});
