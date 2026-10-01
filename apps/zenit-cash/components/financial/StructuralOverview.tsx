import React, { useState } from 'react';
import { CircleHelp, Landmark, WalletCards } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { type FinancialDashboardStructuralResponse } from '@/lib/financial-dashboard';

function formatCurrency(value: string): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function CompactMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: 'default' | 'income' | 'expense' | 'balance';
}) {
  const styles =
    tone === 'income'
      ? {
          label: 'text-tone-emerald',
          value: 'text-tone-emerald'
        }
      : tone === 'expense'
        ? {
            label: 'text-tone-red',
            value: 'text-tone-red'
          }
        : tone === 'balance'
          ? Number(value || 0) >= 0
            ? {
                label: 'text-tone-sky',
                value: 'text-tone-sky'
              }
            : {
                label: 'text-tone-red',
                value: 'text-tone-red'
              }
          : {
              label: 'text-text-muted/70',
              value: 'text-text'
            };

  return (
    <div className="rounded-xl border border-border bg-elevated px-3 py-2">
      <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${styles.label}`}>
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${styles.value}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

function CompactSection({
  title,
  icon,
  metrics,
  helpText
}: {
  title: string;
  icon: React.ReactNode;
  metrics: Array<{
    label: string;
    value: string;
    tone: 'default' | 'income' | 'expense' | 'balance';
  }>;
  helpText?: string;
}) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  return (
    <div className="space-y-2">
      <div className="relative flex items-center gap-2 text-sm font-medium text-text">
        <span className="text-accent">{icon}</span>
        <span>{title}</span>
        {helpText ? (
          <>
            <button
              type="button"
              onClick={() => setIsHelpOpen((current) => !current)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-text-muted transition hover:border-accent hover:text-accent"
              aria-label={`Explicar ${title}`}
              aria-expanded={isHelpOpen}
            >
              <CircleHelp size={12} />
            </button>
            {isHelpOpen ? (
              <div className="absolute left-0 top-full z-20 mt-2 w-[300px] max-w-[calc(100vw-3rem)] rounded-lg border border-border bg-elevated px-3 py-2 text-xs font-normal leading-relaxed text-text-muted shadow-[0_18px_40px_rgba(2,6,23,0.45)]">
                {helpText}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {metrics.map((metric) => (
          <CompactMetric
            key={metric.label}
            label={metric.label}
            value={metric.value}
            tone={metric.tone}
          />
        ))}
      </div>
    </div>
  );
}

export default function StructuralOverview({
  data,
  loading,
  error
}: {
  data: FinancialDashboardStructuralResponse | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Card className="px-4 py-3">
      {error ? (
        <div className="mb-3 rounded-lg border border-tone-red/25 bg-tone-red-soft px-3 py-2 text-sm text-tone-red">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
          <CompactSection
            title="Compromissos fixos ativos"
            icon={<Landmark size={16} />}
            helpText="Panorama fixo da operacao. Nao depende do painel nem do mes selecionado. Considera receitas e despesas recorrentes ativas, incluindo despesas fixas no cartao."
            metrics={[
              {
                label: 'Receitas fixas',
                value: data.fixed.incomeTotal,
                tone: 'income'
              },
              {
                label: 'Despesas fixas',
                value: data.fixed.expenseTotal,
                tone: 'expense'
              },
              {
                label: 'Saldo fixo',
                value: data.fixed.netTotal,
                tone: 'balance'
              }
            ]}
          />

          <CompactSection
            title="Cartoes consolidados"
            icon={<WalletCards size={16} />}
            metrics={[
              {
                label: 'Limite total',
                value: data.creditCards.totalLimit,
                tone: 'default'
              },
              {
                label: 'Utilizado',
                value: data.creditCards.usedLimit,
                tone: 'expense'
              },
              {
                label: 'Disponivel',
                value: data.creditCards.availableLimit,
                tone: 'balance'
              }
            ]}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-text-muted">
          Nenhuma informacao estrutural disponivel no momento.
        </div>
      )}
    </Card>
  );
}
