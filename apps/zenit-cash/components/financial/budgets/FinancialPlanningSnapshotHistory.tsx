import React, { useState } from 'react';
import { ChevronDown, ChevronUp, History, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastContext';
import {
  FinancialPlanningApiError,
  FinancialPlanningSnapshot,
  FinancialPlanningSnapshotSummary,
  getFinancialPlanningSnapshot,
  getFinancialPlanningSnapshots
} from '@/lib/financial-planning-analysis';
import { FinancialPlanningGuidanceArchive } from './FinancialPlanningGuidanceArchive';

function formatMoney(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatDateKey(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function FinancialPlanningSnapshotHistory() {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FinancialPlanningSnapshotSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, FinancialPlanningSnapshot>>({});

  async function loadPage(reset: boolean) {
    if (loading) return;
    setLoading(true);
    try {
      const page = await getFinancialPlanningSnapshots({
        limit: 10,
        ...(reset || !nextCursor ? {} : { cursor: nextCursor })
      });
      setItems((current) => (reset ? page.items : [...current, ...page.items]));
      setNextCursor(page.nextCursor);
      setLoaded(true);
      if (reset) {
        setExpandedId(null);
        setDetails({});
      }
    } catch (error: any) {
      const response = error.response?.data as FinancialPlanningApiError | undefined;
      addToast(response?.error || 'Erro ao consultar histórico de retratos financeiros', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function toggleHistory() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && !loaded) await loadPage(true);
  }

  async function toggleDetails(snapshotId: number) {
    if (expandedId === snapshotId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(snapshotId);
    if (details[snapshotId]) return;
    setDetailLoadingId(snapshotId);
    try {
      const detail = await getFinancialPlanningSnapshot(snapshotId);
      setDetails((current) => ({ ...current, [snapshotId]: detail }));
    } catch (error: any) {
      setExpandedId(null);
      const response = error.response?.data as FinancialPlanningApiError | undefined;
      addToast(response?.error || 'Erro ao consultar retrato financeiro', 'error');
    } finally {
      setDetailLoadingId(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History size={18} className="text-accent" />
          <h3 className="font-semibold text-white">Histórico de retratos financeiros</h3>
        </div>
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          onClick={() => void toggleHistory()}
          className="inline-flex items-center gap-2"
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {open ? 'Ocultar histórico' : 'Ver histórico'}
        </Button>
      </div>

      {open && (
        <div className="mt-4 border-t border-gray-800 pt-4">
          <div className="mb-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void loadPage(true)}
              className="inline-flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </Button>
          </div>

          {loading && !loaded ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
              <Loader2 size={17} className="animate-spin" />
              Carregando retratos financeiros...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center text-sm text-gray-500">
              Nenhum retrato financeiro foi confirmado ainda.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((snapshot) => {
                const detail = details[snapshot.id];
                const expanded = expandedId === snapshot.id;
                const marginIsNegative = Number(snapshot.totals.monthlyBalanceAfterGoal) < 0;
                return (
                  <article key={snapshot.id} className="rounded-lg border border-gray-700 bg-[#11161d]">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => void toggleDetails(snapshot.id)}
                      className="flex w-full flex-wrap items-center justify-between gap-4 p-4 text-left"
                    >
                      <span>
                        <span className="block text-sm font-medium text-white">
                          Snapshot #{snapshot.id} · {formatDateTime(snapshot.confirmedAt)}
                        </span>
                        <span className="mt-1 block text-xs text-gray-500">
                          Meta {formatMoney(snapshot.targetMonthlySavings)} · qualidade{' '}
                          {snapshot.dataQualityScore}% · {snapshot.selectedSourceCount} fonte(s)
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span
                          className={`text-sm font-semibold ${
                            marginIsNegative ? 'text-red-300' : 'text-emerald-300'
                          }`}
                        >
                          {formatMoney(snapshot.totals.monthlyBalanceAfterGoal)} após a meta
                        </span>
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </span>
                    </button>

                    {expanded && (
                      <div className="border-t border-gray-800 p-4">
                        {detailLoadingId === snapshot.id ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400">
                            <Loader2 size={16} className="animate-spin" />
                            Carregando detalhes...
                          </div>
                        ) : detail ? (
                          <SnapshotAuditDetail snapshot={detail} />
                        ) : null}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => void loadPage(false)}
                className="inline-flex items-center gap-2 disabled:opacity-50"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function SnapshotAuditDetail({ snapshot }: { snapshot: FinancialPlanningSnapshot }) {
  const selectedSources = snapshot.sources.filter((source) => source.selected);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <AuditField
          label="Período analisado"
          value={`${formatDateKey(snapshot.historyStartDate)} a ${formatDateKey(snapshot.historyEndDate)}`}
        />
        <AuditField label="Versão do perfil" value={`v${snapshot.profileVersion}`} />
        <AuditField label="Metodologia" value={`v${snapshot.methodologyVersion}`} />
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
        <AuditSummaryRow label="Receitas fixas" value={snapshot.totals.monthlyIncome} positive />
        <AuditSummaryRow label="Fixas e parcelas" value={snapshot.totals.monthlyCommittedExpenses} />
        <AuditSummaryRow label="Gastos variáveis" value={snapshot.totals.monthlyVariableExpenses} />
        <AuditSummaryRow label="Provisões" value={snapshot.totals.monthlyProvisionContribution} />
        <AuditSummaryRow
          label="Disponível antes da meta"
          value={snapshot.totals.monthlyAvailableBeforeGoal}
          emphasize
        />
        <AuditSummaryRow
          label="Margem após a meta"
          value={snapshot.totals.monthlyBalanceAfterGoal}
          emphasize
          tone={Number(snapshot.totals.monthlyBalanceAfterGoal) < 0 ? 'danger' : 'success'}
        />
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Fontes confirmadas
        </p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {selectedSources.map((source) => (
            <div
              key={source.key}
              className="flex items-center justify-between gap-3 rounded border border-gray-800 px-3 py-2 text-sm"
            >
              <span className="truncate text-gray-300">{source.label}</span>
              <span className="shrink-0 font-medium text-white">
                {formatMoney(source.monthlyAmount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Identificador da base
        </p>
        <code className="mt-2 block break-all rounded bg-background px-3 py-2 text-xs text-gray-400">
          {snapshot.basisHash || 'Não registrado para este snapshot legado'}
        </code>
      </div>

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Pareceres explicativos salvos
        </p>
        <FinancialPlanningGuidanceArchive snapshotId={snapshot.id} />
      </div>
    </div>
  );
}

function AuditField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-800 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-200">{value}</p>
    </div>
  );
}

function AuditSummaryRow({
  label,
  value,
  positive = false,
  emphasize = false,
  tone = 'neutral'
}: {
  label: string;
  value: string;
  positive?: boolean;
  emphasize?: boolean;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'danger'
        ? 'text-red-300'
        : positive
          ? 'text-emerald-300'
          : 'text-white';
  return (
    <div className={`flex items-center justify-between gap-3 ${emphasize ? 'py-1' : ''}`}>
      <span className={emphasize ? 'text-sm font-medium text-gray-300' : 'text-sm text-gray-500'}>
        {label}
      </span>
      <span className={`${emphasize ? 'text-base' : 'text-sm'} font-semibold ${valueClass}`}>
        {formatMoney(value)}
      </span>
    </div>
  );
}
