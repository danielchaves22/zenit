import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  RefreshCw,
  Settings,
  XCircle
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { formatCalendarDate } from '@/utils/financialStatus';
import { getInvoiceReferenceLabel } from '@/utils/creditCards';

type HealthStatus = 'OK' | 'WARNING' | 'ERROR';

type MaterializationErrorDetail = {
  templateId?: number | null;
  companyId?: number | null;
  error?: string | null;
};

type JobRunErrorDetails =
  | MaterializationErrorDetail[]
  | null;

type JobRun = {
  id: number;
  status: string;
  startedAt: string;
  durationMs?: number | null;
  processedCount: number;
  createdCount: number;
  failedCount: number;
  errorMessage?: string | null;
  errorDetails?: JobRunErrorDetails;
  companyErrorDetailCount?: number;
  countsScope?: 'GLOBAL';
  errorDetailsScope?: 'COMPANY';
};

type JobOverview = {
  displayName: string;
  schedule: string;
  healthStatus: HealthStatus;
  healthMessage: string;
  recentRuns: JobRun[];
};

type PendingOccurrence = {
  templateId: number;
  description: string;
  amount: string;
  occurrenceKey: string;
};

type CreditCardInvoiceProjectionBlock = {
  invoiceId: number;
  accountId: number;
  accountName: string;
  referenceYear: number;
  referenceMonth: number;
  invoiceKey: string;
  closingDate: string;
  dueDate: string;
  pendingFixedCount: number;
  pendingFixedSubtotal: string;
  pendingOccurrences: PendingOccurrence[];
};

type CreditCardConfigurationIssue = {
  id: number;
  name: string;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
};

type OperationsOverview = {
  status: HealthStatus;
  jobs: JobOverview[];
  issues: {
    creditCardInvoiceProjectionBlocks: CreditCardInvoiceProjectionBlock[];
    creditCardConfigurationIssues: CreditCardConfigurationIssue[];
  };
};

