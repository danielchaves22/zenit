import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import HabitualExpenseCategories from './HabitualExpenseCategories';
import ForecastBudgetComparison from './ForecastBudgetComparison';
import {
  defaultForecastOptions,
  FinancialForecast as ForecastData,
  ForecastOptions,
  ForecastSource,
  ForecastTransaction,
  getFinancialForecast
} from '@/lib/financial-forecast';

const currency = (value: string | number) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const monthName = (month: string) => {
  const name = new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  return name.charAt(0).toUpperCase() + name.slice(1);
};
const shiftMonth = (month: string, delta: number) => {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1 + delta, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};
const labels: Record<ForecastSource, { title: string; description: string }> = {
  income: {
    title: 'Receitas fixas',
    description: 'Somente receitas recorrentes, previstas ou já registradas'
  },
  fixed: {
    title: 'Despesas fixas',
    description: 'Fora do cartão, previstas ou já registradas'
  },
  other: {
    title: 'Outras despesas',
    description: 'Fora do cartão, incluindo parcelas com vencimento no mês'
  },
  cards: {
    title: 'Cartões de crédito',
    description: 'Faturas do mês, incluindo fixas, parcelas e créditos'
  },
  variable: {
    title: 'Gastos variáveis estimados',
    description: 'Somente o adicional ainda não coberto pelos registros'
  }
};

