import { useEffect, useId, useRef } from 'react';
import { Plus, X } from 'lucide-react';

export function ContactValues({
  kind,
  values,
  onChange
}: {
  kind: 'phone' | 'email';
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const id = useId();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);
  const phone = kind === 'phone';
  const singular = phone ? 'telefone' : 'e-mail';
  useEffect(() => {
    if (focusIndex.current === null) return;
    inputs.current[focusIndex.current]?.focus();
    focusIndex.current = null;
  }, [values]);
  return (
    <fieldset className="contact-values">
      <legend>{phone ? 'Telefones' : 'E-mails'}</legend>
      <div className="contact-value-rows">
        {values.map((value, index) => (
          <div className="contact-value-row" key={index}>
            <label className="sr-only" htmlFor={`${id}-${index}`}>
              {phone ? 'Telefone' : 'E-mail'} {index + 1}
            </label>
            <input
              id={`${id}-${index}`}
              ref={(element) => {
                inputs.current[index] = element;
              }}
              type={phone ? 'tel' : 'email'}
              autoComplete={index === 0 ? (phone ? 'tel' : 'email') : 'off'}
              maxLength={phone ? 40 : 254}
              value={value}
              placeholder={phone ? '(00) 00000-0000' : 'contato@empresa.com.br'}
              onChange={(event) =>
                onChange(values.map((item, at) => (at === index ? event.target.value : item)))
              }
            />
            <button
              type="button"
              className="icon-button remove-contact-value"
              aria-label={`Remover ${singular} ${index + 1}`}
              disabled={values.length === 1 && !value}
              onClick={() => {
                const next = values.filter((_, at) => at !== index);
                focusIndex.current = Math.max(0, Math.min(index, next.length - 1));
                onChange(next.length ? next : ['']);
              }}
            >
              <X size={17} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="button quiet add-contact-value"
        disabled={values.length >= 20}
        onClick={() => {
          focusIndex.current = values.length;
          onChange([...values, '']);
        }}
      >
        <Plus size={16} aria-hidden="true" /> Adicionar {singular}
      </button>
    </fieldset>
  );
}
