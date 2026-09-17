import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import BudgetsPage from "@/pages/financial/budgets";

const { pushMock, replaceMock, routerMock } = vi.hoisted(() => {
  const router = {
    isReady: true,
    query: { view: "guided", month: "2026-09" } as Record<string, string>,
    push: vi.fn(),
    replace: vi.fn(),
  };
  return {
    pushMock: router.push,
    replaceMock: router.replace,
    routerMock: router,
  };
});

vi.mock("next/router", () => ({ useRouter: () => routerMock }));

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));

vi.mock("@/components/ui/AccessGuard", () => ({
  PageGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/Breadcrumb", () => ({ Breadcrumb: () => null }));
vi.mock("@/components/ui/InfoModalButton", () => ({
  InfoModalButton: () => null,
}));
vi.mock("@/components/ui/Button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/financial/budgets/BudgetSectionTabs", () => ({
  BudgetSectionTabs: () => null,
}));
vi.mock("@/components/financial/budgets/BudgetOverview", () => ({
  BudgetOverview: () => null,
}));
vi.mock("@/components/financial/budgets/AvailabilityPlan", () => ({
  AvailabilityPlan: () => null,
}));
vi.mock("@/components/financial/budgets/FinancialProvisions", () => ({
  FinancialProvisions: () => null,
}));

vi.mock("@/components/financial/budgets/GuidedPlanning", () => ({
  GuidedPlanning: ({
    onReviewScenario,
  }: {
    onReviewScenario: (selection: any) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onReviewScenario({
          snapshotId: 50,
          scenario: {
            id: "BALANCED",
            label: "Ajuste equilibrado",
            adjustments: [
              {
                categoryId: 10,
                categoryName: "Combustível",
                suggestedMonthlyLimit: "420.00",
              },
            ],
          },
        })
      }
    >
      Revisar cenário
    </button>
  ),
}));

vi.mock("@/components/financial/budgets/MonthlyCategoryPlanning", () => ({
  MonthlyCategoryPlanning: ({ draftProposal }: { draftProposal: any }) => (
    <div>
      Rascunho recebido: {draftProposal?.sourceScenarioLabel} ·{" "}
      {draftProposal?.targetMonth} ·{" "}
      {draftProposal?.adjustments[0]?.suggestedMonthlyLimit}
    </div>
  ),
}));

describe("BudgetsPage scenario handoff", () => {
  it("keeps the selected scenario in memory while navigating to the monthly draft", async () => {
    pushMock.mockImplementation(async (target: any) => {
      routerMock.query = target.query;
      return true;
    });
    replaceMock.mockResolvedValue(true);
    const user = userEvent.setup();

    render(<BudgetsPage />);
    await user.click(screen.getByRole("button", { name: "Revisar cenário" }));

    expect(pushMock).toHaveBeenCalledWith(
      {
        pathname: "/financial/budgets",
        query: { view: "monthly", month: "2026-09" },
      },
      undefined,
      { shallow: true },
    );
    expect(
      await screen.findByText(
        "Rascunho recebido: Ajuste equilibrado · 2026-09 · 420.00",
      ),
    ).toBeInTheDocument();
  });
});
