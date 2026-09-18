import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  GitCompareArrows,
  Loader2,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InfoModalButton } from "@/components/ui/InfoModalButton";
import { useToast } from "@/components/ui/ToastContext";
import { FinancialGuidanceEvidencePanel } from "./FinancialGuidanceEvidence";
import { FinancialPlanningAiGuidance } from "./FinancialPlanningAiGuidance";
import {
  FinancialPlanningApiError,
  FinancialPlanningGuidanceResult,
  FinancialPlanningScenario,
  FinancialPlanningScenarioResult,
  FinancialPlanningSnapshot,
  generateFinancialPlanningGuidance,
  getFinancialPlanningSnapshotScenarios,
} from "@/lib/financial-planning-analysis";

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}

function feasibilityLabel(
  feasibility: FinancialPlanningScenario["feasibility"],
): string {
  if (feasibility === "FEASIBLE") return "Meta alcançável neste cenário";
  if (feasibility === "PARTIAL") return "Ajuste cobre parte da diferença";
  return "Sem gastos ajustáveis neste cenário";
}

export function FinancialPlanningScenarios({
  snapshot,
  onReviewScenario,
}: {
  snapshot: FinancialPlanningSnapshot;
  onReviewScenario?: (scenario: FinancialPlanningScenario) => void;
}) {
  const { addToast } = useToast();
  const [result, setResult] = useState<FinancialPlanningScenarioResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [guidance, setGuidance] = useState<FinancialPlanningGuidanceResult | null>(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);

  useEffect(() => {
    setResult(null);
    setGuidance(null);
  }, [snapshot.id]);

  async function calculateScenarios() {
    setLoading(true);
    try {
      setResult(await getFinancialPlanningSnapshotScenarios(snapshot.id));
    } catch (error: any) {
      const response = error.response?.data as
        FinancialPlanningApiError | undefined;
      addToast(
        response?.error || "Erro ao calcular cenários para a meta",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  async function generateGuidance() {
    setGuidanceLoading(true);
    try {
      setGuidance(await generateFinancialPlanningGuidance(snapshot.id));
    } catch (error: any) {
      const response = error.response?.data as FinancialPlanningApiError | undefined;
      addToast(response?.error || "Erro ao gerar parecer explicativo", "error");
    } finally {
      setGuidanceLoading(false);
    }
  }

  const guidancePanel = result?.guidanceEvidence ? (
    <FinancialPlanningAiGuidance
      evidence={result.guidanceEvidence}
      scenarios={result.scenarios}
      result={guidance}
      loading={guidanceLoading}
      onGenerate={() => void generateGuidance()}
    />
  ) : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-white">
            Cenários para alcançar a meta
          </h3>
          <InfoModalButton
            modalTitle="Como os cenários são calculados"
            buttonLabel="Ajuda sobre os cenários"
          >
            <p>
              Os cenários usam somente o retrato financeiro confirmado e
              distribuem a diferença entre gastos variáveis conforme a
              flexibilidade e o mínimo mensal definidos no seu perfil.
            </p>
            <p>
              Categorias protegidas, despesas fixas, parcelas e provisões não
              são reduzidas. Nada é aplicado ao orçamento nesta etapa.
            </p>
          </InfoModalButton>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-400">
          <Target size={13} />
          {formatMoney(snapshot.targetMonthlySavings)}/mês
        </span>
      </div>

      {!result && (
        <Button
          type="button"
          variant="accent"
          disabled={loading}
          onClick={() => void calculateScenarios()}
          className="mt-4 inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <GitCompareArrows size={17} />
          )}
          {loading ? "Calculando..." : "Calcular cenários"}
        </Button>
      )}

      {result?.status === "TARGET_ALREADY_MET" && (
        <>
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-4 text-emerald-200">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">A meta já cabe no retrato confirmado</p>
              <p className="mt-1 text-sm text-emerald-200/80">
                A disponibilidade mensal atual é de{" "}
                {formatMoney(result.currentMonthlyAvailableBeforeGoal)}. Nenhum
                corte foi sugerido.
              </p>
            </div>
          </div>
          {result.guidanceEvidence && (
            <FinancialGuidanceEvidencePanel evidence={result.guidanceEvidence} />
          )}
          {guidancePanel}
        </>
      )}

      {result?.status === "ADJUSTMENT_REQUIRED" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-200">
            Faltam {formatMoney(result.requiredReduction)} por mês para a meta
            no retrato atual.
          </div>
          {result.guidanceEvidence && (
            <FinancialGuidanceEvidencePanel evidence={result.guidanceEvidence} />
          )}
          {guidancePanel}
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            {result.scenarios.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                onReview={
                  onReviewScenario
                    ? () => onReviewScenario(scenario)
                    : undefined
                }
              />
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Metodologia de recomendação v
            {result.recommendationMethodologyVersion} · simulação sem alterações
            automáticas
          </p>
        </div>
      )}
    </Card>
  );
}

function ScenarioCard({
  scenario,
  onReview,
}: {
  scenario: FinancialPlanningScenario;
  onReview?: () => void;
}) {
  const feasible = scenario.feasibility === "FEASIBLE";
  const StatusIcon = feasible ? CheckCircle2 : AlertTriangle;
  return (
    <section className="rounded-xl border border-gray-700 bg-[#11161d] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-white">{scenario.label}</h4>
          <p className="mt-1 text-sm text-gray-400">{scenario.description}</p>
        </div>
        <StatusIcon
          size={19}
          className={`mt-0.5 shrink-0 ${feasible ? "text-emerald-300" : "text-amber-300"}`}
        />
      </div>
      <p
        className={`mt-3 text-xs font-medium ${feasible ? "text-emerald-300" : "text-amber-300"}`}
      >
        {feasibilityLabel(scenario.feasibility)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-500">Redução proposta</dt>
          <dd className="mt-1 font-semibold text-white">
            {formatMoney(scenario.proposedReduction)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Diferença restante</dt>
          <dd
            className={`mt-1 font-semibold ${feasible ? "text-emerald-300" : "text-amber-300"}`}
          >
            {formatMoney(scenario.remainingGap)}
          </dd>
        </div>
      </dl>

      {scenario.adjustments.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-700">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-gray-800/60 px-3 py-2 text-xs text-gray-500">
            <span>Categoria</span>
            <span>Atual</span>
            <span>Sugerido</span>
          </div>
          {scenario.adjustments.map((adjustment) => (
            <div
              key={adjustment.sourceKey}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-gray-700 px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-gray-200">
                  {adjustment.categoryName}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  -{formatMoney(adjustment.proposedReduction)} · mínimo{" "}
                  {formatMoney(adjustment.minimumMonthlyAmount)}
                </p>
              </div>
              <span className="text-gray-400">
                {formatMoney(adjustment.currentAmount)}
              </span>
              <span className="font-semibold text-white">
                {formatMoney(adjustment.suggestedMonthlyLimit)}
              </span>
            </div>
          ))}
        </div>
      )}

      {scenario.warnings.map((warning) => (
        <div
          key={warning}
          className="mt-3 flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/20 p-2.5 text-xs text-amber-200"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {warning}
        </div>
      ))}

      <details className="mt-4 text-xs text-gray-500">
        <summary className="cursor-pointer text-gray-400">
          Premissas deste cenário
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {scenario.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </details>
      {onReview && scenario.adjustments.length > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={onReview}
          className="mt-4 w-full"
        >
          Revisar como rascunho mensal
        </Button>
      )}
    </section>
  );
}
