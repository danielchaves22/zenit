import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  ariaLabel?: string;
  label?: string;
  options: MultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
  triggerClassName?: string;
  required?: boolean;
}

export function MultiSelect({
  ariaLabel,
  label,
  options,
  values,
  onChange,
  placeholder = 'Selecione...',
  disabled = false,
  error,
  className = '',
  triggerClassName = '',
  required = false
}: MultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger = !!containerRef.current?.contains(target);
      const clickedPortal = !!portalRef.current?.contains(target);

      if (clickedTrigger || clickedPortal) {
        return;
      }

      setIsOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useLayoutEffect(() => {
    function updatePosition() {
      if (!triggerRef.current) {
        return;
      }

      const rect = triggerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      });
    }

    if (!isOpen) {
      return;
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const allValues = useMemo(() => options.map((option) => option.value), [options]);
  const allSelected =
    allValues.length > 0 && allValues.every((value) => values.includes(value));
  const hasSelection = values.length > 0;

  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label);

  function toggleOption(value: string, checked: boolean) {
    const nextValues = new Set(values);

    if (checked) {
      nextValues.add(value);
    } else {
      nextValues.delete(value);
    }

    onChange(Array.from(nextValues));
  }

  function getButtonText() {
    if (selectedLabels.length === 0) {
      return placeholder;
    }

    if (selectedLabels.length <= 2) {
      return selectedLabels.join(', ');
    }

    return `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2}`;
  }

  return (
    <div className={`mb-4 ${className}`} ref={containerRef}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-300">
          {label}
          {required && <span className="ml-1 text-red-400">*</span>}
        </label>
      )}

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel || label || placeholder}
          disabled={disabled}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className={`flex w-full items-center justify-between gap-2 rounded border bg-background px-2 py-1.5 text-left text-sm text-white transition-colors focus:outline-none focus:ring focus:border-accent ${
            error ? 'border-red-500' : 'border-gray-700 hover:border-gray-600'
          } ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${triggerClassName}`}
        >
          <span
            className={`min-w-0 flex-1 truncate ${
              selectedLabels.length === 0 ? 'text-gray-400' : 'text-white'
            }`}
          >
            {getButtonText()}
          </span>
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && !disabled && mounted &&
          ReactDOM.createPortal(
            <div
              ref={portalRef}
              className="z-[9999] max-h-64 overflow-auto rounded border border-gray-700 bg-[#1e2126] shadow-lg"
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: position.width
              }}
            >
              {options.length > 0 && (
                <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-gray-700 bg-[#1e2126] px-3 py-2 text-xs text-gray-300">
                  <button
                    type="button"
                    disabled={allSelected}
                    onClick={() => !allSelected && onChange(allValues)}
                    className={`font-semibold uppercase tracking-wide transition-colors ${
                      allSelected ? 'cursor-default text-gray-500' : 'hover:text-white'
                    }`}
                  >
                    Selecionar todos
                  </button>

                  <button
                    type="button"
                    disabled={!hasSelection}
                    onClick={() => hasSelection && onChange([])}
                    className={`font-semibold uppercase tracking-wide transition-colors ${
                      hasSelection
                        ? 'text-red-300 hover:text-white'
                        : 'cursor-default text-gray-500'
                    }`}
                  >
                    Limpar selecao
                  </button>
                </div>
              )}

              {options.map((option) => {
                const checked = values.includes(option.value);

                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-[#262b36] ${
                      checked ? 'text-accent' : 'text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleOption(option.value, event.target.checked)}
                        className="h-4 w-4 rounded border-gray-700 bg-[#1e2126]"
                      />
                      <span className="truncate">{option.label}</span>
                    </div>
                    {checked && <Check size={16} className="text-accent" />}
                  </label>
                );
              })}
            </div>,
            document.body
          )}
      </div>

      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
