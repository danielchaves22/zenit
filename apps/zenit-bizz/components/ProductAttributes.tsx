import { useEffect, useRef, useState } from 'react';
import {
  InlineEditor,
  PendingRowChange,
  RowAction,
  usePendingRow,
  AttributeListResult,
  AttributeValue,
  ProductAttribute,
  attributeError
} from '@zenit/product-attributes';
import { api } from '@/lib/api';

export function ProductAttributes({
  companyId,
  values,
  change,
  service,
  onPendingChange
}: {
  companyId: number;
  values: AttributeValue[];
  change: (values: AttributeValue[]) => void;
  service: boolean;
  onPendingChange?: PendingRowChange;
}) {
  const [open, setOpen] = useState(values.length > 0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AttributeValue | null>(null);
  const [valueError, setValueError] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  usePendingRow('attributes', adding || !!editing, onPendingChange);
  function finish() {
    setEditing(null);
    setAdding(false);
    setValueError('');
    requestAnimationFrame(() => addButton.current?.focus());
  }
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AttributeListResult | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, ProductAttribute>>({});
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const ids = values
    .map((v) => v.attributeId)
    .sort()
    .join(',');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadError('');
    // Existing assignments include their labels, so failures never erase saved values.
    void Promise.all(
      ids
        .split(',')
        .filter(Boolean)
        .map((id) =>
          api<ProductAttribute>(`/bizz/attributes/${id}`, { companyId, signal: controller.signal })
        )
    )
      .then((items) => {
        if (!controller.signal.aborted)
          setDefinitions((current) => ({
            ...current,
            ...Object.fromEntries(items.map((a) => [a.id, a]))
          }));
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setLoadError(attributeError(cause));
      });
    return () => controller.abort();
  }, [companyId, ids, open, retry]);
  useEffect(() => {
    if (!adding || !open) return;
    const controller = new AbortController();
    setResult(null);
    setError('');
    const timer = setTimeout(() => {
      void api<AttributeListResult>(
        `/bizz/attributes?${new URLSearchParams({ q: query, page: String(page) })}`,
        { companyId, signal: controller.signal }
      )
        .then((value) => {
          if (!controller.signal.aborted) setResult(value);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(attributeError(cause));
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [companyId, adding, open, query, page, retry]);
  function add(id: string) {
    const attribute = result?.items.find((a) => a.id === id);
    if (!attribute || values.some((v) => v.attributeId === id)) return;
    setDefinitions((d) => ({ ...d, [id]: attribute }));
    setEditing({
      attributeId: id,
      attribute,
      ...(attribute.type === 'TEXT'
        ? { textValue: '' }
        : attribute.type === 'NUMBER'
          ? { numberValue: '' }
          : { optionId: '' })
    });
    setAdding(false);
    setQuery('');
    setPage(1);
  }
  const definition = editing ? definitions[editing.attributeId] : undefined;
  const meta = definition ?? editing?.attribute;
  const previous = values.find((v) => v.attributeId === editing?.attributeId);
  const editor = editing && (
    <InlineEditor
      label="característica"
      cancel={finish}
      confirm={() => {
        if (!definition || !meta) return;
        if (meta.type === 'TEXT' && !editing.textValue?.trim()) {
          setValueError('Informe o valor.');
          return;
        }
        if (
          meta.type === 'NUMBER' &&
          !/^-?\d{1,12}(?:\.\d{1,6})?$/.test(editing.numberValue ?? '')
        ) {
          setValueError('Informe um número com até 12 dígitos inteiros e 6 casas decimais.');
          return;
        }
        if (meta.type === 'SELECT' && !editing.optionId) {
          setValueError('Selecione o valor.');
          return;
        }
        const next = {
          ...editing,
          ...(meta.type === 'TEXT' ? { textValue: editing.textValue!.trim() } : {})
        };
        change(
          previous
            ? values.map((v) => (v.attributeId === next.attributeId ? next : v))
            : [...values, next]
        );
        finish();
      }}
    >
      <label>
        <span>
          {meta?.name ?? 'Característica'}
          {meta?.unit ? ` (${meta.unit})` : ''}
        </span>
        {meta?.type === 'SELECT' ? (
          <select
            autoFocus
            required
            value={editing.optionId ?? ''}
            onChange={(e) => {
              setEditing({
                ...editing,
                optionId: e.target.value,
                option: definition?.options.find((o) => o.id === e.target.value) ?? null
              });
              setValueError('');
            }}
          >
            <option value="">Selecionar valor</option>
            {definition?.options
              .filter((o) => o.active || o.id === previous?.optionId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                  {!o.active && ' · Inativo'}
                </option>
              ))}
          </select>
        ) : (
          <input
            autoFocus
            required
            maxLength={meta?.type === 'NUMBER' ? 20 : 500}
            inputMode={meta?.type === 'NUMBER' ? 'decimal' : undefined}
            value={
              meta?.type === 'NUMBER'
                ? (editing.numberValue ?? '').replace('.', ',')
                : (editing.textValue ?? '')
            }
            onChange={(e) => {
              setEditing({
                ...editing,
                ...(meta?.type === 'NUMBER'
                  ? { numberValue: e.target.value.replace(',', '.') }
                  : { textValue: e.target.value })
              });
              setValueError('');
            }}
          />
        )}
      </label>
      {valueError && <p role="alert">{valueError}</p>}
    </InlineEditor>
  );
  return (
    <details
      className="product-attributes attribute-ui"
      open={open}
      onToggle={(e) => setOpen(adding || !!editing || e.currentTarget.open)}
    >
      <summary onClick={(event) => { if (adding || editing) event.preventDefault(); }}>
        Características{' '}
        <span className="attribute-muted">
          {values.length ? `(${values.length})` : '(opcional)'}
        </span>
      </summary>
      <div className="product-attributes-body">
        {service && values.length > 0 && (
          <p className="attribute-error" role="alert">
            Remova as características antes de mudar o cadastro para serviço.
          </p>
        )}
        {loadError && (
          <div>
            <p role="alert" className="attribute-error">
              {loadError}
            </p>
            <button type="button" className="attribute-button" onClick={() => setRetry(retry + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {values.map((value, index) => {
          if (editing?.attributeId === value.attributeId)
            return (
              <div key={value.attributeId} className="inline-row-fields">
                {editor}
              </div>
            );
          const definition = definitions[value.attributeId];
          const meta = definition ?? value.attribute;
          const selected = definition?.options.find((o) => o.id === value.optionId) ?? value.option;
          return (
            <div className="inline-value-row" key={value.attributeId}>
              <div className="inline-row-content">
                <strong>{meta?.name ?? 'Característica'}</strong>
                <small>
                  {meta?.type === 'SELECT'
                    ? (selected?.label ?? 'Valor atual')
                    : meta?.type === 'NUMBER'
                      ? `${(value.numberValue ?? '').replace('.', ',')}${meta.unit ? ` ${meta.unit}` : ''}`
                      : value.textValue}
                  {meta && !meta.active
                    ? ' · Característica inativa'
                    : selected && !selected.active
                      ? ' · Valor inativo'
                      : ''}
                </small>
              </div>
              <div className="inline-row-actions">
                <RowAction
                  action="edit"
                  label={`Editar ${meta?.name ?? 'característica'}`}
                  disabled={!!editing || adding || !definition || !meta?.active || service}
                  onClick={() => {
                    setValueError('');
                    setEditing({ ...value });
                  }}
                />
                <RowAction
                  action="remove"
                  label={`Remover ${meta?.name ?? 'característica'}`}
                  disabled={!!editing || adding}
                  onClick={() => {
                    change(values.filter((_, i) => i !== index));
                    addButton.current?.focus();
                  }}
                />
              </div>
            </div>
          );
        })}
        {editing && !previous && editor}
        {!service && (
          <button
            className="attribute-button"
            type="button"
            ref={addButton}
            disabled={values.length >= 50 || adding || !!editing}
            onClick={() => setAdding(true)}
          >
            + Adicionar característica
          </button>
        )}
        {adding && !service && (
          <div className="attribute-picker">
            <label>
              Buscar característica
              <input
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault();
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    finish();
                  }
                }}
                type="search"
                value={query}
                maxLength={100}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            {error ? (
              <>
                <p role="alert" className="attribute-error">
                  {error}
                </p>
                <button
                  type="button"
                  className="attribute-button"
                  onClick={() => setRetry(retry + 1)}
                >
                  Tentar novamente
                </button>
              </>
            ) : !result ? (
              <p role="status">Carregando características…</p>
            ) : (
              <label>
                Característica
                <select value="" onChange={(e) => add(e.target.value)}>
                  <option value="">
                    {result.items.some((a) => !values.some((v) => v.attributeId === a.id))
                      ? 'Selecionar característica'
                      : 'Nenhuma característica disponível'}
                  </option>
                  {result.items
                    .filter((a) => !values.some((v) => v.attributeId === a.id))
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.scope === 'global' ? 'Global' : 'Da empresa'}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {result && (result.total > 20 || page > 1) && (
              <div className="attribute-pagination">
                <button
                  type="button"
                  className="attribute-button"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterior
                </button>
                <span>Página {page}</span>
                <button
                  type="button"
                  className="attribute-button"
                  disabled={page * 20 >= result.total}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </button>
              </div>
            )}
            <button className="attribute-button" type="button" onClick={finish}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
