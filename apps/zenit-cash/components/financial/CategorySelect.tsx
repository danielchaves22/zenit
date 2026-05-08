import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Check, ChevronDown, Star } from 'lucide-react';
import { CategoryIcon } from '@/utils/categoryIcons';

interface CategoryOption {
  id: number;
  name: string;
  color: string;
  icon?: string | null;
  isDefault?: boolean;
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
  category: CategoryOption;
  showCheck?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center ${compact ? 'gap-2.5' : 'gap-3'}`}>
      <div
        className={`flex shrink-0 items-center justify-center rounded border border-gray-700 bg-[#11161d] ${
          compact ? 'h-6 w-6' : 'h-8 w-8'
        }`}
      >
        <CategoryIcon icon={category.icon} size={compact ? 14 : 16} color={category.color} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate">{category.name}</span>
          {category.isDefault && (
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
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const selectedCategory = useMemo(
    () => categories.find((category) => String(category.id) === value) || null,
    [categories, value]
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

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    setIsOpen(false);
  }

  return (
    <div className={className} ref={containerRef}>
      {label && <label className="mb-1 block text-sm font-medium text-gray-300">{label}</label>}

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((previous) => !previous)}
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
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                value === '' ? 'bg-accent/10 text-accent' : 'text-gray-300 hover:bg-[#262b36]'
              }`}
            >
              <span>{emptyLabel || placeholder}</span>
            </button>

            {categories.length === 0 ? (
              <div className="px-3 py-3 text-sm text-gray-400">Nenhuma categoria disponivel</div>
            ) : (
              categories.map((category) => {
                const isSelected = String(category.id) === value;

                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleSelect(String(category.id))}
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
