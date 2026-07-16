import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';

export interface TagSuggestion {
  id: number;
  name: string;
  usageCount?: number;
}

interface TagInputProps {
  id?: string;
  label?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  pendingValues?: string[];
  onPendingChange?: (tags: string[]) => void;
  fetchSuggestions: (query: string) => Promise<TagSuggestion[]>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minLength?: number;
  maxSuggestions?: number;
  maxTags?: number;
}

type SuggestionItem =
  | { type: 'create'; name: string }
  | { type: 'existing'; suggestion: TagSuggestion };

const TAG_SEPARATOR_REGEX = /[\s,]+/;
const TAG_MAX_LENGTH = 50;

function normalizeTagKey(tag: string) {
  return tag.trim().toLocaleLowerCase('pt-BR');
}

function normalizeTagValue(tag: string) {
  return tag.trim().slice(0, TAG_MAX_LENGTH);
}

function removeTagByKey(tags: string[], keyToRemove: string) {
  return tags.filter((tag) => normalizeTagKey(tag) !== keyToRemove);
}

export function TagInput({
  id,
  label,
  value,
  onChange,
  pendingValues = [],
  onPendingChange,
  fetchSuggestions,
  placeholder = 'Adicionar tag',
  disabled = false,
  className = '',
  minLength = 1,
  maxSuggestions = 10,
  maxTags = 10
}: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<TagSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [isMouseDownOnSuggestion, setIsMouseDownOnSuggestion] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const requestSeqRef = useRef(0);

  const selectedKeys = useMemo(
    () => new Set(value.map((tag) => normalizeTagKey(tag))),
    [value]
  );
  const pendingKeys = useMemo(
    () => new Set(pendingValues.map((tag) => normalizeTagKey(tag))),
    [pendingValues]
  );
  const normalizedInput = normalizeTagValue(inputValue);
  const normalizedInputKey = normalizeTagKey(normalizedInput);
  const exactSuggestion = normalizedInput
    ? suggestions.find((suggestion) => normalizeTagKey(suggestion.name) === normalizedInputKey)
    : undefined;
  const canAddMoreTags = value.length < maxTags;

  const visibleExistingSuggestions = useMemo(
    () =>
      suggestions
        .filter((suggestion) => !selectedKeys.has(normalizeTagKey(suggestion.name)))
        .slice(0, maxSuggestions),
    [maxSuggestions, selectedKeys, suggestions]
  );

  const suggestionItems = useMemo<SuggestionItem[]>(() => {
    const shouldOfferCreate =
      normalizedInput &&
      canAddMoreTags &&
      !exactSuggestion &&
      !selectedKeys.has(normalizedInputKey);

    return [
      ...(shouldOfferCreate ? [{ type: 'create' as const, name: normalizedInput }] : []),
      ...visibleExistingSuggestions.map((suggestion) => ({
        type: 'existing' as const,
        suggestion
      }))
    ];
  }, [
    canAddMoreTags,
    exactSuggestion,
    normalizedInput,
    normalizedInputKey,
    selectedKeys,
    visibleExistingSuggestions
  ]);

  const showSuggestions =
    !disabled &&
    hasFocus &&
    inputValue.trim().length >= minLength &&
    suggestionItems.length > 0;

  const updatePendingValues = useCallback(
    (tag: string, isPending: boolean, currentPending = pendingValues) => {
      if (!onPendingChange) {
        return;
      }

      const key = normalizeTagKey(tag);
      const nextPending = removeTagByKey(currentPending, key);

      if (isPending) {
        nextPending.push(tag);
      }

      onPendingChange(nextPending);
    },
    [onPendingChange, pendingValues]
  );

  const resolveTagCandidate = useCallback(
    (rawTag: string) => {
      const normalizedTag = normalizeTagValue(rawTag);

      if (!normalizedTag || TAG_SEPARATOR_REGEX.test(normalizedTag)) {
        return null;
      }

      const key = normalizeTagKey(normalizedTag);
      const exact = suggestions.find((suggestion) => normalizeTagKey(suggestion.name) === key);

      return {
        name: exact?.name || normalizedTag,
        isPending: !exact
      };
    },
    [suggestions]
  );

  const addTag = useCallback(
    (rawTag: string, forcedPending?: boolean) => {
      const candidate = resolveTagCandidate(rawTag);

      if (!candidate || value.length >= maxTags) {
        return;
      }

      const key = normalizeTagKey(candidate.name);

      if (selectedKeys.has(key)) {
        return;
      }

      const isPending = forcedPending ?? candidate.isPending;
      const nextValue = [...value, candidate.name];
      onChange(nextValue);
      updatePendingValues(candidate.name, isPending);
      setInputValue('');
      setSuggestions([]);
      setActiveSuggestionIndex(-1);
    },
    [maxTags, onChange, resolveTagCandidate, selectedKeys, updatePendingValues, value]
  );

  const removeTag = useCallback(
    (tagToRemove: string) => {
      const key = normalizeTagKey(tagToRemove);
      onChange(removeTagByKey(value, key));
      updatePendingValues(tagToRemove, false);
    },
    [onChange, updatePendingValues, value]
  );

  const debouncedFetch = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim();
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;

      if (normalizedQuery.length < minLength) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const results = await fetchSuggestions(normalizedQuery);

        if (requestSeqRef.current !== requestSeq) {
          return;
        }

        setSuggestions(results.slice(0, maxSuggestions));
        setActiveSuggestionIndex(-1);
      } catch (error) {
        if (requestSeqRef.current === requestSeq) {
          console.error('Error fetching tag suggestions:', error);
          setSuggestions([]);
        }
      } finally {
        if (requestSeqRef.current === requestSeq) {
          setIsLoading(false);
        }
      }
    },
    [fetchSuggestions, maxSuggestions, minLength]
  );

  const queueSuggestionFetch = useCallback(
    (query: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        void debouncedFetch(query);
      }, 250);
    },
    [debouncedFetch]
  );

  function applyTagTokens(rawValue: string) {
    const endsWithSeparator = TAG_SEPARATOR_REGEX.test(rawValue.slice(-1));
    const pieces = rawValue.split(TAG_SEPARATOR_REGEX).filter(Boolean);
    const remainder = endsWithSeparator ? '' : pieces.pop() || '';

    let nextValue = value;
    let nextPending = pendingValues;

    for (const piece of pieces) {
      const candidate = resolveTagCandidate(piece);

      if (!candidate || nextValue.length >= maxTags) {
        continue;
      }

      const key = normalizeTagKey(candidate.name);

      if (nextValue.some((tag) => normalizeTagKey(tag) === key)) {
        continue;
      }

      nextValue = [...nextValue, candidate.name];
      nextPending = removeTagByKey(nextPending, key);

      if (candidate.isPending) {
        nextPending = [...nextPending, candidate.name];
      }
    }

    if (nextValue !== value) {
      onChange(nextValue);
      onPendingChange?.(nextPending);
    }

    setInputValue(remainder);
    queueSuggestionFetch(remainder);
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;

    if (TAG_SEPARATOR_REGEX.test(nextValue)) {
      applyTagTokens(nextValue);
      return;
    }

    setInputValue(nextValue);
    queueSuggestionFetch(nextValue);
  };

  const selectSuggestion = (item: SuggestionItem) => {
    if (item.type === 'create') {
      addTag(item.name, true);
    } else {
      addTag(item.suggestion.name, false);
    }

    setIsMouseDownOnSuggestion(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && inputValue.length === 0 && value.length > 0) {
      event.preventDefault();
      removeTag(value[value.length - 1]);
      return;
    }

    if ((event.key === ' ' || event.key === 'Enter') && inputValue.trim()) {
      event.preventDefault();

      if (
        event.key === 'Enter' &&
        showSuggestions &&
        activeSuggestionIndex >= 0 &&
        activeSuggestionIndex < suggestionItems.length
      ) {
        selectSuggestion(suggestionItems[activeSuggestionIndex]);
        return;
      }

      addTag(inputValue);
      return;
    }

    if (event.key === 'Tab' && inputValue.trim()) {
      addTag(inputValue);
      return;
    }

    if (!showSuggestions) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveSuggestionIndex((prev) =>
          prev < suggestionItems.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveSuggestionIndex((prev) =>
          prev > 0 ? prev - 1 : suggestionItems.length - 1
        );
        break;
      case 'Escape':
        setSuggestions([]);
        setActiveSuggestionIndex(-1);
        break;
    }
  };

  const handleBlur = () => {
    setHasFocus(false);

    if (!isMouseDownOnSuggestion) {
      setTimeout(() => {
        setActiveSuggestionIndex(-1);
      }, 100);
    }
  };

  useEffect(() => {
    if (activeSuggestionIndex >= suggestionItems.length) {
      setActiveSuggestionIndex(-1);
    }
  }, [activeSuggestionIndex, suggestionItems.length]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div className={`relative mb-4 ${className}`}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-300" htmlFor={id}>
          {label}
        </label>
      )}

      <div
        className={`flex min-h-[42px] w-full flex-wrap items-center gap-2 rounded border bg-background px-2 py-1.5 text-sm text-white focus-within:border-[#2563eb] focus-within:outline-none focus-within:ring ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-text'
        } ${disabled ? 'border-gray-700' : 'border-gray-700 hover:border-gray-600'}`}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
          }
        }}
      >
        {value.map((tag) => {
          const isPending = pendingKeys.has(normalizeTagKey(tag));

          return (
            <span
              key={normalizeTagKey(tag)}
              className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                isPending
                  ? 'border-green-500/50 bg-green-500/10 text-green-200'
                  : 'border-gray-600 bg-[#1e2126] text-gray-200'
              }`}
            >
              <span className="truncate">{tag}</span>
              <button
                type="button"
                className="rounded-full text-current transition-colors hover:text-white disabled:cursor-not-allowed"
                onClick={(event) => {
                  event.stopPropagation();
                  removeTag(tag);
                }}
                disabled={disabled}
                aria-label={`Remover tag ${tag}`}
              >
                <X size={14} />
              </button>
            </span>
          );
        })}

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setHasFocus(true);
            queueSuggestionFetch(inputValue);
          }}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? placeholder : ''}
          disabled={disabled || !canAddMoreTags}
          className="min-w-[8ch] flex-1 border-0 bg-transparent p-0 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
          autoComplete="off"
          maxLength={TAG_MAX_LENGTH}
        />

        {isLoading ? (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-500 border-t-[#2563eb]" />
        ) : (
          <Search size={16} className="text-gray-500" />
        )}
      </div>

      {showSuggestions && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded border border-gray-700 bg-surface shadow-lg">
          {suggestionItems.map((item, index) => {
            const isCreate = item.type === 'create';
            const label = isCreate ? item.name : item.suggestion.name;
            const usageCount = isCreate ? null : item.suggestion.usageCount ?? 0;

            return (
              <button
                key={isCreate ? `create-${label}` : `existing-${item.suggestion.id}`}
                type="button"
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-elevated ${
                  index === activeSuggestionIndex ? 'bg-elevated' : ''
                } ${index === suggestionItems.length - 1 ? '' : 'border-b border-gray-700'} ${
                  isCreate ? 'text-green-200' : 'text-white'
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  setIsMouseDownOnSuggestion(true);
                  selectSuggestion(item);
                }}
                onMouseUp={() => setIsMouseDownOnSuggestion(false)}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {isCreate && <Plus size={14} className="shrink-0" />}
                  <span className="truncate">
                    {isCreate ? `Adicionar "${label}"` : label}
                  </span>
                </span>
                {!isCreate && (
                  <span className="shrink-0 text-xs text-gray-400">
                    {usageCount}x
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!canAddMoreTags && (
        <p className="mt-1 text-xs text-gray-400">Maximo de {maxTags} tags atingido.</p>
      )}
    </div>
  );
}
