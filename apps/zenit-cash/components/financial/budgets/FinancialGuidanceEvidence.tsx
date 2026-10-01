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
      className: 'border-tone-emerald/25 bg-tone-emerald-soft',
      iconClassName: 'text-tone-emerald'
    };
  }
  if (severity === 'CRITICAL') {
    return {
      Icon: CircleAlert,
      className: 'border-tone-red/25 bg-tone-red-soft',
      iconClassName: 'text-tone-red'
    };
  }
  if (severity === 'ATTENTION') {
    return {
      Icon: AlertTriangle,
      className: 'border-tone-amber/25 bg-tone-amber-soft',
      iconClassName: 'text-tone-amber'
    };
  }
  return {
    Icon: Info,
    className: 'border-tone-blue/25 bg-tone-blue-soft',
    iconClassName: 'text-tone-blue'
  };
}

export function FinancialGuidanceEvidencePanel({
  evidence
}: {
  evidence: FinancialGuidanceEvidence;
}) {
  return (
    <section className="mt-4 rounded-xl border border-border bg-elevated p-4">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-text">Leitura dos dados confirmados</h4>
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
                  <h5 className="text-sm font-medium text-text">{finding.title}</h5>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{finding.summary}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {finding.evidence.map((metric) => (
                  <div key={metric.key} className="min-w-0">
                    <dt className="truncate text-[11px] text-text-subtle">{metric.label}</dt>
                    <dd className="mt-0.5 truncate text-xs font-semibold text-text">
                      {formatMetric(metric.value, metric.format)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>

      <details className="mt-4 text-xs text-text-muted">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-text-muted">
          <BookOpen size={14} />
          Metodologia, limites e referências
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="font-medium text-text-muted">Limites desta leitura</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {evidence.limitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium text-text-muted">Referências institucionais</p>
            <ul className="mt-2 space-y-2">
              {evidence.references.map((reference) => (
                <li key={reference.id}>
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-tone-blue underline decoration-blue-700 underline-offset-2 hover:text-tone-blue"
                  >
                    {reference.organization} · {reference.title}
                  </a>
                  <p className="mt-0.5 text-text-subtle">{reference.purpose}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 text-text-subtle">
          Metodologia de evidências v{evidence.methodologyVersion}
        </p>
      </details>
    </section>
  );
}
