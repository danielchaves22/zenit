import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { InlineEditor, RowAction } from './InlineRows';
import { AttributeApi, attributeError, AttributeType, ProductAttribute } from './types';

export function AttributeEditor({
  item,
  platform,
  api,
  protect,
  back,
  saved
}: {
  item: ProductAttribute | null;
  platform: boolean;
  api: AttributeApi;
  protect: (dirty: boolean, busy: boolean) => void;
  back: () => void;
  saved: (item: ProductAttribute) => void;
}) {
  const globalReadOnly = !platform && item?.scope === 'global';
  const owner = platform ? 'global' : 'company';
  const [draft, setDraft] = useState(() => ({
    name: item?.name ?? '',
    description: item?.description ?? '',
    type: item?.type ?? 'SELECT',
    unit: item?.unit ?? '',
    active: item?.active ?? true,
    options: (item?.options.filter((o) => o.scope === owner) ?? []).map(
      ({ id, label, active }) => ({
        key: id,
        id: id as string | undefined,
        label,
        active
      })
    )
  }));
  type OptionDraft = (typeof draft.options)[number];
  const [editing, setEditing] = useState<OptionDraft | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const original = useRef(JSON.stringify(draft));
  const requestKey = useRef('');
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dirty = editing !== null || original.current !== JSON.stringify(draft);
  useEffect(() => {
    requestKey.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    protect(dirty, busy);
    return () => protect(false, false);
  }, [dirty, busy, protect]);
  const update = <K extends keyof typeof draft>(field: K, value: (typeof draft)[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const editable = !globalReadOnly || (draft.type === 'SELECT' && item?.active);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !editable || editing) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const options = draft.options.map(({ id, label, active }) => ({
        ...(id ? { id } : {}),
        label,
        active
      }));
      const data = globalReadOnly
        ? { revision: item!.revision, options }
        : {
            name: draft.name,
            description: draft.description,
            type: draft.type,
            unit: draft.unit,
            active: draft.active,
            options,
            ...(item ? { version: item.version } : { requestKey: requestKey.current })
          };
      const result = await api<ProductAttribute>(
        item ? `/${item.id}${globalReadOnly ? '/options' : ''}` : '',
        {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify(data)
        }
      );
      original.current = JSON.stringify(draft);
      protect(false, false);
      saved(result);
    } catch (cause) {
      setError(attributeError(cause));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function finishOption() {
    setEditing(null);
    setError('');
    requestAnimationFrame(() => addButton.current?.focus());
  }
  const optionEditor = editing && (
    <InlineEditor
      label="valor"
      cancel={finishOption}
      confirm={() => {
        const label = editing.label.trim();
        if (!label) {
          setError('Informe o valor.');
          return;
        }
        const key = (value: string) =>
          value
            .trim()
            .replace(/\s+/g, ' ')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        const originalOption = draft.options.find((o) => o.key === editing.key);
        if (
          draft.options.some((o) => o.key !== editing.key && key(o.label) === key(label)) ||
          (globalReadOnly &&
            (!originalOption || key(originalOption.label) !== key(label)) &&
            item!.options.some((o) => o.scope === 'global' && key(o.label) === key(label)))
        ) {
          setError('Este valor já está cadastrado.');
          return;
        }
        const next = { ...editing, label };
        update(
          'options',
          originalOption
            ? draft.options.map((o) => (o.key === next.key ? next : o))
            : [...draft.options, next]
        );
        finishOption();
      }}
    >
      <label>
        <span className="attribute-sr">Valor</span>
        <input
          autoFocus
          required
          maxLength={100}
          value={editing.label}
          onChange={(e) => {
            setEditing({ ...editing, label: e.target.value });
            setError('');
          }}
        />
      </label>
    </InlineEditor>
  );
  return (
    <div className="attribute-ui">
      <div className="attribute-heading">
        <button type="button" className="attribute-button" onClick={back} disabled={busy}>
          ← Voltar
        </button>
        <h1>
          {globalReadOnly ? item!.name : item ? 'Editar característica' : 'Nova característica'}
        </h1>
        {item && (
          <span className="attribute-badge">
            {item.scope === 'global' ? 'Global' : 'Da empresa'}
          </span>
        )}
      </div>
      <form onSubmit={submit} className="attribute-card">
        <fieldset disabled={busy} className="attribute-body">
          {globalReadOnly ? (
            <dl className="attribute-summary">
              <div>
                <dt>Tipo</dt>
                <dd>
                  {{ SELECT: 'Lista', TEXT: 'Texto', NUMBER: 'Número' }[draft.type]}
                  {draft.unit && ` (${draft.unit})`}
                </dd>
              </div>
              <div>
                <dt>Situação</dt>
                <dd>{draft.active ? 'Ativa' : 'Inativa'}</dd>
              </div>
              {draft.description && (
                <div>
                  <dt>Descrição</dt>
                  <dd>{draft.description}</dd>
                </div>
              )}
            </dl>
          ) : (
            <>
              <label>
                Nome <span aria-hidden="true">*</span>
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={draft.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </label>
              <label>
                Descrição <span className="attribute-muted">(opcional)</span>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={draft.description}
                  onChange={(e) => update('description', e.target.value)}
                />
              </label>
              <div className="attribute-grid">
                <label>
                  Tipo
                  <select
                    value={draft.type}
                    disabled={Boolean(item) || editing !== null}
                    onChange={(e) => {
                      const type = e.target.value as AttributeType;
                      setDraft((d) => ({
                        ...d,
                        type,
                        unit: type === 'NUMBER' ? d.unit : '',
                        options: type === 'SELECT' ? d.options : []
                      }));
                    }}
                  >
                    <option value="SELECT">Lista de valores</option>
                    <option value="TEXT">Texto</option>
                    <option value="NUMBER">Número</option>
                  </select>
                </label>
                {draft.type === 'NUMBER' && (
                  <label>
                    Unidade <span className="attribute-muted">(opcional)</span>
                    <input
                      maxLength={20}
                      disabled={Boolean(item) || editing !== null}
                      placeholder="Ex.: cm"
                      value={draft.unit}
                      onChange={(e) => update('unit', e.target.value)}
                    />
                  </label>
                )}
              </div>
              {item && (
                <label className="attribute-check">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => update('active', e.target.checked)}
                  />
                  Característica ativa
                </label>
              )}
            </>
          )}
          {globalReadOnly && draft.type === 'SELECT' && (
            <section aria-labelledby="global-values-title">
              <h2 id="global-values-title">Valores globais</h2>
              <div className="attribute-chips">
                {item!.options
                  .filter((o) => o.scope === 'global')
                  .map((o) => (
                    <span className="attribute-badge" key={o.id}>
                      {o.label}
                      {!o.active && ' · Inativo'}
                    </span>
                  ))}
                {!item!.options.some((o) => o.scope === 'global') && (
                  <span className="attribute-muted">Nenhum valor cadastrado.</span>
                )}
              </div>
            </section>
          )}
          {draft.type === 'SELECT' && (
            <section aria-labelledby="own-values-title" className="attribute-values">
              <h2 id="own-values-title">{globalReadOnly ? 'Valores da empresa' : 'Valores'}</h2>
              {draft.options.map((o) =>
                editing?.key === o.key ? (
                  <div key={o.key}>{optionEditor}</div>
                ) : (
                  <div className="inline-value-row" key={o.key}>
                    <span className="inline-row-content">
                      {o.label}
                      {!o.active && <small>Inativo</small>}
                    </span>
                    <div className="inline-row-actions">
                      <RowAction
                        action="edit"
                        label={`Editar valor ${o.label}`}
                        disabled={!editable || !!editing}
                        onClick={() => {
                          setError('');
                          setEditing({ ...o });
                        }}
                      />
                      <RowAction
                        action={o.id ? (o.active ? 'deactivate' : 'activate') : 'remove'}
                        label={`${o.id ? (o.active ? 'Inativar' : 'Reativar') : 'Remover'} valor ${o.label}`}
                        disabled={!editable || !!editing}
                        onClick={() =>
                          update(
                            'options',
                            o.id
                              ? draft.options.map((v) =>
                                  v.key === o.key ? { ...v, active: !v.active } : v
                                )
                              : draft.options.filter((v) => v.key !== o.key)
                          )
                        }
                      />
                    </div>
                  </div>
                )
              )}
              {editing && !draft.options.some((o) => o.key === editing.key) && optionEditor}
              {editable && (
                <button
                  type="button"
                  ref={addButton}
                  className="attribute-button"
                  disabled={draft.options.length >= 200 || !!editing}
                  onClick={() => {
                    setError('');
                    setEditing({
                      key: crypto.randomUUID(),
                      id: undefined,
                      label: '',
                      active: true
                    });
                  }}
                >
                  + Adicionar valor
                </button>
              )}
            </section>
          )}
          {error && (
            <p className="attribute-error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <div className="attribute-actions">
          {editing && (
            <p className="inline-row-pending">Confirme ou cancele a edição em andamento.</p>
          )}
          <button className="attribute-button" type="button" disabled={busy} onClick={back}>
            {editable ? 'Cancelar' : 'Voltar'}
          </button>
          {editable && (
            <button className="attribute-button primary" disabled={busy || !!editing}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
