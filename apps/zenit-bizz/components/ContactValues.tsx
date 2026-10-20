import { useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  InlineEditor,
  PendingRowChange,
  RowAction,
  usePendingRow
} from '@zenit/product-attributes';
import { formatContactValue } from '@/lib/contact-masks';
import { MaskedContactInput } from './MaskedContactInput';

export function ContactValues({
  kind,
  values,
  onChange,
  onPendingChange
}: {
  kind: 'phone' | 'email';
  values: string[];
  onChange: (values: string[]) => void;
  onPendingChange?: PendingRowChange;
}) {
  const id = useId();
  const add = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  const [error, setError] = useState('');
  const phone = kind === 'phone';
  const singular = phone ? 'telefone' : 'e-mail';
  const title = phone ? 'Telefone' : 'E-mail';
  usePendingRow(kind, editing !== null, onPendingChange);
  function finish() {
    setEditing(null);
    setError('');
    requestAnimationFrame(() => add.current?.focus());
  }
  function confirm() {
    if (!editing) return;
    const value = phone ? editing.value.trim() : editing.value.trim().toLowerCase();
    const key = (text: string) =>
      phone ? text.replace(/\D/g, '') || text.toLowerCase() : text.toLowerCase();
    if (!value) {
      setError(`Informe o ${singular}.`);
      return;
    }
    if (values.some((current, index) => index !== editing.index && key(current) === key(value))) {
      setError(`Este ${singular} está repetido.`);
      return;
    }
    onChange(
      editing.index === values.length
        ? [...values, value]
        : values.map((current, index) => (index === editing.index ? value : current))
    );
    finish();
  }
  const editor = editing && (
    <InlineEditor label={singular} confirm={confirm} cancel={finish}>
      <label className="sr-only" htmlFor={id}>
        {title} {editing.index + 1}
      </label>
      {phone ? (
        <MaskedContactInput
          id={id}
          autoFocus
          required
          type="tel"
          mask="phone"
          autoComplete="tel"
          maxLength={40}
          value={editing.value}
          placeholder="(00) 00000-0000"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(value) => {
            setEditing({ ...editing, value });
            setError('');
          }}
        />
      ) : (
        <input
          id={id}
          autoFocus
          required
          type="email"
          autoComplete="email"
          maxLength={254}
          value={editing.value}
          placeholder="contato@empresa.com.br"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setEditing({ ...editing, value: event.target.value });
            setError('');
          }}
        />
      )}
      {error && (
        <p role="alert" id={`${id}-error`}>
          {error}
        </p>
      )}
    </InlineEditor>
  );
  return (
    <fieldset className="contact-values">
      <legend>{phone ? 'Telefones' : 'E-mails'}</legend>
      <div className="contact-value-rows">
        {values.map((value, index) =>
          editing?.index === index ? (
            <div key={index}>{editor}</div>
          ) : (
            <div className="inline-value-row" key={index}>
              <span className="inline-row-content">
                {phone ? formatContactValue(value, 'phone') : value}
              </span>
              <div className="inline-row-actions">
                <RowAction
                  action="edit"
                  label={`Editar ${singular} ${index + 1}`}
                  disabled={editing !== null}
                  onClick={() => setEditing({ index, value })}
                />
                <RowAction
                  action="remove"
                  label={`Remover ${singular} ${index + 1}`}
                  disabled={editing !== null}
                  onClick={() => {
                    onChange(values.filter((_, at) => at !== index));
                    add.current?.focus();
                  }}
                />
              </div>
            </div>
          )
        )}
        {editing?.index === values.length && editor}
      </div>
      <button
        type="button"
        ref={add}
        className="button add-contact-value"
        disabled={values.length >= 20 || editing !== null}
        onClick={() => setEditing({ index: values.length, value: '' })}
      >
        <Plus size={16} aria-hidden="true" /> Adicionar {singular}
      </button>
    </fieldset>
  );
}
