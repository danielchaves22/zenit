import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { GeographyCity } from '@/lib/types';

const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function CitySelect({
  cities,
  value,
  onChange,
  disabled,
  loading
}: {
  cities: GeographyCity[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
  loading: boolean;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const options = [
    ...(query ? [] : [{ code: '', name: 'Sem cidade' }]),
    ...cities.filter((city) => normalized(city.name).includes(normalized(query)))
  ];
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (open)
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, id, open]);
  function choose(code: string) {
    onChange(code || null);
    setOpen(false);
    trigger.current?.focus();
  }
  function show() {
    setQuery('');
    setActive(value ? Math.max(0, cities.findIndex((city) => city.code === value) + 1) : 0);
    setOpen(true);
  }
  return (
    <div
      ref={root}
      className="city-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span className="field-label" id={`${id}-label`}>
        Cidade
      </span>
      <button
        type="button"
        role="combobox"
        ref={trigger}
        className="select-trigger"
        aria-labelledby={`${id}-label`}
        aria-expanded={open && !disabled}
        aria-controls={`${id}-options`}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            show();
          }
        }}
      >
        <span>
          {loading
            ? 'Carregando cidades…'
            : (cities.find((city) => city.code === value)?.name ?? 'Selecione')}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div className="city-options">
          <input
            ref={search}
            aria-label="Buscar cidade"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={`${id}-options`}
            aria-activedescendant={options[active] ? `${id}-option-${active}` : undefined}
            placeholder="Buscar cidade"
            value={query}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                setActive((current) =>
                  Math.max(
                    0,
                    Math.min(options.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))
                  )
                );
              }
              if (event.key === 'Enter') {
                event.preventDefault();
                if (options[active]) choose(options[active].code);
              }
            }}
          />
          <ul role="listbox" id={`${id}-options`} aria-labelledby={`${id}-label`}>
            {options.map((option, index) => (
              <li
                key={option.code}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={(value ?? '') === option.code}
                data-active={active === index}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option.code)}
              >
                {option.name}
              </li>
            ))}
          </ul>
          {options.length === 0 && <p role="status">Nenhuma cidade encontrada.</p>}
        </div>
      )}
    </div>
  );
}
