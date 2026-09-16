import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  History,
  Loader2,
  LockKeyhole,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { InfoModalButton } from '@/components/ui/InfoModalButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { FinancialPlanningSnapshotHistory } from './FinancialPlanningSnapshotHistory';
import {
  FinancialPlanningApiError,
  FinancialPlanningPreview,
  FinancialPlanningSnapshot,
  FinancialPlanningSource,
  FinancialPlanningSourceKind,
  FinancialPlanningTotals,
  confirmFinancialPlanningSnapshot,
  getFinancialPlanningPreview
} from '@/lib/financial-planning-analysis';

const sourceGroups: Array<{
  kind: FinancialPlanningSourceKind;
  title: string;
  emptyLabel: string;
}> = [
  {
    kind: 'FIXED_INCOME',
    title: 'Receitas fixas',
    emptyLabel: 'Nenhuma receita fixa ativa encontrada.'
  },
  {
    kind: 'FIXED_EXPENSE',
    title: 'Despesas fixas',
    emptyLabel: 'Nenhuma despesa fixa ativa encontrada.'
  },
  {
    kind: 'INSTALLMENT',
    title: 'Compras parceladas',
    emptyLabel: 'Nenhuma parcela futura ou fatura ainda não paga encontrada.'
  },
  {
    kind: 'PROVISION',
    title: 'Aportes para provisões',
    emptyLabel: 'Nenhuma provisão ativa exige aporte mensal.'
  },
  {
    kind: 'VARIABLE_EXPENSE',
    title: 'Médias dos gastos variáveis',
    emptyLabel: 'O histórico ainda não permite calcular médias por categoria.'
  }
];

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

function sumSelected(
  sources: FinancialPlanningSource[],
  selectedKeys: Set<string>,
  targetMonthlySavings: string
): FinancialPlanningTotals {
  const values = {
    monthlyIncome: 0,
    monthlyCommittedExpenses: 0,
    monthlyVariableExpenses: 0,
    monthlyProvisionContribution: 0
  };
  sources.forEach((source) => {
    if (!selectedKeys.has(source.key)) return;
    const amount = Number(source.monthlyAmount);
    if (source.kind === 'FIXED_INCOME') values.monthlyIncome += amount;
    if (source.kind === 'FIXED_EXPENSE' || source.kind === 'INSTALLMENT') {
      values.monthlyCommittedExpenses += amount;
    }
    if (source.kind === 'VARIABLE_EXPENSE') values.monthlyVariableExpenses += amount;
    if (source.kind === 'PROVISION') values.monthlyProvisionContribution += amount;
  });
  const available =
    values.monthlyIncome -
    values.monthlyCommittedExpenses -
    values.monthlyVariableExpenses -
    values.monthlyProvisionContribution;
  return {
    monthlyIncome: values.monthlyIncome.toFixed(2),
    monthlyCommittedExpenses: values.monthlyCommittedExpenses.toFixed(2),
    monthlyVariableExpenses: values.monthlyVariableExpenses.toFixed(2),
    monthlyProvisionContribution: values.monthlyProvisionContribution.toFixed(2),
    monthlyAvailableBeforeGoal: available.toFixed(2),
    monthlyBalanceAfterGoal: (available - Number(targetMonthlySavings || 0)).toFixed(2)
  };
}

