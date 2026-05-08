import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import {
  CategoryIcon,
  CATEGORY_ICON_OPTIONS,
  DEFAULT_CATEGORY_ICON,
  type CategoryIconOption
} from '@/utils/categoryIcons';

interface CategoryIconPickerProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  color?: string;
}

function IconOptionRow({
  option,
  color,
  showCheck = false
}: {
  option: CategoryIconOption;
  color?: string;
  showCheck?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-700 bg-[#11161d]">
        <CategoryIcon icon={option.value} size={15} color={color} />
      </div>
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {showCheck && <Check size={16} className="shrink-0 text-accent" />}
    </div>
  );
}

export default function CategoryIconPicker({
  value,
  onChange,
  disabled = false,
  color
}: CategoryIconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () =>
      CATEGORY_ICON_OPTIONS.find((option) => option.value === value) ||
      CATEGORY_ICON_OPTIONS.find((option) => option.value === DEFAULT_CATEGORY_ICON) ||
      CATEGORY_ICON_OPTIONS[0],
    [value]
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

  return (
    <div ref={containerRef}>
      <label className="mb-1 block text-sm font-medium text-gray-300">Icone</label>

      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((previous) => !previous)}
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded border border-gray-700 bg-background px-2 py-1.5 text-left text-sm text-white transition-colors focus:border-accent focus:outline-none focus:ring ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-gray-600'
        }`}
      >
        <IconOptionRow option={selectedOption} color={color} />
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
            {CATEGORY_ICON_OPTIONS.map((option) => {
              const isSelected = option.value === selectedOption.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                    isSelected ? 'bg-accent/10 text-accent' : 'text-white hover:bg-[#262b36]'
                  }`}
                >
                  <IconOptionRow option={option} color={color} showCheck={isSelected} />
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
