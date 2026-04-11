import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface TagOption {
  id: number;
  name: string;
  usageCount?: number;
}

interface TagMultiSelectAutocompleteProps {
  id?: string;
  label?: string;
  placeholder?: string;
  selectedOptions: TagOption[];
  onSelectedOptionsChange: (options: TagOption[]) => void;
  fetchOptions: (query: string) => Promise<TagOption[]>;
  disabled?: boolean;
  className?: string;
  emptyMessage?: string;
  error?: string;
}

export function TagMultiSelectAutocomplete({
  id,
  label,
  placeholder = 'Digite para buscar tags...',
  selectedOptions,
  onSelectedOptionsChange,
  fetchOptions,
  disabled = false,
  className = '',
  emptyMessage = 'Nenhuma tag encontrada.',
  error
}: TagMultiSelectAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<TagOption[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const selectedIds = useMemo(
    () => new Set(selectedOptions.map((option) => option.id)),
    [selectedOptions]
  );

  const availableOptions = useMemo(
    () => options.filter((option) => !selectedIds.has(option.id)),
    [options, selectedIds]
  );

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  const clearDebounceTimeout = () => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  };

  const loadOptions = useCallback(
    async (searchText: string) => {
      setLoading(true);
      try {
        const fetched = await fetchOptions(searchText);
        setOptions(Array.isArray(fetched) ? fetched : []);
      } catch {
        setOptions([]);
      } finally {
        setLoading(false);
      }
    },
    [fetchOptions]
  );

  useEffect(() => {
    if (!isOpen) return;

    clearDebounceTimeout();
    debounceTimeoutRef.current = setTimeout(() => {
      void loadOptions(query.trim());
    }, 300);

    return clearDebounceTimeout;
  }, [isOpen, query, loadOptions]);

  useEffect(() => {
    return () => {
      clearBlurTimeout();
      clearDebounceTimeout();
    };
  }, []);

  function handleOpen() {
    if (disabled) return;
    clearBlurTimeout();
    setIsOpen(true);
  }

  function handleBlur() {
    clearBlurTimeout();
    blurTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      setActiveIndex(-1);
    }, 120);
  }

  function selectOption(option: TagOption) {
    if (selectedIds.has(option.id)) return;
    onSelectedOptionsChange([...selectedOptions, option]);
    setQuery('');
    setActiveIndex(-1);
    setIsOpen(true);
    inputRef.current?.focus();
  }

  function removeOption(optionId: number) {
    if (disabled) return;
    onSelectedOptionsChange(selectedOptions.filter((option) => option.id !== optionId));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (event.key === 'Backspace' && query.length === 0 && selectedOptions.length) {
      event.preventDefault();
      const last = selectedOptions[selectedOptions.length - 1];
      removeOption(last.id);
      return;
    }

    if (!isOpen || availableOptions.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev < availableOptions.length - 1 ? prev + 1 : 0));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : availableOptions.length - 1));
      return;
    }

    if (event.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < availableOptions.length) {
        event.preventDefault();
        selectOption(availableOptions[activeIndex]);
      }
      return;
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-base-color" htmlFor={id}>
          {label}
        </label>
      )}

      <div
        className={`w-full px-2 py-1.5 bg-background border rounded text-base-color focus-within:outline-none focus-within:ring focus-within:border-[#2563eb] ${
          error ? 'border-red-500' : 'border-gray-700'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        onClick={() => inputRef.current?.focus()}
      >
        <div className="flex flex-wrap items-center gap-2">
          {selectedOptions.map((option) => (
            <span
              key={option.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-soft bg-surface text-xs text-base-color"
            >
              {option.name}
              <button
                type="button"
                className="text-base-color/70 hover:text-base-color"
                onClick={(event) => {
                  event.stopPropagation();
                  removeOption(option.id);
                }}
                disabled={disabled}
                aria-label={`Remover tag ${option.name}`}
              >
                ×
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            id={id}
            type="text"
            value={query}
            onFocus={handleOpen}
            onBlur={handleBlur}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(-1);
              setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 min-w-[180px] bg-transparent text-base-color placeholder:text-muted border-0 !border-0 focus:border-0 focus:ring-0 outline-none shadow-none appearance-none"
            style={{ border: 'none', boxShadow: 'none' }}
            autoComplete="off"
          />
        </div>
      </div>

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-soft rounded shadow-lg max-h-60 overflow-y-auto">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted">Carregando...</div>
          ) : availableOptions.length > 0 ? (
            availableOptions.map((option, index) => (
              <button
                type="button"
                key={option.id}
                className={`w-full text-left px-3 py-2 text-sm border-b border-soft last:border-b-0 hover:bg-elevated ${
                  index === activeIndex ? 'bg-elevated text-base-color' : 'text-base-color'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option);
                }}
              >
                <span>{option.name}</span>
                {typeof option.usageCount === 'number' && (
                  <span className="text-xs text-muted ml-2">({option.usageCount})</span>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted">{emptyMessage}</div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

export default TagMultiSelectAutocomplete;
