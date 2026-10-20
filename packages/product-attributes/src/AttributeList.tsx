import React, { useEffect, useState } from 'react';
import {
  AttributeApi,
  attributeError,
  AttributeFilters,
  AttributeListResult,
  typeLabel
} from './types';

export function AttributeList({
  api,
  platform,
  filters,
  change,
  open
}: {
  api: AttributeApi;
  platform: boolean;
  filters: AttributeFilters;
  change: (filters: AttributeFilters) => void;
  open: (id: string) => void;
}) {
  const [result, setResult] = useState<AttributeListResult | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState(filters.q);
  useEffect(() => setQuery(filters.q), [filters.q]);
  useEffect(() => {
    if (query === filters.q) return;
    const timer = setTimeout(() => change({ ...filters, q: query, page: '1' }), 250);
    return () => clearTimeout(timer);
  }, [query, filters.q, filters.status, filters.scope, filters.page]);
  const params = new URLSearchParams({ ...filters }).toString();
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    void api<AttributeListResult>(`?${params}`, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(attributeError(cause));
      });
    return () => controller.abort();
  }, [api, params, retry]);
  return (
    <div className="attribute-ui">
      <div className="attribute-heading">
        <h1>Características</h1>
        <button className="attribute-button primary" onClick={() => open('new')}>
          + Nova característica
        </button>
      </div>
      <section className="attribute-card" aria-label="Características">
        <div className="attribute-toolbar">
          <label className="attribute-search">
            <span className="attribute-sr">Buscar características</span>
            <input
              type="search"
              maxLength={100}
              placeholder="Buscar características"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {!platform && (
            <label>
              Origem
              <select
                value={filters.scope}
                onChange={(e) => change({ ...filters, q: query, scope: e.target.value, page: '1' })}
              >
                <option value="all">Todas</option>
                <option value="global">Globais</option>
                <option value="company">Da empresa</option>
              </select>
            </label>
          )}
          <label>
            Situação
            <select
              value={filters.status}
              onChange={(e) => change({ ...filters, q: query, status: e.target.value, page: '1' })}
            >
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
              <option value="all">Todas</option>
            </select>
          </label>
        </div>
        {error ? (
          <div className="attribute-empty">
            <p role="alert" className="attribute-error">
              {error}
            </p>
            <button className="attribute-button" onClick={() => setRetry(retry + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : !result ? (
          <p className="attribute-empty" role="status">
            Carregando características…
          </p>
        ) : !result.items.length ? (
          <p className="attribute-empty">Nenhuma característica encontrada.</p>
        ) : (
          <div className="attribute-table-wrap">
            <table className="attribute-table">
              <caption className="attribute-sr">Características</caption>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  {!platform && <th>Origem</th>}
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Nome">
                      <button className="attribute-link" onClick={() => open(a.id)}>
                        {a.name}
                      </button>
                    </td>
                    <td data-label="Tipo">
                      {typeLabel[a.type]}
                      {a.unit && ` (${a.unit})`}
                    </td>
                    {!platform && (
                      <td data-label="Origem">
                        <span className="attribute-badge">
                          {a.scope === 'global' ? 'Global' : 'Da empresa'}
                        </span>
                      </td>
                    )}
                    <td data-label="Situação">{a.active ? 'Ativa' : 'Inativa'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {result && (result.total > 20 || Number(filters.page) > 1) && (
          <div className="attribute-pagination">
            <button
              className="attribute-button"
              disabled={Number(filters.page) <= 1}
              onClick={() => change({ ...filters, page: String(Number(filters.page) - 1) })}
            >
              Anterior
            </button>
            <span>
              Página {filters.page} · {result.total} registros
            </span>
            <button
              className="attribute-button"
              disabled={Number(filters.page) * 20 >= result.total}
              onClick={() => change({ ...filters, page: String(Number(filters.page) + 1) })}
            >
              Próxima
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
