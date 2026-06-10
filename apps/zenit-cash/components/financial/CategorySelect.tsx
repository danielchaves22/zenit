import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Check, ChevronDown, CornerDownRight, Star } from 'lucide-react';
import { CategoryIcon } from '@/utils/categoryIcons';

export interface CategoryOption {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
  isDefault?: boolean;
  parentId?: number | null;
}

export interface OrderedCategoryOption {
  category: CategoryOption;
  level: number;
  lineage: string[];
}

function compareCategoryNames(left: CategoryOption, right: CategoryOption) {
  return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
}

export function orderCategoriesForSelect(categories: CategoryOption[]): OrderedCategoryOption[] {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const roots: CategoryOption[] = [];
  const childrenByParentId = new Map<number, CategoryOption[]>();

  categories.forEach((category) => {
    const parentId = category.parentId ?? null;

    if (parentId !== null && categoriesById.has(parentId)) {
      const siblings = childrenByParentId.get(parentId) || [];
      siblings.push(category);
      childrenByParentId.set(parentId, siblings);
      return;
    }

    roots.push(category);
  });

  roots.sort(compareCategoryNames);
  childrenByParentId.forEach((siblings) => siblings.sort(compareCategoryNames));

  const orderedCategories: OrderedCategoryOption[] = [];
  const visited = new Set<number>();
  const visiting = new Set<number>();

  function visitCategory(category: CategoryOption, lineage: string[]) {
    if (visited.has(category.id) || visiting.has(category.id)) {
      return;
    }

    visiting.add(category.id);
    orderedCategories.push({
      category,
      level: lineage.length,
      lineage
    });

    const children = childrenByParentId.get(category.id) || [];
    children.forEach((child) => {
      visitCategory(child, [...lineage, category.name]);
    });

    visiting.delete(category.id);
    visited.add(category.id);
  }

  roots.forEach((rootCategory) => {
    visitCategory(rootCategory, []);
  });

  categories
    .slice()
    .sort(compareCategoryNames)
    .forEach((category) => {
      if (!visited.has(category.id)) {
        visitCategory(category, []);
      }
    });

  return orderedCategories;
}

