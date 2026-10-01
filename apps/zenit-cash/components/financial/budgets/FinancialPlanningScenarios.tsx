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
  getFinancialPlanningGuidance,
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
  const [guidanceHistory, setGuidanceHistory] = useState<FinancialPlanningGuidanceResult[]>([]);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceHistoryLoading, setGuidanceHistoryLoading] = useState(false);

  useEffect(() => {
    setResult(null);
    setGuidance(null);
    setGuidanceHistory([]);
  }, [snapshot.id]);

  async function calculateScenarios() {
    setLoading(true);
    try {
      const scenarioResult = await getFinancialPlanningSnapshotScenarios(snapshot.id);
      setResult(scenarioResult);
      setGuidance(null);
      setGuidanceHistory([]);
      setGuidanceHistoryLoading(true);
      try {
        const page = await getFinancialPlanningGuidance(snapshot.id, { limit: 10 });
        setGuidanceHistory(page.items);
        setGuidance(page.items[0] ?? null);
      } catch (error: any) {
        const response = error.response?.data as FinancialPlanningApiError | undefined;
        addToast(response?.error || "Erro ao consultar pareceres salvos", "error");
      } finally {
        setGuidanceHistoryLoading(false);
      }
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
      const generated = await generateFinancialPlanningGuidance(snapshot.id);
      setGuidance(generated);
      setGuidanceHistory((current) => [
        generated,
        ...current.filter((item) => item.recordId !== generated.recordId),
      ]);
    } catch (error: any) {
      const response = error.response?.data as FinancialPlanningApiError | undefined;
      addToast(response?.error || "Erro ao gerar parecer explicativo", "error");
    } finally {
      setGuidanceLoading(false);
    }
  }

  const guidancePanel = result?.guidanceEvidence ? (
    <FinancialPlanningAiGuidance
      result={guidance}
      history={guidanceHistory}
      historyLoading={guidanceHistoryLoading}
      loading={guidanceLoading}
      onGenerate={() => void generateGuidance()}
      onSelect={setGuidance}
    />
  ) : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-text">
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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-text-muted">
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
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-tone-emerald/25 bg-tone-emerald-soft p-4 text-tone-emerald">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">A meta já cabe no retrato confirmado</p>
              <p className="mt-1 text-sm text-tone-emerald">
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
          <div className="rounded-lg border border-tone-amber/25 bg-tone-amber-soft p-3 text-sm text-tone-amber">
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
          <p className="text-xs text-text-subtle">
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
    <section className="rounded-xl border border-border bg-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-text">{scenario.label}</h4>
          <p className="mt-1 text-sm text-text-muted">{scenario.description}</p>
        </div>
        <StatusIcon
          size={19}
          className={`mt-0.5 shrink-0 ${feasible ? "text-tone-emerald" : "text-tone-amber"}`}
        />
      </div>
      <p
        className={`mt-3 text-xs font-medium ${feasible ? "text-tone-emerald" : "text-tone-amber"}`}
      >
        {feasibilityLabel(scenario.feasibility)}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-text-subtle">Redução proposta</dt>
          <dd className="mt-1 font-semibold text-text">
            {formatMoney(scenario.proposedReduction)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-subtle">Diferença restante</dt>
          <dd
            className={`mt-1 font-semibold ${feasible ? "text-tone-emerald" : "text-tone-amber"}`}
          >
            {formatMoney(scenario.remainingGap)}
          </dd>
        </div>
      </dl>

      {scenario.adjustments.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 bg-elevated/60 px-3 py-2 text-xs text-text-subtle">
            <span>Categoria</span>
            <span>Atual</span>
            <span>Sugerido</span>
          </div>
          {scenario.adjustments.map((adjustment) => (
            <div
              key={adjustment.sourceKey}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-border px-3 py-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-text">
                  {adjustment.categoryName}
                </p>
                <p className="mt-0.5 text-xs text-text-subtle">
                  -{formatMoney(adjustment.proposedReduction)} · mínimo{" "}
                  {formatMoney(adjustment.minimumMonthlyAmount)}
                </p>
              </div>
              <span className="text-text-muted">
                {formatMoney(adjustment.currentAmount)}
              </span>
              <span className="font-semibold text-text">
                {formatMoney(adjustment.suggestedMonthlyLimit)}
              </span>
            </div>
          ))}
        </div>
      )}

      {scenario.warnings.map((warning) => (
        <div
          key={warning}
          className="mt-3 flex items-start gap-2 rounded-lg border border-tone-amber/25 bg-tone-amber-soft p-2.5 text-xs text-tone-amber"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {warning}
        </div>
      ))}

      <details className="mt-4 text-xs text-text-subtle">
        <summary className="cursor-pointer text-text-muted">
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
