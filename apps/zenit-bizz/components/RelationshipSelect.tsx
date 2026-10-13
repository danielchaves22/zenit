import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const options = [
  { key: 'isCustomer', label: 'Cliente' },
  { key: 'isSupplier', label: 'Fornecedor' }
] as const;

export function RelationshipSelect({
  value,
  onChange,
  disabled
}: {
  value: { isCustomer: boolean; isSupplier: boolean };
  onChange: (key: 'isCustomer' | 'isSupplier', checked: boolean) => void;
  disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstOption = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    firstOption.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const selected = options.filter((option) => value[option.key]).map((option) => option.label);
  return (
    <div
      className="relationship-select"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span className="field-label" id={`${id}-label`}>
        Relacionamento <span className="subtle">(opcional)</span>
      </span>
      <button
        ref={trigger}
        type="button"
        className="select-trigger"
        aria-labelledby={`${id}-label ${id}-value`}
        aria-expanded={open && !disabled}
        aria-controls={`${id}-options`}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            firstOption.current?.focus();
          }
        }}
      >
        <span id={`${id}-value`} className={selected.length ? '' : 'subtle'}>
          {selected.length ? selected.join(', ') : 'Selecione'}
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && !disabled && (
        <div
          id={`${id}-options`}
          className="select-options"
          role="group"
          aria-labelledby={`${id}-label`}
        >
          {options.map((option, index) => (
            <label key={option.key}>
              <input
                ref={index === 0 ? firstOption : undefined}
                type="checkbox"
                checked={value[option.key]}
                onChange={(event) => onChange(option.key, event.target.checked)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
