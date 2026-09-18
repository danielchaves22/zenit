import React from 'react';
import { Bot, CheckCircle2, Loader2, Sparkles, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type {
  FinancialGuidanceEvidence,
  FinancialPlanningGuidanceResult,
  FinancialPlanningScenario
} from '@/lib/financial-planning-analysis';

export function FinancialPlanningAiGuidance({
  evidence,
  scenarios,
  result,
  loading,
  onGenerate
}: {
  evidence: FinancialGuidanceEvidence;
  scenarios: FinancialPlanningScenario[];
  result: FinancialPlanningGuidanceResult | null;
  loading: boolean;
  onGenerate: () => void;
}) {
  if (!result) {
    return (
      <section className="mt-4 rounded-xl border border-violet-900/60 bg-violet-950/20 p-4">
        <div className="flex items-start gap-3">
          <Sparkles size={19} className="mt-0.5 shrink-0 text-violet-300" />
          <div className="min-w-0">
            <h4 className="font-semibold text-white">Parecer explicativo com IA</h4>
            <p className="mt-1 text-sm leading-5 text-gray-300">
              A IA pode organizar os achados e explicar os trade-offs. Ela não recalcula valores,
              não altera cenários e não salva mudanças no seu planejamento.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={onGenerate}
              className="mt-3 inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />}
              {loading ? 'Gerando parecer...' : 'Gerar parecer com IA'}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const references = result.guidance.referenceIds.flatMap((referenceId) => {
    const reference = evidence.references.find((item) => item.id === referenceId);
    return reference ? [reference] : [];
  });
  const selectedScenario = scenarios.find(
    (scenario) => scenario.id === result.guidance.scenarioComparison.scenarioId
  );

  return (
    <section className="mt-4 rounded-xl border border-violet-800/70 bg-violet-950/20 p-4">
      <div className="flex items-start gap-3">
        <Sparkles size={19} className="mt-0.5 shrink-0 text-violet-300" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
            Parecer explicativo com IA
          </p>
          <h4 className="mt-1 font-semibold text-white">{result.guidance.headline}</h4>
          <p className="mt-2 text-sm leading-6 text-gray-300">{result.guidance.summary}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {result.guidance.priorities.map((priority) => (
          <article
            key={`${priority.findingId}:${priority.title}`}
            className="rounded-lg border border-gray-700 bg-[#11161d] p-3"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-violet-300" />
              <h5 className="text-sm font-medium text-white">{priority.title}</h5>
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-300">{priority.explanation}</p>
            <p className="mt-2 text-xs leading-5 text-violet-200">
              Próximo passo: {priority.nextStep}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-gray-700 bg-[#11161d] p-3">
        <p className="text-xs font-medium text-gray-400">
          {selectedScenario ? `Leitura do cenário “${selectedScenario.label}”` : 'Leitura da meta atual'}
        </p>
        <p className="mt-1 text-sm leading-5 text-gray-200">
          {result.guidance.scenarioComparison.explanation}
        </p>
      </div>

      {result.guidance.cautions.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.guidance.cautions.map((caution, index) => (
            <div
              key={`${caution.findingId ?? 'general'}:${index}`}
              className="flex items-start gap-2 text-xs leading-5 text-amber-200"
            >
              <TriangleAlert size={14} className="mt-0.5 shrink-0" />
              {caution.message}
            </div>
          ))}
        </div>
      )}

      {references.length > 0 && (
        <div className="mt-4 border-t border-gray-700 pt-3 text-xs text-gray-400">
          <span>Referências utilizadas: </span>
          {references.map((reference, index) => (
            <React.Fragment key={reference.id}>
              {index > 0 && <span> · </span>}
              <a
                href={reference.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-300 underline decoration-blue-700 underline-offset-2 hover:text-blue-200"
              >
                {reference.organization}
              </a>
            </React.Fragment>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-600">
        Gerado em {new Date(result.generatedAt).toLocaleString('pt-BR')} · modelo {result.telemetry.model}
        {' · '}prompt {result.telemetry.promptVersion} · parecer não salvo
      </p>
    </section>
  );
}
