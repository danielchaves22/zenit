import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AddressDraft, emptyAddress, hasAddressData } from '@/lib/contact-addresses';
import { ContactLocation } from './ContactLocation';

function AddressCard({
  address,
  index,
  companyId,
  disabled,
  added,
  update,
  remove,
  makePrimary
}: {
  address: AddressDraft;
  index: number;
  companyId: number;
  disabled: boolean;
  added: boolean;
  update: (value: AddressDraft) => void;
  remove: () => void;
  makePrimary: () => void;
}) {
  const [open, setOpen] = useState(index === 0 || added);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const summary = useRef<HTMLElement>(null);
  const removal = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (!confirmRemove && wasConfirming.current) removal.current?.focus();
    wasConfirming.current = confirmRemove;
  }, [confirmRemove]);
  const change = <K extends keyof AddressDraft>(key: K, value: AddressDraft[K]) =>
    update({ ...address, [key]: value });
  return (
    <details
      className="address-card"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary ref={summary}>
        <span>{address.label || `Endereço ${index + 1}`}</span>
        {index === 0 && <span className="address-primary">Principal</span>}
      </summary>
      <fieldset
        className="address-card-body"
        aria-label={`Endereço ${index + 1}`}
        disabled={disabled}
      >
        <div className="form-grid">
          <label className="full-width">
            Identificação
            <input
              autoFocus={added}
              maxLength={60}
              placeholder="Ex.: Entrega, cobrança"
              value={address.label ?? ''}
              onChange={(event) => change('label', event.target.value)}
            />
          </label>
          <label>
            CEP
            <input
              autoComplete="postal-code"
              maxLength={20}
              value={address.postalCode ?? ''}
              onChange={(event) => change('postalCode', event.target.value)}
            />
          </label>
          <ContactLocation
            value={address.location}
            onChange={(value) => change('location', value)}
            contact={address}
            companyId={companyId}
            disabled={disabled}
            enabled={open}
          />
          <label className="full-width">
            Logradouro
            <input
              autoComplete="address-line1"
              maxLength={160}
              value={address.street ?? ''}
              onChange={(event) => change('street', event.target.value)}
            />
          </label>
          <label>
            Número
            <input
              maxLength={20}
              value={address.addressNumber ?? ''}
              onChange={(event) => change('addressNumber', event.target.value)}
            />
          </label>
          <label>
            Complemento
            <input
              autoComplete="address-line2"
              maxLength={100}
              value={address.complement ?? ''}
              onChange={(event) => change('complement', event.target.value)}
            />
          </label>
          <label>
            Bairro
            <input
              maxLength={100}
              value={address.neighborhood ?? ''}
              onChange={(event) => change('neighborhood', event.target.value)}
            />
          </label>
        </div>
        {confirmRemove ? (
          <div className="address-remove-confirm" role="alert">
            <p>Remover este endereço?</p>
            <div className="address-actions">
              <button
                type="button"
                className="button"
                autoFocus
                onClick={() => setConfirmRemove(false)}
              >
                Manter endereço
              </button>
              <button type="button" className="button danger" onClick={remove}>
                Confirmar remoção
              </button>
            </div>
          </div>
        ) : (
          <div className="address-actions">
            {index > 0 && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  makePrimary();
                  summary.current?.focus();
                }}
              >
                Definir como principal
              </button>
            )}
            <button
              type="button"
              className="button quiet"
              ref={removal}
              aria-label={`Remover endereço ${index + 1}`}
              onClick={() => (hasAddressData(address) ? setConfirmRemove(true) : remove())}
            >
              <Trash2 size={16} aria-hidden="true" /> Remover
            </button>
          </div>
        )}
      </fieldset>
    </details>
  );
}

export function ContactAddresses({
  values,
  onChange,
  companyId,
  disabled
}: {
  values: AddressDraft[];
  onChange: (values: AddressDraft[]) => void;
  companyId: number;
  disabled: boolean;
}) {
  const id = useId();
  const [added, setAdded] = useState('');
  const add = useRef<HTMLButtonElement>(null);
  return (
    <section className="contact-addresses" aria-labelledby={id}>
      <h2 id={id}>
        Endereços <span className="subtle">(opcional)</span>
      </h2>
      <div className="address-list">
        {values.map((address, index) => (
          <AddressCard
            key={address.key}
            address={address}
            index={index}
            companyId={companyId}
            disabled={disabled}
            added={added === address.key}
            update={(next) =>
              onChange(values.map((value) => (value.key === address.key ? next : value)))
            }
            remove={() => {
              onChange(values.filter((value) => value.key !== address.key));
              add.current?.focus();
            }}
            makePrimary={() =>
              onChange([address, ...values.filter((value) => value.key !== address.key)])
            }
          />
        ))}
      </div>
      <button
        type="button"
        ref={add}
        className="button"
        disabled={disabled || values.length >= 20}
        onClick={() => {
          const next = emptyAddress();
          setAdded(next.key);
          onChange([...values, next]);
        }}
      >
        <Plus size={16} aria-hidden="true" /> Adicionar endereço
      </button>
    </section>
  );
}
