import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import type { ForecastBudgetComparison as Comparison } from '@/lib/financial-forecast';

const currency = (value: string | number) =>
  Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ForecastBudgetComparison({
  data,
  month,
  partial
}: {
  data: Comparison;
  month: string;
  partial: boolean;
}) {
  const hasBudgets = data.items.some((item) => item.limitAmount !== null);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-text">Previsão e limites por categoria</h2>
        <Link
          href={{ pathname: '/financial/budgets', query: { view: 'monthly', month } }}
          className="text-sm text-tone-blue underline"
        >
          Configurar orçamentos
        </Link>
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {partial
          ? 'Comparação das fontes incluídas neste cenário.'
          : 'O fechamento previsto inclui gastos realizados, compromissos e estimativas habituais.'}{' '}
        Os limites não representam saldo disponível.
      </p>
      {hasBudgets && (
        <div className="my-4 rounded-lg bg-background p-3 text-sm text-text-muted">
          <p>
            Categorias com orçamento: previsão de{' '}
            <strong>{currency(data.coveredForecastAmount)}</strong> para limites de{' '}
            <strong>{currency(data.limitAmount)}</strong>.
          </p>
          {Number(data.unbudgetedForecastAmount) !== 0 && (
            <p className="mt-1">
              Fora dessa comparação: {currency(data.unbudgetedForecastAmount)} em categorias sem
              orçamento.
            </p>
          )}
        </div>
      )}
      {data.items.length === 0 && (
        <p className="py-4 text-sm text-text-muted">
          Ainda não há despesas previstas ou limites definidos para este mês.
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-text">
          Ver categorias e orçamentos
        </summary>
        <div className="mt-3 divide-y divide-border">
          {data.items.map((item) => {
            const margin = item.marginAmount === null ? null : Number(item.marginAmount);
            const status =
              margin === null
                ? 'Sem limite definido'
                : margin < 0
                  ? 'Acima do limite'
                  : margin === 0
                    ? 'No limite'
                    : 'Dentro do limite';
            const tone =
              margin === null ? 'text-text' : margin < 0 ? 'text-tone-red' : 'text-tone-emerald';
            return (
              <div key={item.categoryId ?? 'uncategorized'} className="py-4">
                <p className="font-medium text-text">
                  {item.categoryName}
                  {item.includeChildren && (
                    <span className="ml-2 text-xs text-text-muted">inclui subcategorias</span>
                  )}
                </p>
                <p className={'mt-1 text-lg font-semibold ' + tone}>
                  Fechamento previsto: {currency(item.forecastAmount)}
                </p>
                <p className={'text-sm ' + tone}>{status}</p>
                <p className="mt-1 text-sm text-text-muted">
                  Orçamento mensal:{' '}
                  {item.limitAmount === null ? 'não definido' : currency(item.limitAmount)}
                </p>
                {margin !== null && (
                  <p className="text-sm text-text-muted">
                    {margin < 0 ? 'Excesso previsto: ' : 'Margem prevista: '}
                    {currency(Math.abs(margin))}
                  </p>
                )}
                <details className="mt-2 text-xs text-text-muted">
                  <summary className="cursor-pointer">
                    Ver composição de {item.categoryName}
                  </summary>
                  <dl className="mt-2 flex flex-wrap gap-4">
                    <div>
                      <dt>Realizado</dt>
                      <dd>{currency(item.realizedAmount)}</dd>
                    </div>
                    <div>
                      <dt>Compromissos pendentes</dt>
                      <dd>{currency(item.committedAmount)}</dd>
                    </div>
                    <div>
                      <dt>Estimativa complementar</dt>
                      <dd>{currency(item.estimatedAmount)}</dd>
                    </div>
                  </dl>
                </details>
              </div>
            );
          })}
        </div>
      </details>
    </Card>
  );
}
