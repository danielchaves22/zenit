import { useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  InlineEditor,
  PendingRowChange,
  RowAction,
  usePendingRow
} from '@zenit/product-attributes';
import { AddressDraft, emptyAddress, hasAddressData } from '@/lib/contact-addresses';
import { formatContactValue } from '@/lib/contact-masks';
import { ContactLocation } from './ContactLocation';
import { PostalCodeField } from './PostalCodeField';

export function ContactAddresses({
  values,
  onChange,
  companyId,
  disabled,
  onPendingChange
}: {
  values: AddressDraft[];
  onChange: (change: (current: AddressDraft[]) => AddressDraft[]) => void;
  companyId: number;
  disabled: boolean;
  onPendingChange?: PendingRowChange;
}) {
  const id = useId();
  const add = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState<AddressDraft | null>(null);
  const [primary, setPrimary] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');
  usePendingRow('addresses', editing !== null, onPendingChange);
  function update(next: (current: AddressDraft) => AddressDraft) {
    setEditing((current) => (current ? next(current) : null));
  }
  function change<K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) {
    update((current) => ({ ...current, [key]: value }));
  }
  function finish() {
    setEditing(null);
    setError('');
    requestAnimationFrame(() => add.current?.focus());
  }
  function confirm() {
    if (!editing) return;
    if (!hasAddressData({ ...editing, country: '' })) {
      setError('Informe os dados do endereço.');
      return;
    }
    onChange((current) => {
      const next = current.some((a) => a.key === editing.key)
        ? current.map((a) => (a.key === editing.key ? editing : a))
        : [...current, editing];
      return primary ? [editing, ...next.filter((a) => a.key !== editing.key)] : next;
    });
    finish();
  }
  const index = editing ? values.findIndex((a) => a.key === editing.key) : -1;
  const editor = editing && (
    <fieldset
      className="inline-address-editor"
      disabled={disabled}
      aria-label={`Endereço ${index < 0 ? values.length + 1 : index + 1}`}
    >
      <InlineEditor label="endereço" confirm={confirm} cancel={finish}>
        <div className="form-grid">
          <label className="full-width">
            Identificação
            <input
              autoFocus
              maxLength={60}
              placeholder="Ex.: Entrega, cobrança"
              value={editing.label ?? ''}
              onChange={(e) => change('label', e.target.value)}
            />
          </label>
          <PostalCodeField
            address={editing}
            update={update}
            companyId={companyId}
            disabled={disabled}
          />
          <ContactLocation
            value={editing.location}
            onChange={(value) => {
              update((current) => ({
                ...current,
                location: value,
                city: '',
                state: value.stateCode ?? '',
                country: 'Brasil'
              }));
            }}
            contact={editing}
            companyId={companyId}
            disabled={disabled}
            enabled
            onResolved={(city, state) =>
              update((current) =>
                current.city === city && current.state === state
                  ? current
                  : { ...current, city, state, country: 'Brasil' }
              )
            }
          />
          <label className="full-width">
            Logradouro
            <input
              autoComplete="address-line1"
              maxLength={160}
              value={editing.street ?? ''}
              onChange={(e) => change('street', e.target.value)}
            />
          </label>
          <label>
            Número
            <input
              maxLength={20}
              value={editing.addressNumber ?? ''}
              onChange={(e) => change('addressNumber', e.target.value)}
            />
          </label>
          <label>
            Complemento
            <input
              autoComplete="address-line2"
              maxLength={100}
              value={editing.complement ?? ''}
              onChange={(e) => change('complement', e.target.value)}
            />
          </label>
          <label>
            Bairro
            <input
              maxLength={100}
              value={editing.neighborhood ?? ''}
              onChange={(e) => change('neighborhood', e.target.value)}
            />
          </label>
        </div>
        {values.length > 0 && index !== 0 && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={primary}
              onChange={(e) => setPrimary(e.target.checked)}
            />{' '}
            Endereço principal
          </label>
        )}
        {error && <p role="alert">{error}</p>}
      </InlineEditor>
    </fieldset>
  );
  return (
    <section ref={root} className="contact-addresses" aria-labelledby={id}>
      <h2 id={id}>
        Endereços <span className="subtle">(opcional)</span>
      </h2>
      <div className="address-list">
        {values.map((address, at) =>
          address.key === editing?.key ? (
            <div key={address.key}>{editor}</div>
          ) : (
            <div key={address.key}>
              <div className="inline-value-row">
                <div className="inline-row-content">
                  <strong>{address.label || `Endereço ${at + 1}`}</strong>
                  {at === 0 && <span className="address-primary">Principal</span>}
                  <small>
                    {[address.street, address.addressNumber, address.complement]
                      .filter(Boolean)
                      .join(', ')}
                  </small>
                  <small>
                    {[
                      address.neighborhood,
                      address.city,
                      address.state || address.location?.stateCode,
                      address.postalCode ? formatContactValue(address.postalCode, 'cep') : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>
                <div className="inline-row-actions">
                  <RowAction
                    action="edit"
                    label={`Editar endereço ${at + 1}`}
                    disabled={disabled || !!editing || !!removing}
                    onClick={() => {
                      setEditing(structuredClone(address));
                      setPrimary(at === 0);
                    }}
                  />
                  <RowAction
                    action="remove"
                    label={`Remover endereço ${at + 1}`}
                    disabled={disabled || !!editing || !!removing}
                    onClick={() => setRemoving(address.key)}
                  />
                </div>
              </div>
              {removing === address.key && (
                <div className="address-remove-confirm" role="alert">
                  <p>Remover este endereço?</p>
                  <div className="address-actions">
                    <button
                      type="button"
                      className="button"
                      autoFocus
                      onClick={() => {
                        setRemoving(null);
                        requestAnimationFrame(() =>
                          root.current
                            ?.querySelector<HTMLButtonElement>(
                              `[aria-label="Remover endereço ${at + 1}"]`
                            )
                            ?.focus()
                        );
                      }}
                    >
                      Manter endereço
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      onClick={() => {
                        onChange((current) => current.filter((a) => a.key !== address.key));
                        setRemoving(null);
                        requestAnimationFrame(() => add.current?.focus());
                      }}
                    >
                      Confirmar remoção
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        )}
        {editing && index < 0 && editor}
      </div>
      <button
        type="button"
        ref={add}
        className="button"
        disabled={disabled || !!editing || !!removing || values.length >= 20}
        onClick={() => {
          setEditing(emptyAddress());
          setPrimary(values.length === 0);
        }}
      >
        <Plus size={16} aria-hidden="true" /> Adicionar endereço
      </button>
    </section>
  );
}
