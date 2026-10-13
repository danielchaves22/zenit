import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface LookupItem {
  id: string;
  name: string;
  unit?: string;
}
export function PurchaseLookup({
  label,
  path,
  companyId,
  value,
  onChange
}: {
  label: string;
  path: string;
  companyId: number;
  value: LookupItem | null;
  onChange: (value: LookupItem | null) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(value?.name ?? '');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<LookupItem[]>([]);
  const [active, setActive] = useState(0);
  const [state, setState] = useState('');
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, id]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setItems([]);
    setState('Pesquisando…');
    const timer = setTimeout(() => {
      void api<{ items: LookupItem[]; total: number }>(
        `${path}&q=${encodeURIComponent(query)}&page=1`,
        { companyId, signal: controller.signal }
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setItems(data.items);
            setActive(0);
            setState(
              data.items.length
                ? data.total > 20
                  ? 'Refine a busca para encontrar outros cadastros.'
                  : ''
                : 'Nenhum cadastro encontrado'
            );
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setState('Não foi possível pesquisar. Tente novamente.');
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query, path, companyId]);
  const select = (item: LookupItem) => {
    onChange(item);
    setQuery(item.name);
    setOpen(false);
  };
  return (
    <div
      className="purchase-lookup"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        required
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-activedescendant={open && items[active] ? `${id}-${active}` : undefined}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange(null);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
              Math.max(
                0,
                Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))
              )
            );
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (items[active]) select(items[active]);
          }
        }}
      />
      {open && (
        <div className="purchase-lookup-popup">
          <ul id={`${id}-options`} role="listbox" aria-label={label}>
            {items.map((item, index) => (
              <li
                key={item.id}
                id={`${id}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(item)}
              >
                {item.name}
                {item.unit && <small>{item.unit}</small>}
              </li>
            ))}
          </ul>
          {state && <p role="status">{state}</p>}
        </div>
      )}
    </div>
  );
}
