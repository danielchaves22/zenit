import React from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, CircleAlert, Info } from 'lucide-react';
import { InfoModalButton } from '@/components/ui/InfoModalButton';
import type {
  FinancialGuidanceEvidence,
  FinancialGuidanceFinding
} from '@/lib/financial-planning-analysis';

function formatMetric(value: string, format: 'MONEY' | 'PERCENT' | 'NUMBER'): string {
  if (format === 'MONEY') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(value));
  }
  if (format === 'PERCENT') return `${value}%`;
  return value;
}

function findingPresentation(severity: FinancialGuidanceFinding['severity']) {
  if (severity === 'POSITIVE') {
    return {
      Icon: CheckCircle2,
      className: 'border-emerald-900/60 bg-emerald-950/20',
      iconClassName: 'text-emerald-300'
    };
  }
  if (severity === 'CRITICAL') {
    return {
      Icon: CircleAlert,
      className: 'border-red-900/60 bg-red-950/20',
      iconClassName: 'text-red-300'
    };
  }
  if (severity === 'ATTENTION') {
    return {
      Icon: AlertTriangle,
      className: 'border-amber-900/60 bg-amber-950/20',
      iconClassName: 'text-amber-300'
    };
  }
  return {
    Icon: Info,
    className: 'border-blue-900/60 bg-blue-950/20',
    iconClassName: 'text-blue-300'
  };
}

export function FinancialGuidanceEvidencePanel({
  evidence
}: {
  evidence: FinancialGuidanceEvidence;
}) {
  return (
    <section className="mt-4 rounded-xl border border-gray-700 bg-[#11161d] p-4">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-white">Leitura dos dados confirmados</h4>
        <InfoModalButton
          modalTitle="Como esta leitura será usada"
          buttonLabel="Ajuda sobre a leitura financeira"
        >
          <p>
            O Zenit separa os fatos financeiros da explicação. Valores, percentuais e cenários são
            calculados por regras determinísticas e versionadas.
          </p>
          <p>
            A futura camada de IA poderá organizar e explicar estes achados, mas não poderá
            recalcular valores, inventar referências nem aplicar mudanças.
          </p>
        </InfoModalButton>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        {evidence.findings.map((finding) => {
          const presentation = findingPresentation(finding.severity);
          const FindingIcon = presentation.Icon;
          return (
            <article
              key={finding.id}
              className={`rounded-lg border p-3 ${presentation.className}`}
            >
              <div className="flex items-start gap-2.5">
                <FindingIcon
                  size={17}
                  className={`mt-0.5 shrink-0 ${presentation.iconClassName}`}
                />
                <div className="min-w-0">
                  <h5 className="text-sm font-medium text-white">{finding.title}</h5>
                  <p className="mt-1 text-xs leading-5 text-gray-300">{finding.summary}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {finding.evidence.map((metric) => (
                  <div key={metric.key} className="min-w-0">
                    <dt className="truncate text-[11px] text-gray-500">{metric.label}</dt>
                    <dd className="mt-0.5 truncate text-xs font-semibold text-gray-100">
                      {formatMetric(metric.value, metric.format)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>

      <details className="mt-4 text-xs text-gray-400">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-gray-300">
          <BookOpen size={14} />
          Metodologia, limites e referências
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="font-medium text-gray-300">Limites desta leitura</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {evidence.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-300">Referências institucionais</p>
            <ul className="mt-2 space-y-2">
              {evidence.references.map((reference) => (
                <li key={reference.id}>
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-300 underline decoration-blue-700 underline-offset-2 hover:text-blue-200"
                  >
                    {reference.organization} · {reference.title}
                  </a>
                  <p className="mt-0.5 text-gray-500">{reference.purpose}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-gray-600">
          Metodologia de evidências v{evidence.methodologyVersion}
        </p>
      </details>
    </section>
  );
}