function getCategoryTriggerLabel(categoryOption: OrderedCategoryOption) {
  if (categoryOption.lineage.length === 0) {
    return categoryOption.category.name;
  }

  return `${categoryOption.lineage.join(' / ')} / ${categoryOption.category.name}`;
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

interface CategorySelectProps {
  label?: string;
  categories: CategoryOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

function CategoryRow({
  category,
  showCheck = false,
  compact = false
}: {
  category: OrderedCategoryOption;
  showCheck?: boolean;
  compact?: boolean;
}) {
  const parentTrail = category.lineage.join(' / ');
  const isNestedCategory = category.level > 0;
  const triggerLabel = getCategoryTriggerLabel(category);
  const indentStyle = compact
    ? undefined
    : {
        paddingLeft: `${Math.min(category.level, 3) * 14}px`
      };

  return (
    <div
      className={`flex min-w-0 items-center ${compact ? 'gap-2.5' : 'gap-3'}`}
      style={indentStyle}
    >
      {!compact && isNestedCategory && (
        <CornerDownRight size={14} className="shrink-0 text-gray-500" />
      )}
      <div
        className={`flex shrink-0 items-center justify-center rounded border border-gray-700 bg-[#11161d] ${
          compact ? 'h-6 w-6' : 'h-8 w-8'
        }`}
      >
        <CategoryIcon
          icon={category.category.icon}
          size={compact ? 14 : 16}
          color={category.category.color}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate">{compact ? triggerLabel : category.category.name}</span>
          {category.category.isDefault && (
            <span
              className={`inline-flex items-center rounded-full bg-yellow-700/20 uppercase tracking-wide text-yellow-300 ${
                compact ? 'gap-1 px-1.5 py-0 text-[9px]' : 'gap-1 px-2 py-0.5 text-[10px]'
              }`}
            >
              <Star size={compact ? 9 : 10} className="fill-current" />
              Padrao
            </span>
          )}
        </div>
        {!compact && parentTrail && (
          <div className="mt-0.5 truncate text-xs text-gray-500">{parentTrail}</div>
        )}
      </div>
      {showCheck && <Check size={16} className="shrink-0 text-accent" />}
    </div>
  );
}

export default function CategorySelect({
  label,
  categories,
  value,
  onChange,
  placeholder = 'Selecione...',
  emptyLabel,
  disabled = false,
  className = '',
  triggerClassName = ''
}: CategorySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const orderedCategories = useMemo(() => orderCategoriesForSelect(categories), [categories]);
  const filteredCategories = useMemo(() => {
    const normalizedSearch = normalizeSearchText(searchTerm);

    if (!normalizedSearch) {
      return orderedCategories;
    }

    return orderedCategories.filter((category) => {
      const searchableText = normalizeSearchText(
        `${category.category.name} ${category.lineage.join(' ')} ${getCategoryTriggerLabel(category)}`
      );

      return searchableText.includes(normalizedSearch);
    });
  }, [orderedCategories, searchTerm]);
  const selectedCategory = useMemo(
    () => orderedCategories.find((category) => String(category.category.id) === value) || null,
    [orderedCategories, value]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger = !!containerRef.current?.contains(target);
      const clickedPortal = !!portalRef.current?.contains(target);

      if (!clickedTrigger && !clickedPortal) {
        setIsOpen(false);
      }
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

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      const currentValueLength = searchInputRef.current?.value.length ?? 0;
      searchInputRef.current?.setSelectionRange(currentValueLength, currentValueLength);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsOpen(true);
      return;
    }

    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      setSearchTerm(event.key);
      setIsOpen(true);
    }
  }

  return (
    <div className={className} ref={containerRef}>
      {label && <label className="mb-1 block text-sm font-medium text-gray-300">{label}</label>}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((previous) => !previous)}
        onKeyDown={handleTriggerKeyDown}
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded border border-gray-700 bg-background px-2 py-1.5 text-left text-sm text-white transition-colors focus:border-accent focus:outline-none focus:ring ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-gray-600'
        } ${triggerClassName}`}
      >
        {selectedCategory ? (
          <CategoryRow category={selectedCategory} compact />
        ) : (
          <span className="truncate text-gray-400">{placeholder}</span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen &&
        mounted &&
        ReactDOM.createPortal(
          <div
            ref={portalRef}
            className="z-[9999] max-h-72 overflow-auto rounded border border-gray-700 bg-[#1e2126] shadow-lg"
            style={{
              position: 'fixed',
              top: position.top,
              left: position.left,
              width: position.width
            }}
          >
            <div className="sticky top-0 z-10 border-b border-gray-700 bg-[#1e2126] p-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Filtrar categorias..."
                aria-label="Filtrar categorias"
                className="h-9 w-full rounded border border-gray-700 bg-background px-3 text-sm text-white outline-none transition-colors placeholder:text-gray-500 focus:border-accent focus:ring"
              />
            </div>

            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                value === '' ? 'bg-accent/10 text-accent' : 'text-gray-300 hover:bg-[#262b36]'
              }`}
            >
              <span>{emptyLabel || placeholder}</span>
            </button>

            {filteredCategories.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400">
                {orderedCategories.length === 0
                  ? 'Nenhuma categoria disponivel'
                  : 'Nenhuma categoria encontrada'}
              </div>
            ) : (
              filteredCategories.map((category) => {
                const isSelected = String(category.category.id) === value;

                return (
                  <button
                    key={category.category.id}
                    type="button"
                    onClick={() => handleSelect(String(category.category.id))}
                    className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-accent/10 text-accent'
                        : 'text-white hover:bg-[#262b36]'
                    }`}
                  >
                    <CategoryRow category={category} showCheck={isSelected} />
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