function formatCurrency(value: string | number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function statusTone(status: HealthStatus | string) {
  switch (status) {
    case 'OK':
    case 'SUCCESS':
      return 'border-tone-green/25 bg-tone-green-soft text-tone-green';
    case 'ERROR':
    case 'FAILED':
      return 'border-tone-red/25 bg-tone-red-soft text-tone-red';
    case 'WARNING':
    case 'PARTIAL':
      return 'border-tone-amber/25 bg-tone-amber-soft text-tone-amber';
    case 'RUNNING':
      return 'border-tone-blue/25 bg-tone-blue-soft text-tone-blue';
    default:
      return 'border-border bg-elevated/20 text-text';
  }
}

function statusIcon(status: HealthStatus) {
  if (status === 'OK') {
    return <CheckCircle2 size={18} />;
  }

  if (status === 'ERROR') {
    return <XCircle size={18} />;
  }

  return <AlertTriangle size={18} />;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('pt-BR');
}

function formatDuration(value?: number | null) {
  if (value === null || value === undefined) {
    return '-';
  }

  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isMaterializationErrorDetail(value: unknown): value is MaterializationErrorDetail {
  return (
    isRecord(value) &&
    (typeof value.templateId === 'number' ||
      typeof value.companyId === 'number' ||
      typeof value.error === 'string')
  );
}

function hasJobRunDetails(run: JobRun): boolean {
  return (
    run.failedCount > 0 ||
    run.status === 'FAILED' ||
    run.status === 'PARTIAL' ||
    Boolean(readText(run.errorMessage)) ||
    (run.errorDetails !== null && run.errorDetails !== undefined)
  );
}

function JobRunDetails({ run }: { run: JobRun }) {
  const generalMessage = readText(run.errorMessage);
  const itemErrors = Array.isArray(run.errorDetails)
    ? run.errorDetails.filter(isMaterializationErrorDetail)
    : [];
  const hasReadableDetails = Boolean(generalMessage || itemErrors.length > 0);

  return (
    <div className="rounded-lg border border-border bg-elevated p-4 text-sm text-text-muted">
      <div className="font-medium text-text">Detalhes da execução</div>

      {generalMessage && (
        <div className="mt-3 rounded border border-tone-red/25 bg-tone-red-soft p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-tone-red">Erro geral</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-tone-red">{generalMessage}</p>
        </div>
      )}

      {itemErrors.length > 0 && (
        <ul className="mt-3 space-y-2">
          {itemErrors.map((detail, index) => {
            const context = [
              typeof detail.templateId === 'number' ? `Template ${detail.templateId}` : null,
              typeof detail.companyId === 'number' ? `Empresa ${detail.companyId}` : null
            ].filter(Boolean).join(' - ');

            return (
              <li
                key={`${detail.templateId ?? 'template'}-${detail.companyId ?? 'company'}-${index}`}
                className="rounded border border-tone-amber/25 bg-tone-amber-soft p-3"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-tone-amber">
                  {context || `Falha ${index + 1}`}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-tone-amber">
                  {readText(detail.error) || 'Falha registrada sem mensagem detalhada.'}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {!hasReadableDetails && (
        <p className="mt-2 text-text-muted">
          Não há falhas detalhadas desta empresa para esta execução global.
        </p>
      )}
    </div>
  );
}

export default function OperationsPage() {
  const { addToast } = useToast();
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRunIds, setExpandedRunIds] = useState<Set<number>>(() => new Set());

  const projectionBlocks = overview?.issues.creditCardInvoiceProjectionBlocks || [];
  const configurationIssues = overview?.issues.creditCardConfigurationIssues || [];
  const totalIssues = projectionBlocks.length + configurationIssues.length;
  const firstJob = overview?.jobs[0] || null;

  const summaryCards = useMemo(() => [
    {
      label: 'Saude operacional',
      value: overview?.status || 'Carregando',
      icon: <Activity size={18} />,
      tone: overview ? statusTone(overview.status) : statusTone('RUNNING')
    },
    {
      label: 'Jobs monitorados',
      value: String(overview?.jobs.length || 0),
      icon: <Clock size={18} />,
      tone: 'border-tone-blue/25 bg-tone-blue-soft text-tone-blue'
    },
    {
      label: 'Faturas bloqueadas',
      value: String(projectionBlocks.length),
      icon: <CreditCard size={18} />,
      tone: projectionBlocks.length > 0 ? statusTone('WARNING') : statusTone('OK')
    },
    {
      label: 'Configuracoes pendentes',
      value: String(configurationIssues.length),
      icon: <Settings size={18} />,
      tone: configurationIssues.length > 0 ? statusTone('WARNING') : statusTone('OK')
    }
  ], [configurationIssues.length, overview, projectionBlocks.length]);

  useEffect(() => {
    void loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);

    try {
      const response = await api.get('/admin/operations/overview');
      setOverview(response.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar operacoes do sistema', 'error');
    } finally {
      setLoading(false);
    }
  }

  function toggleRunDetails(runId: number) {
    setExpandedRunIds((current) => {
      const next = new Set(current);

      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }

      return next;
    });
  }

  return (
    <DashboardLayout title="Operacoes">
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Administracao' },
          { label: 'Operacoes' }
        ]}
      />

      <AccessGuard requiredRole="SUPERUSER">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text">Operacoes do Sistema</h1>
            <p className="mt-1 text-sm text-text-muted">
              Monitoramento de jobs e diagnosticos financeiros que exigem acao operacional.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void loadOverview()}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </Button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <Card key={card.label} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase text-text-muted">{card.label}</div>
                  <div className="mt-2 text-2xl font-semibold text-text">{card.value}</div>
                </div>
                <div className={`rounded-lg border p-2 ${card.tone}`}>
                  {card.icon}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {totalIssues === 0 && overview && (
          <div className="mb-6 rounded-lg border border-tone-green/25 bg-tone-green-soft p-4 text-sm text-tone-green">
            Nenhum bloqueio operacional encontrado para a empresa atual.
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
          <div className="space-y-6">
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-text">Jobs</h2>
                  <p className="text-sm text-text-muted">Ultimas execucoes registradas pelo backend.</p>
                  <p className="mt-1 text-xs text-text-subtle">
                    Status e contadores são globais. Os detalhes exibem somente falhas da empresa atual;
                    rastreamentos técnicos globais ficam restritos.
                  </p>
                </div>
                {firstJob && (
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusTone(firstJob.healthStatus)}`}>
                    {statusIcon(firstJob.healthStatus)}
                    {firstJob.healthMessage}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-elevated text-left text-xs uppercase text-text-muted">
                    <tr>
                      <th className="px-3 py-2">Job</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Inicio</th>
                      <th className="px-3 py-2">Duracao</th>
                      <th className="px-3 py-2">Processados (global)</th>
                      <th className="px-3 py-2">Criados (global)</th>
                      <th className="px-3 py-2">Falhas (global)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-sm text-text-muted">
                          Carregando operacoes...
                        </td>
                      </tr>
                    ) : firstJob?.recentRuns.length ? (
                      firstJob.recentRuns.map((run) => {
                        const isExpanded = expandedRunIds.has(run.id);
                        const detailsId = `job-run-details-${run.id}`;

                        return (
                          <React.Fragment key={run.id}>
                            <tr className="border-t border-border text-sm text-text-muted">
                              <td className="px-3 py-3">
                                <div className="font-medium text-text">{firstJob.displayName}</div>
                                <div className="mt-1 text-xs text-text-subtle">{firstJob.schedule}</div>
                              </td>
                              <td className="px-3 py-3">
                                <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusTone(run.status)}`}>
                                  {run.status}
                                </span>
                              </td>
                              <td className="px-3 py-3">{formatDateTime(run.startedAt)}</td>
                              <td className="px-3 py-3">{formatDuration(run.durationMs)}</td>
                              <td className="px-3 py-3">{run.processedCount}</td>
                              <td className="px-3 py-3">{run.createdCount}</td>
                              <td className="px-3 py-3">
                                <div>{run.failedCount}</div>
                                {run.companyErrorDetailCount !== undefined && (
                                  <div className="mt-1 text-xs text-text-subtle">
                                    {run.companyErrorDetailCount} detalhada(s) nesta empresa
                                  </div>
                                )}
                                {hasJobRunDetails(run) && (
                                  <button
                                    type="button"
                                    className="mt-2 inline-flex items-center gap-1 whitespace-nowrap text-left text-xs font-medium text-tone-blue hover:text-tone-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                    aria-expanded={isExpanded}
                                    aria-controls={detailsId}
                                    onClick={() => toggleRunDetails(run.id)}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp size={14} aria-hidden="true" />
                                    ) : (
                                      <ChevronDown size={14} aria-hidden="true" />
                                    )}
                                    {isExpanded ? 'Ocultar detalhes da execução' : 'Ver detalhes da execução'}
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr id={detailsId} className="border-t border-border">
                                <td colSpan={7} className="px-3 pb-4 pt-2">
                                  <JobRunDetails run={run} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-sm text-text-muted">
                          Nenhuma execucao registrada.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-text">Faturas bloqueadas por fixas projetadas</h2>
                <p className="text-sm text-text-muted">
                  Faturas fechadas e nao pagas que ainda possuem ocorrencias fixas sem transacao real.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-elevated text-left text-xs uppercase text-text-muted">
                    <tr>
                      <th className="px-3 py-2">Fatura</th>
                      <th className="px-3 py-2">Cartao</th>
                      <th className="px-3 py-2">Fechamento</th>
                      <th className="px-3 py-2">Pendencias</th>
                      <th className="px-3 py-2">Valor</th>
                      <th className="px-3 py-2">Acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectionBlocks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-sm text-text-muted">
                          Nenhuma fatura bloqueada por fixa projetada.
                        </td>
                      </tr>
                    ) : (
                      projectionBlocks.map((invoice) => (
                        <tr key={invoice.invoiceId} className="border-t border-border text-sm text-text-muted">
                          <td className="px-3 py-3 font-medium text-text">
                            {getInvoiceReferenceLabel(invoice.referenceYear, invoice.referenceMonth)}
                          </td>
                          <td className="px-3 py-3">{invoice.accountName}</td>
                          <td className="px-3 py-3">{formatCalendarDate(invoice.closingDate)}</td>
                          <td className="px-3 py-3">{invoice.pendingFixedCount}</td>
                          <td className="px-3 py-3">{formatCurrency(invoice.pendingFixedSubtotal)}</td>
                          <td className="px-3 py-3">
                            <Link
                              href={`/financial/credit-cards/${invoice.accountId}/invoices?invoiceKey=${encodeURIComponent(invoice.invoiceKey)}`}
                              className="text-tone-blue hover:text-tone-blue"
                            >
                              Abrir fatura
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-text">Detalhes das pendencias</h2>
                <p className="text-sm text-text-muted">Ocorrencias esperadas e ainda nao materializadas.</p>
              </div>

              <div className="space-y-4">
                {projectionBlocks.length === 0 ? (
                  <div className="rounded-lg border border-border p-4 text-sm text-text-muted">
                    Sem ocorrencias pendentes.
                  </div>
                ) : (
                  projectionBlocks.map((invoice) => (
                    <div key={invoice.invoiceId} className="rounded-lg border border-border p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <div className="font-medium text-text">
                            {invoice.accountName} - {getInvoiceReferenceLabel(invoice.referenceYear, invoice.referenceMonth)}
                          </div>
                          <div className="text-xs text-text-muted">
                            Vence {formatCalendarDate(invoice.dueDate)}
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusTone('WARNING')}`}>
                          {invoice.pendingFixedCount} fixa{invoice.pendingFixedCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {invoice.pendingOccurrences.map((occurrence) => (
                          <div key={occurrence.occurrenceKey} className="rounded border border-border bg-elevated p-3">
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="font-medium text-text">{occurrence.description}</span>
                              <span className="text-text-muted">{formatCurrency(occurrence.amount)}</span>
                            </div>
                            <div className="mt-2 text-xs text-text-subtle">
                              Template {occurrence.templateId} - {occurrence.occurrenceKey}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-text">Cartoes com configuracao incompleta</h2>
                <p className="text-sm text-text-muted">
                  Cartoes ativos sem fechamento ou vencimento podem impedir previsao e materializacao.
                </p>
              </div>

              <div className="space-y-3">
                {configurationIssues.length === 0 ? (
                  <div className="rounded-lg border border-border p-4 text-sm text-text-muted">
                    Nenhum cartao ativo com configuracao incompleta.
                  </div>
                ) : (
                  configurationIssues.map((card) => (
                    <div key={card.id} className="rounded-lg border border-tone-amber/25 bg-tone-amber-soft p-4">
                      <div className="font-medium text-text">{card.name}</div>
                      <div className="mt-2 text-sm text-tone-amber">
                        Fechamento: {card.statementClosingDay || 'nao configurado'} - Vencimento:{' '}
                        {card.statementDueDay || 'nao configurado'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </AccessGuard>
    </DashboardLayout>
  );
}