export function GuidedPlanning() {
  const { addToast } = useToast();
  const [historyMonths, setHistoryMonths] = useState(6);
  const [targetMonthlySavings, setTargetMonthlySavings] = useState('0.00');
  const [preview, setPreview] = useState<FinancialPlanningPreview | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [confirmedSnapshot, setConfirmedSnapshot] = useState<FinancialPlanningSnapshot | null>(null);
  const [gateError, setGateError] = useState<FinancialPlanningApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGateError(null);
    setConfirmedSnapshot(null);
    getFinancialPlanningPreview(historyMonths)
      .then((result) => {
        if (cancelled) return;
        setPreview(result);
        setSelectedKeys(new Set(result.defaultSelectedSourceKeys));
      })
      .catch((error: any) => {
        if (cancelled) return;
        const response = error.response?.data as FinancialPlanningApiError | undefined;
        if (
          response?.code === 'PERSONAL_WORKSPACE_REQUIRED' ||
          response?.code === 'FINANCIAL_PROFILE_REQUIRED' ||
          response?.code === 'FINANCIAL_PROFILE_OUTDATED'
        ) {
          setPreview(null);
          setGateError(response);
        } else {
          addToast(response?.error || 'Erro ao preparar diagnóstico financeiro', 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historyMonths]);

  const totals = useMemo(
    () => sumSelected(preview?.sources || [], selectedKeys, targetMonthlySavings),
    [preview?.sources, selectedKeys, targetMonthlySavings]
  );
  const selectedFixedIncome = (preview?.sources || []).some(
    (source) => source.kind === 'FIXED_INCOME' && selectedKeys.has(source.key)
  );
  const canConfirm =
    !!preview && Number(targetMonthlySavings) > 0 && selectedFixedIncome && !saving;

  function toggleSource(key: string) {
    setConfirmedSnapshot(null);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function confirmSnapshot() {
    if (!preview || !canConfirm) return;
    setSaving(true);
    try {
      const snapshot = await confirmFinancialPlanningSnapshot({
        objectiveKind: 'MONTHLY_SAVINGS',
        targetMonthlySavings,
        historyMonths,
        selectedSourceKeys: Array.from(selectedKeys),
        basisHash: preview.basisHash
      });
      setConfirmedSnapshot(snapshot);
      addToast('Diagnóstico financeiro confirmado', 'success');
    } catch (error: any) {
      const response = error.response?.data as FinancialPlanningApiError | undefined;
      if (response?.code === 'FINANCIAL_PLANNING_PREVIEW_STALE') {
        try {
          const refreshed = await getFinancialPlanningPreview(historyMonths);
          setPreview(refreshed);
          setSelectedKeys(new Set(refreshed.defaultSelectedSourceKeys));
          setConfirmedSnapshot(null);
        } catch {
          // The confirmation error remains the most useful message for this interaction.
        }
      }
      addToast(response?.error || 'Erro ao confirmar diagnóstico financeiro', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (gateError) {
    const requiresProfile = gateError.code !== 'PERSONAL_WORKSPACE_REQUIRED';
    return (
      <div className="space-y-5">
        <Card className="mx-auto max-w-2xl">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-amber-950/50 p-3 text-amber-300">
              {requiresProfile ? <ClipboardCheck size={24} /> : <LockKeyhole size={24} />}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white">
                {requiresProfile ? 'Perfil financeiro necessário' : 'Use seu workspace pessoal'}
              </h2>
              <p className="mt-2 text-sm text-gray-400">{gateError.error}</p>
              {requiresProfile ? (
                <Link
                  href={{
                    pathname: '/profile/financial',
                    query: { returnTo: '/financial/budgets?view=guided' }
                  }}
                  className="mt-5 inline-flex rounded bg-accent px-3 py-2 font-semibold text-white transition-colors hover:bg-accent-hover"
                >
                  {gateError.code === 'FINANCIAL_PROFILE_OUTDATED'
                    ? 'Revisar perfil financeiro'
                    : 'Configurar perfil financeiro'}
                </Link>
              ) : (
                <p className="mt-4 rounded-lg border border-gray-700 bg-[#11161d] p-3 text-sm text-gray-300">
                  Troque o workspace ativo pelo seu workspace pessoal no seletor do Zenit.
                </p>
              )}
            </div>
          </div>
        </Card>
        {requiresProfile && <FinancialPlanningSnapshotHistory />}
      </div>
    );
  }

  if (!preview) {
    return (
      <Card className="mx-auto max-w-xl text-center">
        <AlertTriangle className="mx-auto text-amber-300" size={28} />
        <p className="mt-3 text-white">Não foi possível preparar o diagnóstico.</p>
      </Card>
    );
  }

  const qualityTone =
    preview.dataQuality.rating === 'HIGH'
      ? 'text-emerald-300'
      : preview.dataQuality.rating === 'MEDIUM'
        ? 'text-amber-300'
        : 'text-red-300';
  const result = confirmedSnapshot || preview.latestSnapshot;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-white">Planejamento orientado</h2>
          <InfoModalButton
            modalTitle="Sobre o Planejamento Orientado"
            buttonLabel="Ajuda sobre o Planejamento Orientado"
          >
            <p>
              O Zenit monta um retrato determinístico das receitas, compromissos, provisões e médias
              históricas. Você decide quais fontes entram no cálculo.
            </p>
            <p>
              Confirmar cria um snapshot imutável. Nenhuma transação, provisão ou receita fixa é
              alterada, e nenhuma recomendação por IA é gerada nesta etapa.
            </p>
          </InfoModalButton>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-surface px-3 py-1.5 text-sm text-gray-300">
          <ShieldCheck size={15} className="text-emerald-300" />
          {preview.workspace.name}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-5">
          <Card headerTitle="Objetivo e período">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <CurrencyInput
                label="Quanto deseja economizar por mês?"
                value={targetMonthlySavings}
                onChange={(value) => {
                  setTargetMonthlySavings(value);
                  setConfirmedSnapshot(null);
                }}
                required
                selectOnFocus
                className="mb-0"
              />
              <label className="block text-sm font-medium text-gray-300">
                Histórico para calcular médias
                <select
                  value={historyMonths}
                  onChange={(event) => setHistoryMonths(Number(event.target.value))}
                  className="mt-1 w-full rounded border border-gray-700 bg-background px-3 py-2 text-white outline-none focus:border-accent focus:ring"
                >
                  <option value={3}>Últimos 3 meses completos</option>
                  <option value={6}>Últimos 6 meses completos</option>
                  <option value={12}>Últimos 12 meses completos</option>
                </select>
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
              <History size={14} />
              Período analisado: {formatDateKey(preview.period.startDate)} a{' '}
              {formatDateKey(preview.period.endDate)}
            </div>
          </Card>

          <Card headerTitle="Dados considerados">
            <div className="space-y-6">
              {sourceGroups.map((group) => {
                const sources = preview.sources.filter((source) => source.kind === group.kind);
                return (
                  <section key={group.kind} aria-labelledby={`source-group-${group.kind}`}>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3
                        id={`source-group-${group.kind}`}
                        className="text-sm font-semibold text-gray-200"
                      >
                        {group.title}
                      </h3>
                      <span className="text-xs text-gray-500">
                        {sources.filter((source) => selectedKeys.has(source.key)).length}/
                        {sources.length} incluída(s)
                      </span>
                    </div>
                    {sources.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-gray-700 px-4 py-3 text-sm text-gray-500">
                        {group.emptyLabel}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {sources.map((source) => (
                          <label
                            key={source.key}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                              selectedKeys.has(source.key)
                                ? 'border-accent/60 bg-accent/5'
                                : 'border-gray-700 bg-[#11161d] opacity-70'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(source.key)}
                              onChange={() => toggleSource(source.key)}
                              aria-label={`Considerar ${source.label}`}
                              className="h-4 w-4 rounded border-gray-600 bg-background text-accent focus:ring-accent"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-white">
                                {source.label}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-gray-500">
                                {source.detail}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold text-white">
                              {formatMoney(source.monthlyAmount)}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-400">Qualidade dos dados</p>
                <p className={`mt-1 text-3xl font-semibold ${qualityTone}`}>
                  {preview.dataQuality.score}%
                </p>
              </div>
              <Database className={qualityTone} size={28} />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${preview.dataQuality.score}%` }}
              />
            </div>
            <div className="mt-4 space-y-2">
              {preview.dataQuality.breakdown.map((item) => (
                <div key={item.key} className="flex justify-between gap-3 text-xs">
                  <span className="text-gray-500">{item.label}</span>
                  <span className="text-gray-300">
                    {item.points}/{item.maximum}
                  </span>
                </div>
              ))}
            </div>
            {preview.dataQuality.issues.length > 0 && (
              <div className="mt-4 space-y-2">
                {preview.dataQuality.issues.map((issue) => (
                  <div
                    key={issue.code}
                    className="flex items-start gap-2 rounded-lg border border-amber-900/60 bg-amber-950/20 p-2.5 text-xs text-amber-200"
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    {issue.message}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card headerTitle="Retrato mensal selecionado">
            <div className="space-y-3">
              <SummaryRow label="Receitas fixas" value={totals.monthlyIncome} positive />
              <SummaryRow label="Fixas e parcelas" value={totals.monthlyCommittedExpenses} />
              <SummaryRow label="Gastos variáveis" value={totals.monthlyVariableExpenses} />
              <SummaryRow label="Provisões" value={totals.monthlyProvisionContribution} />
              <div className="border-t border-gray-700 pt-3">
                <SummaryRow
                  label="Disponível antes da meta"
                  value={totals.monthlyAvailableBeforeGoal}
                  emphasize
                />
                <SummaryRow
                  label="Margem após a meta"
                  value={totals.monthlyBalanceAfterGoal}
                  emphasize
                  tone={Number(totals.monthlyBalanceAfterGoal) < 0 ? 'danger' : 'success'}
                />
              </div>
            </div>

            {!selectedFixedIncome && (
              <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-200">
                Selecione ao menos uma receita fixa para confirmar o diagnóstico.
              </div>
            )}
            <Button
              type="button"
              variant="accent"
              disabled={!canConfirm}
              onClick={() => void confirmSnapshot()}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : <ClipboardCheck size={17} />}
              {saving ? 'Confirmando...' : 'Confirmar retrato financeiro'}
            </Button>
          </Card>

          {result && (
            <Card>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={21} />
                <div>
                  <p className="font-medium text-white">
                    {confirmedSnapshot ? 'Retrato confirmado' : 'Último retrato confirmado'}
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    Meta de {formatMoney(result.targetMonthlySavings)} por mês · qualidade{' '}
                    {result.dataQualityScore}%
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Snapshot #{result.id} · perfil v{result.profileVersion} ·{' '}
                    {formatDateTime(result.confirmedAt)}
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
      <FinancialPlanningSnapshotHistory />
    </div>
  );
}

function SummaryRow({
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
