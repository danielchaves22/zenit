import React from 'react';
import { Landmark, WalletCards } from 'lucide-react';
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
          label: 'text-emerald-200/70',
          value: 'text-emerald-300'
        }
      : tone === 'expense'
        ? {
            label: 'text-red-200/70',
            value: 'text-red-300'
          }
        : tone === 'balance'
          ? Number(value || 0) >= 0
            ? {
                label: 'text-sky-200/70',
                value: 'text-sky-300'
              }
            : {
                label: 'text-red-200/70',
                value: 'text-red-300'
              }
          : {
              label: 'text-slate-300/70',
              value: 'text-slate-100'
            };

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0b1117] px-3 py-2.5">
      <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${styles.label}`}>
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold tabular-nums ${styles.value}`}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

function CompactSection({
  title,
  icon,
  metrics
}: {
  title: string;
  icon: React.ReactNode;
  metrics: Array<{
    label: string;
    value: string;
    tone: 'default' | 'income' | 'expense' | 'balance';
  }>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-white">
        {icon}
        {title}
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
    <Card className="p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-2xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Visao estrutural
          </div>
          <p className="mt-1 text-sm text-gray-400">
            Panorama fixo da operacao. Nao depende do painel nem do mes selecionado.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : data ? (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
          <CompactSection
            title="Compromissos fixos ativos"
            icon={<Landmark size={16} className="text-accent" />}
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
            icon={<WalletCards size={16} className="text-accent" />}
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
        <div className="mt-4 rounded-xl border border-dashed border-gray-700 px-4 py-5 text-sm text-gray-400">
          Nenhuma informacao estrutural disponivel no momento.
        </div>
      )}
    </Card>
  );
}
