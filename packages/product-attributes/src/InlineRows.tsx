import React, {
  ButtonHTMLAttributes,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

type Action = 'edit' | 'remove' | 'confirm' | 'cancel' | 'deactivate' | 'activate';
const paths: Record<Action, ReactNode> = {
  edit: (
    <>
      <path d="m16 3 5 5-12 12-6 1 1-6Z" />
      <path d="m14 5 5 5" />
    </>
  ),
  remove: (
    <>
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </>
  ),
  confirm: <path d="m5 12 4 4L19 6" />,
  cancel: <path d="m6 6 12 12M6 18 18 6" />,
  deactivate: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m6 6 12 12" />
    </>
  ),
  activate: (
    <>
      <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
    </>
  )
};

export function RowAction({
  action,
  label,
  ...props
}: {
  action: Action;
  label: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type="button"
      className={`inline-row-action ${action}`}
      aria-label={label}
      title={label}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {paths[action]}
      </svg>
    </button>
  );
}

export function InlineEditor({
  children,
  label,
  confirm,
  cancel,
  disabled = false
}: {
  children: ReactNode;
  label: string;
  confirm: () => void;
  cancel: () => void;
  disabled?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  function accept() {
    if (disabled) return;
    const fields = container.current?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input, select, textarea');
    for (const field of Array.from(fields ?? [])) if (!field.reportValidity()) return;
    confirm();
  }
  return (
    <div
      className="inline-row-editor"
      ref={container}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.nativeEvent.isComposing) return;
        const target = event.target as HTMLElement;
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancel();
        } else if (event.key === 'Enter' && target.tagName === 'INPUT') {
          event.preventDefault();
          accept();
        }
      }}
    >
      <div className="inline-row-fields">{children}</div>
      <div className="inline-row-actions">
        <RowAction
          action="confirm"
          label={`Confirmar ${label}`}
          onClick={accept}
          disabled={disabled}
        />
        <RowAction action="cancel" label={`Cancelar ${label}`} onClick={cancel} />
      </div>
    </div>
  );
}

export type PendingRowChange = (key: string, pending: boolean) => void;
export function usePendingRow(key: string, pending: boolean, change?: PendingRowChange) {
  useEffect(() => {
    change?.(key, pending);
    return () => change?.(key, false);
  }, [key, pending, change]);
}
export function usePendingRows() {
  const [rows, setRows] = useState<Record<string, boolean>>({});
  const change = useCallback<PendingRowChange>((key, pending) => {
    setRows((current) => (current[key] === pending ? current : { ...current, [key]: pending }));
  }, []);
  return { pending: Object.values(rows).some(Boolean), change };
}