function Transactions({ items }: { items: ForecastTransaction[] }) {
  return (
    <ul className="divide-y divide-border">
      {items.map((item, index) => (
        <li
          key={`${item.transactionId ?? 'projected'}-${index}`}
          className={`flex flex-wrap justify-between gap-2 py-3 ${item.included ? '' : 'opacity-50'}`}
        >
          <div className="min-w-0">
            <p className="break-words text-sm text-text">{item.description}</p>
            <p className="text-xs text-text-muted">
              {item.categoryName} ·{' '}
              {item.projected ? 'Fixa projetada' : item.settled ? 'Liquidado' : 'A liquidar'}
              {item.installment &&
                ` · Parcela ${item.installment.number ?? '?'} de ${item.installment.total ?? '?'}`}
              {!item.included && ' · Fora do cenário'}
            </p>
          </div>
          <span className="text-sm tabular-nums text-text">
            {Number(item.amount) * (item.type === 'INCOME' ? 1 : -1) >= 0 ? '+' : '−'}{' '}
            {currency(Math.abs(Number(item.amount)))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function FinancialForecast({
  initialMonth,
  onMonthChange
}: {
  initialMonth?: string;
  onMonthChange?: (month: string | undefined) => void;
}) {
  const [month, setMonth] = useState<string | undefined>(initialMonth);
  const [options, setOptions] = useState<ForecastOptions>(defaultForecastOptions);
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    setMonth(initialMonth);
  }, [initialMonth]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFinancialForecast(month, options)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(
            reason.response?.data?.error || 'Não foi possível calcular a previsão. Tente novamente.'
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, options, retry]);

  function selectMonth(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
    setMonth(value);
    onMonthChange?.(value);
  }
  function toggleSource(key: ForecastSource) {
    setOptions((current) => ({
      ...current,
      sources: { ...current.sources, [key]: !current.sources[key] }
    }));
  }
  if (!data && loading)
    return (
      <Card>
        <div className="flex items-center gap-3 text-text-muted" role="status">
          <Loader2 className="animate-spin" size={20} /> Calculando previsão…
        </div>
      </Card>
    );
  if (error)
    return (
      <Card>
        <p role="alert" className="mb-4 text-danger">
          {error}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button>
          <Button
            variant="outline"
            onClick={() => {
              setMonth(data?.currentMonth);
              onMonthChange?.(data?.currentMonth);
              setOptions(defaultForecastOptions);
              setDrafts({});
            }}
          >
            Voltar ao mês atual
          </Button>
        </div>
      </Card>
    );
  if (!data) return null;
  const partial =
    Object.values(options.sources).some((included) => !included) ||
    options.cardMode === 'KNOWN_ONLY' ||
    options.excludedIncomeIds.length > 0 ||
    options.excludedVariableKeys.length > 0;
  const result = Number(data.result);
  const variableTotal = data.variables
    .filter((item) => item.included)
    .reduce((sum, item) => sum + Number(item.remainingProjected), 0);
  return (
    <div className="space-y-5" aria-busy={loading}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-text-muted">Como este mês deve terminar?</p>
          <h2 className="text-xl font-semibold text-text">{monthName(data.month)}</h2>
        </div>
        <div className="flex max-w-full items-center gap-2">
          <Button
            variant="outline"
            aria-label="Mês anterior"
            disabled={loading || data.month <= data.currentMonth}
            onClick={() => selectMonth(shiftMonth(data.month, -1))}
          >
            <ChevronLeft size={18} />
          </Button>
          <label className="min-w-0">
            <span className="sr-only">Mês da previsão</span>
            <input
              type="month"
              aria-label="Mês da previsão"
              value={month ?? data.month}
              min={data.currentMonth}
              max={data.maximumMonth}
              disabled={loading}
              onChange={(event) => selectMonth(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
            />
          </label>
          <Button
            variant="outline"
            aria-label="Próximo mês"
            disabled={loading || data.month >= data.maximumMonth}
            onClick={() => selectMonth(shiftMonth(data.month, 1))}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <Card className="p-0">
        <div
          role="status"
          aria-live="polite"
          className={`p-5 sm:p-7 ${loading ? 'opacity-50' : ''}`}
        >
          <p className="text-sm text-text-muted">
            {loading
              ? 'Atualizando previsão…'
              : result > 0
                ? 'Sobra prevista no mês'
                : result < 0
                  ? 'Déficit previsto no mês'
                  : 'Entradas e saídas em equilíbrio'}
          </p>
          <p
            className={`mt-2 break-words text-3xl font-semibold tabular-nums sm:text-4xl ${result < 0 ? 'text-tone-red' : 'text-tone-emerald'}`}
          >
            {currency(Math.abs(result))}
          </p>
          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-text-muted">
            <span>
              Entradas <strong className="ml-2 text-text">{currency(data.income)}</strong>
            </span>
            <span>
              Saídas <strong className="ml-2 text-text">{currency(data.expense)}</strong>
            </span>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm text-text-muted">
              Saldo acumulado neste cenário{' '}
              <strong
                className={`ml-2 tabular-nums ${Number(data.endingBalance) < 0 ? 'text-tone-red' : 'text-text'}`}
              >
                {currency(data.endingBalance)}
              </strong>
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Parte do saldo atual de {currency(data.currentBalance)} e considera os movimentos
              restantes até o mês escolhido.
            </p>
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium text-text">O que entra nesta previsão</h3>
          <span className="text-xs text-text-muted">
            {partial ? 'Cenário com fontes limitadas' : 'Todas as fontes incluídas'}
          </span>
        </div>
        <fieldset disabled={loading} className="mt-2 divide-y divide-border">
          {data.sources.map((source) => (
            <div key={source.key}>
              <label className="grid cursor-pointer grid-cols-[20px_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-4 sm:grid-cols-[20px_minmax(0,1fr)_auto]">
                <input
                  type="checkbox"
                  checked={options.sources[source.key]}
                  onChange={() => toggleSource(source.key)}
                  className="mt-1 h-4 w-4 accent-blue-500"
                />
                <span>
                  <span className="block text-sm font-medium text-text">
                    {labels[source.key].title}
                  </span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {labels[source.key].description}
                  </span>
                </span>
                <span
                  className={`col-start-2 flex flex-wrap gap-x-4 text-sm tabular-nums sm:col-start-auto sm:block sm:text-right ${source.included ? 'text-text' : 'text-text-subtle line-through'}`}
                >
                  {source.key === 'income' ? (
                    <span className="block">+ {currency(source.income)}</span>
                  ) : (
                    <span className="block">− {currency(source.expense)}</span>
                  )}
                </span>
              </label>
              {source.key === 'income' && (
                <details className="mb-4 ml-8 rounded-lg border border-border px-3 py-2">
                  <summary className="cursor-pointer text-sm text-text">Ver receitas</summary>
                  <p className="mt-3 text-xs text-text-muted">
                    Marque as receitas fixas que deseja considerar neste cenário. Receitas variáveis
                    não entram na previsão nem geram médias.
                  </p>
                  {data.incomes.length === 0 ? (
                    <p className="mt-3 text-sm text-text-muted">
                      Nenhuma receita fixa prevista ou registrada neste período.
                    </p>
                  ) : (
                    <fieldset
                      disabled={!options.sources.income}
                      className="mt-2 divide-y divide-border"
                    >
                      {data.incomes.map((income) => (
                        <label
                          key={income.id}
                          className="flex cursor-pointer items-start gap-3 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={!options.excludedIncomeIds.includes(income.id)}
                            onChange={(event) =>
                              setOptions((current) => ({
                                ...current,
                                excludedIncomeIds: event.target.checked
                                  ? current.excludedIncomeIds.filter((id) => id !== income.id)
                                  : [...current.excludedIncomeIds, income.id]
                              }))
                            }
                            className="mt-1 h-4 w-4 shrink-0 accent-blue-500"
                          />
                          <span
                            className={`min-w-0 flex-1 text-sm ${income.included ? 'text-text' : 'text-text-subtle'}`}
                          >
                            <span className="block break-words">{income.description}</span>
                            <span
                              className={`mt-1 block text-xs tabular-nums ${income.included ? '' : 'line-through'}`}
                            >
                              {Number(income.amount) !== 0
                                ? `+ ${currency(income.amount)} no mês`
                                : 'Sem recebimento no mês escolhido'}
                            </span>
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                </details>
              )}
            </div>
          ))}
        </fieldset>
        <p className="text-xs text-text-muted">
          As escolhas valem para todos os meses desta projeção. Os movimentos já realizados
          permanecem no saldo atual.
        </p>
      </Card>
      <div className="space-y-2 text-sm text-text-muted">
        {!data.habitual.configured && <p className="text-tone-amber">Categorias habituais ainda não configuradas. A previsão considera os compromissos, mas ainda não estima novos gastos variáveis.</p>}
        {data.habitual.configured && data.habitual.categoryIds.length === 0 && <p className="text-tone-amber">Nenhuma categoria habitual selecionada. As estimativas automáticas de gastos variáveis estão desativadas.</p>}
        <HabitualExpenseCategories onSaved={() => setRetry((value) => value + 1)} />
        {variableTotal > 0 && (
          <p>
            {currency(variableTotal)} das saídas são estimativas de gastos que ainda não estão
            registrados.
          </p>
        )}
        {data.history.months.length < options.historyMonths && (
          <p className="text-tone-amber">
            Histórico disponível: {data.history.months.length} de {options.historyMonths} meses.{' '}
            {data.history.months.length === 0
              ? 'As médias ainda não acrescentam gastos à previsão.'
              : 'A estimativa usa apenas o período disponível.'}
          </p>
        )}
        {data.history.uncategorizedCount > 0 && (
          <p className="text-tone-amber">
            Há gastos sem categoria no histórico que não geraram estimativa variável.
          </p>
        )}
        {data.cardsWithoutCycle.length > 0 && (
          <p className="text-tone-amber">
            Configure fechamento e vencimento para estimar novas compras:{' '}
            {data.cardsWithoutCycle.join(', ')}.
          </p>
        )}
        {data.overdue.items.length > 0 && (
          <p className="text-tone-amber">
            Pendências de meses anteriores: {currency(data.overdue.expense)} a pagar e{' '}
            {currency(data.overdue.income)} a receber.{' '}
            {options.includeOverdue
              ? 'A quitação está simulada no saldo do mês atual.'
              : 'Ainda não incluídas no saldo. Veja os detalhes para simular a quitação.'}
          </p>
        )}
      </div>
      <ForecastBudgetComparison data={data.budgets} month={data.month} partial={partial} />
      <details className="rounded-xl border border-border bg-surface p-5">
        <summary className="cursor-pointer font-medium text-text">
          Ver detalhes e ajustar projeções
        </summary>
        <div className="mt-5 space-y-6">
          <fieldset disabled={loading} className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-text-muted">
              Histórico utilizado
              <select
                value={options.historyMonths}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    historyMonths: Number(event.target.value)
                  }))
                }
                className="mt-2 block w-full rounded-lg border border-border bg-elevated p-2 text-text"
              >
                {[3, 6, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} meses anteriores
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-text-muted">
              Projeção dos cartões
              <select
                value={options.cardMode}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    cardMode: event.target.value as ForecastOptions['cardMode']
                  }))
                }
                className="mt-2 block w-full rounded-lg border border-border bg-elevated p-2 text-text"
              >
                <option value="ESTIMATE">Incluir novos gastos variáveis</option>
                <option value="KNOWN_ONLY">Somente valores das faturas</option>
              </select>
            </label>
          </fieldset>
          <p className="text-xs text-text-muted">
            O histórico termina no mês anterior ao atual. Fixas e parcelas ficam fora das médias
            variáveis. Meses sem movimentos após o primeiro mês com registros entram como zero; os
            anteriores ficam fora da média.
          </p>
          <div>
            <h3 className="font-medium text-text">Médias por categoria</h3>
            <p className="mt-1 text-xs text-text-muted">
              Categorias habituais deste espaço financeiro. Desmarcar ou ajustar aqui vale apenas para este cenário. O sistema acrescenta apenas o que falta além
              dos gastos comparáveis já conhecidos. Os ajustes valem para os meses deste cenário.
            </p>
            {data.variables.length === 0 && (
              <p className="py-5 text-sm text-text-muted">
                Ainda não há histórico de gastos variáveis categorizados para estimar.
              </p>
            )}
            <div className="mt-3 divide-y divide-border">
              {data.variables.map((item) => (
                <div key={item.key} className="py-4">
                  <label className="flex items-start gap-3 text-sm text-text">
                    <input
                      type="checkbox"
                      className="mt-1 accent-blue-500"
                      disabled={loading}
                      checked={!options.excludedVariableKeys.includes(item.key)}
                      onChange={(event) =>
                        setOptions((current) => ({
                          ...current,
                          excludedVariableKeys: event.target.checked
                            ? current.excludedVariableKeys.filter((key) => key !== item.key)
                            : [...current.excludedVariableKeys, item.key]
                        }))
                      }
                    />
                    <span>
                      {item.categoryName}
                      <span className="block text-xs text-text-muted">
                        {item.channel === 'CARD' ? item.accountName : 'Fora do cartão'}
                      </span>
                    </span>
                  </label>
                  <dl className="my-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-muted">
                    <div>
                      <dt>Média histórica</dt>
                      <dd className="text-sm text-text">{currency(item.historicalAverage)}</dd>
                    </div>
                    <div>
                      <dt>Já considerado</dt>
                      <dd className="text-sm text-text">{currency(item.committedInMonth)}</dd>
                    </div>
                    <div>
                      <dt>Adicional incluído</dt>
                      <dd className="text-sm text-text">
                        {currency(item.included ? item.remainingProjected : 0)}
                      </dd>
                    </div>
                  </dl>
                  {item.cycleUnavailable && (
                    <p className="mb-3 text-xs text-tone-amber">
                      Este ciclo não recebe novas compras. A estimativa só entra nos próximos ciclos
                      disponíveis.
                    </p>
                  )}
                  <div className="flex flex-wrap items-end gap-3">
                    <CurrencyInput
                      id={`forecast-${item.key}`}
                      label={`Estimativa mensal de ${item.categoryName} (${item.accountName ?? 'fora do cartão'})`}
                      value={drafts[item.key] ?? options.overrides[item.key] ?? item.expectedAmount}
                      onChange={(value) =>
                        setDrafts((current) => ({ ...current, [item.key]: value }))
                      }
                      disabled={loading}
                      className="max-w-xs !mb-0"
                    />
                    {(item.adjusted || drafts[item.key] !== undefined) && (
                      <Button
                        variant="outline"
                        disabled={loading}
                        onClick={() => {
                          setDrafts((current) => {
                            const next = { ...current };
                            delete next[item.key];
                            return next;
                          });
                          setOptions((current) => {
                            const next = { ...current.overrides };
                            delete next[item.key];
                            return { ...current, overrides: next };
                          });
                        }}
                      >
                        Usar média
                      </Button>
                    )}
                  </div>
                  <details className="mt-3 text-xs text-text-muted">
                    <summary className="cursor-pointer">Meses usados na média</summary>
                    <ul className="mt-2 space-y-1">
                      {item.history.map((point) => (
                        <li key={point.month} className="flex max-w-sm justify-between gap-4">
                          <span>{monthName(point.month)}</span>
                          <span>{currency(point.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              ))}
            </div>
            <Button
              disabled={loading || Object.keys(drafts).length === 0}
              onClick={() => {
                setOptions((current) => ({
                  ...current,
                  overrides: { ...current.overrides, ...drafts }
                }));
                setDrafts({});
              }}
            >
              Aplicar ajustes ao cenário
            </Button>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-text">
              Compromissos do mês ({data.transactions.length})
            </summary>
            <Transactions items={data.transactions} />
          </details>
          {data.overdue.items.length > 0 && (
            <div className="space-y-3 border-t border-border pt-5">
              <h3 className="font-medium text-text">Pendências de meses anteriores</h3>
              <label className="flex items-start gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  className="mt-1 accent-blue-500"
                  disabled={loading}
                  checked={options.includeOverdue}
                  onChange={(event) =>
                    setOptions((current) => ({ ...current, includeOverdue: event.target.checked }))
                  }
                />
                <span>
                  Simular a quitação no mês atual
                  <span className="mt-1 block text-xs text-text-muted">
                    Afeta o saldo acumulado uma única vez. O resultado dos meses e os vencimentos
                    originais são preservados.
                  </span>
                </span>
              </label>
              <Transactions items={data.overdue.items} />
            </div>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-medium text-text">
              Como o saldo chega ao mês escolhido
            </summary>
            <p className="my-3 text-xs text-text-muted">
              Saldo atual: {currency(data.currentBalance)}. No mês atual, apenas movimentos ainda
              não liquidados alteram esse saldo.
              {options.includeOverdue &&
                ` Ajuste pelas pendências anteriores: ${currency(data.overdue.cashEffect)}.`}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-text-muted">
                    <th className="py-2 pr-3">Mês</th>
                    <th className="px-3 text-right">Resultado</th>
                    <th className="pl-3 text-right">Saldo ao final</th>
                  </tr>
                </thead>
                <tbody>
                  {data.timeline.map((point) => (
                    <tr key={point.month} className="border-t border-border text-text">
                      <td className="py-3 pr-3">{monthName(point.month)}</td>
                      <td className="px-3 text-right tabular-nums">{currency(point.result)}</td>
                      <td className="pl-3 text-right tabular-nums">
                        {currency(point.endingBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              setOptions(defaultForecastOptions);
              setDrafts({});
            }}
          >
            <RotateCcw size={15} className="mr-2" /> Restaurar cenário completo
          </Button>
        </div>
      </details>
    </div>
  );
}
