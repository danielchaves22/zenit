import { useEffect, useId, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { AddressDraft } from '@/lib/contact-addresses';
import { MaskedContactInput } from './MaskedContactInput';

type PostalAddress = Pick<AddressDraft, 'postalCode' | 'street' | 'neighborhood' | 'location'>;
type UpdateAddress = (update: (current: AddressDraft) => AddressDraft) => void;

export function PostalCodeField({
  address,
  update,
  companyId,
  disabled
}: {
  address: AddressDraft;
  update: UpdateAddress;
  companyId: number;
  disabled: boolean;
}) {
  const id = useId();
  const updateRef = useRef(update);
  updateRef.current = update;
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState<{
    cep: string;
    snapshot: AddressDraft;
    companyId: number;
  } | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pending || disabled || pending.companyId !== companyId) {
      if (pending) {
        setPending(null);
        setStatus('');
        setError('');
      }
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    const { cep, snapshot } = pending;
    const timer = setTimeout(() => {
      setStatus('Consultando CEP…');
      api<PostalAddress>(`/bizz/geography/postal-codes/${cep}`, {
        companyId,
        signal: controller.signal
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          updateRef.current((current) => {
            if (controller.signal.aborted || current.postalCode?.replace(/\D/g, '') !== cep)
              return current;
            // Preserve changes made while the lookup was pending, including state/city selection.
            return {
              ...current,
              ...(result.street && current.street === snapshot.street
                ? { street: result.street }
                : {}),
              ...(result.neighborhood && current.neighborhood === snapshot.neighborhood
                ? { neighborhood: result.neighborhood }
                : {}),
              ...(JSON.stringify(current.location) === JSON.stringify(snapshot.location)
                ? { location: result.location }
                : {})
            };
          });
          setStatus('');
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;
          setStatus('');
          setError(
            failure instanceof ApiError
              ? failure.message
              : 'Não foi possível consultar o CEP. Preencha o endereço manualmente.'
          );
        });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [pending, companyId, disabled]);

  function lookup(cep: string) {
    active.current?.abort();
    setStatus('');
    setError('');
    setPending(/^\d{8}$/.test(cep) ? { cep, snapshot: address, companyId } : null);
  }

  return (
    <div className="postal-code-field">
      <label htmlFor={id}>CEP</label>
      <MaskedContactInput
        id={id}
        mask="cep"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={20}
        value={address.postalCode ?? ''}
        disabled={disabled}
        aria-describedby={status || error ? `${id}-status` : undefined}
        onChange={(postalCode) => {
          update((current) => ({ ...current, postalCode }));
          lookup(postalCode);
        }}
      />
      {status && (
        <p id={`${id}-status`} className="subtle" role="status">
          {status}
        </p>
      )}
      {error && (
        <div id={`${id}-status`} className="location-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="button"
            disabled={disabled}
            onClick={() => lookup((address.postalCode ?? '').replace(/\D/g, ''))}
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
