import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { BrazilLocation, Contact, GeographyCity, GeographyState } from '@/lib/types';
import { CitySelect } from './CitySelect';

export function ContactLocation({
  value,
  onChange,
  contact,
  companyId,
  disabled,
  enabled,
  onResolved
}: {
  value: BrazilLocation | null;
  onChange: (value: BrazilLocation) => void;
  contact: Pick<Contact, 'country' | 'state' | 'city'> | null;
  companyId: number;
  disabled: boolean;
  enabled: boolean;
  onResolved?: (city: string, state: string) => void;
}) {
  const [states, setStates] = useState<GeographyState[]>([]);
  const [cities, setCities] = useState<{ stateCode: string; items: GeographyCity[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const state = value?.stateCode ?? '';
  const resolved = useRef(onResolved);
  resolved.current = onResolved;
  useEffect(() => {
    if (!value || cities?.stateCode !== state) return;
    const city = cities.items.find((item) => item.code === value.cityCode);
    if (value.cityCode && !city) return;
    resolved.current?.(city?.name ?? '', state);
  }, [state, value?.cityCode, cities]);
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setError('');
    setLoading(true);
    Promise.all([
      api<GeographyState[]>('/bizz/geography/states', { companyId }),
      state
        ? api<GeographyCity[]>(`/bizz/geography/states/${state}/cities`, { companyId })
        : Promise.resolve([])
    ])
      .then(([ufs, items]) => {
        if (current) {
          setStates(ufs);
          setCities({ stateCode: state, items });
        }
      })
      .catch(() => {
        if (current) setError('Não foi possível carregar estados e cidades.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [state, companyId, enabled, retry]);
  return (
    <>
      <label>
        País
        <input
          value={value === null ? contact?.country || 'Brasil' : 'Brasil'}
          readOnly
          autoComplete="country-name"
        />
      </label>
      <label>
        Estado
        <select
          aria-label="Estado"
          value={state}
          disabled={disabled || loading || !states.length}
          onChange={(event) => onChange({ stateCode: event.target.value || null, cityCode: null })}
        >
          <option value="">
            {loading && !states.length ? 'Carregando estados…' : 'Selecione'}
          </option>
          {states.map((uf) => (
            <option key={uf.code} value={uf.code}>
              {uf.name} ({uf.code})
            </option>
          ))}
        </select>
      </label>
      <CitySelect
        cities={cities?.stateCode === state ? cities.items : []}
        value={value?.cityCode ?? null}
        onChange={(cityCode) => onChange({ stateCode: state || null, cityCode })}
        disabled={disabled || loading || !state || cities?.stateCode !== state || Boolean(error)}
        loading={loading && Boolean(state)}
      />
      {error && (
        <div className="full-width location-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="button"
            disabled={disabled || loading}
            onClick={() => setRetry((at) => at + 1)}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {value === null &&
        contact &&
        [contact.city, contact.state, contact.country].some(Boolean) && (
          <p className="full-width subtle">
            Endereço anterior:{' '}
            {[contact.city, contact.state, contact.country].filter(Boolean).join(' — ')}. Selecione
            o estado e a cidade para atualizar.
          </p>
        )}
    </>
  );
}
