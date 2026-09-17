import { describe, expect, it } from "vitest";
import {
  FinancialPlanningBudgetDraftProposal,
  MonthlyCategoryBudgetDraftAllocation,
  applyFinancialPlanningProposalToDraft,
} from "@/lib/monthly-category-budget-draft";

function allocation(
  categoryId: number,
  limitAmount: string,
  includeChildren = false,
): MonthlyCategoryBudgetDraftAllocation {
  return {
    categoryId,
    limitAmount,
    includeChildren,
    recurringBudgetId: 50,
    origin: "FIXED_MONTHLY",
    baseLimitAmount: limitAmount,
    recurrenceStartMonth: "2026-01",
    recurringChangeScope: "FROM_MONTH",
  };
}

function proposal(
  adjustments: FinancialPlanningBudgetDraftProposal["adjustments"],
): FinancialPlanningBudgetDraftProposal {
  return {
    id: "proposal-1",
    sourceSnapshotId: 10,
    sourceScenarioId: "BALANCED",
    sourceScenarioLabel: "Ajuste equilibrado",
    targetMonth: "2026-09",
    adjustments,
  };
}

describe("monthly category budget draft from a financial scenario", () => {
  it("updates an existing recurring allocation only for the reviewed month", () => {
    const result = applyFinancialPlanningProposalToDraft({
      allocations: [allocation(10, "500.00", true)],
      categories: [{ id: 10, parentId: null }],
      proposal: proposal([
        {
          categoryId: 10,
          categoryName: "Combustível",
          suggestedMonthlyLimit: "420.00",
        },
      ]),
    });

    expect(result.allocations).toEqual([
      expect.objectContaining({
        categoryId: 10,
        limitAmount: "420.00",
        recurringBudgetId: 50,
        recurringChangeScope: "MONTH_ONLY",
      }),
    ]);
    expect(result.appliedCategoryIds).toEqual([10]);
    expect(result.unchangedCategoryIds).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it("adds a new exact-category one-time allocation and preserves an explicit zero limit", () => {
    const result = applyFinancialPlanningProposalToDraft({
      allocations: [],
      categories: [{ id: 20, parentId: null }],
      proposal: proposal([
        {
          categoryId: 20,
          categoryName: "Lazer",
          suggestedMonthlyLimit: "0.00",
        },
      ]),
    });

    expect(result.allocations).toEqual([
      {
        categoryId: 20,
        limitAmount: "0.00",
        includeChildren: false,
        recurringBudgetId: null,
        origin: "ONE_TIME",
        baseLimitAmount: null,
        recurrenceStartMonth: null,
        recurringChangeScope: "MONTH_ONLY",
      },
    ]);
  });

  it("does not create an overlapping child allocation when a parent already covers it", () => {
    const result = applyFinancialPlanningProposalToDraft({
      allocations: [allocation(1, "800.00", true)],
      categories: [
        { id: 1, parentId: null },
        { id: 2, parentId: 1 },
      ],
      proposal: proposal([
        {
          categoryId: 2,
          categoryName: "Restaurantes",
          suggestedMonthlyLimit: "200.00",
        },
      ]),
    });

    expect(result.allocations).toEqual([allocation(1, "800.00", true)]);
    expect(result.appliedCategoryIds).toEqual([]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        categoryId: 2,
        categoryName: "Restaurantes",
        reason: "COVERED_BY_PARENT",
      }),
    ]);
  });

  it("does not apply an exact-category suggestion to an existing group with broader coverage", () => {
    const result = applyFinancialPlanningProposalToDraft({
      allocations: [allocation(1, "800.00", true)],
      categories: [
        { id: 1, parentId: null },
        { id: 2, parentId: 1 },
      ],
      proposal: proposal([
        {
          categoryId: 1,
          categoryName: "Transporte",
          suggestedMonthlyLimit: "600.00",
        },
      ]),
    });

    expect(result.appliedCategoryIds).toEqual([]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        categoryId: 1,
        reason: "EXISTING_GROUP_SCOPE",
      }),
    ]);
  });

  it("recognizes categories that already match the suggested limit", () => {
    const existing = allocation(10, "420.00");
    const result = applyFinancialPlanningProposalToDraft({
      allocations: [existing],
      categories: [{ id: 10, parentId: null }],
      proposal: proposal([
        {
          categoryId: 10,
          categoryName: "Combustível",
          suggestedMonthlyLimit: "420.00",
        },
      ]),
    });

    expect(result.allocations).toEqual([existing]);
    expect(result.appliedCategoryIds).toEqual([]);
    expect(result.unchangedCategoryIds).toEqual([10]);
    expect(result.skipped).toEqual([]);
  });

  it("reports unavailable categories and invalid values without corrupting the draft", () => {
    const existing = allocation(1, "800.00");
    const result = applyFinancialPlanningProposalToDraft({
      allocations: [existing],
      categories: [{ id: 1, parentId: null }],
      proposal: proposal([
        {
          categoryId: 99,
          categoryName: "Removida",
          suggestedMonthlyLimit: "100.00",
        },
        {
          categoryId: 1,
          categoryName: "Moradia",
          suggestedMonthlyLimit: "-1.00",
        },
        {
          categoryId: 1,
          categoryName: "Moradia",
          suggestedMonthlyLimit: "",
        },
      ]),
    });

    expect(result.allocations).toEqual([existing]);
    expect(result.skipped.map((item) => item.reason)).toEqual([
      "CATEGORY_NOT_FOUND",
      "INVALID_AMOUNT",
      "INVALID_AMOUNT",
    ]);
  });
});
