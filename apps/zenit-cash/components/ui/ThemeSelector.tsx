import React, { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

interface ThemeSelectorProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showCategories?: boolean;
  showAccessibility?: boolean;
}

export function ThemeSelector({ showLabel = true, size = 'md', showCategories = true }: ThemeSelectorProps) {
  const { currentTheme, changeTheme, availableThemes } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = availableThemes.find(theme => theme.key === currentTheme) || availableThemes[0];
  const categoryLabels = { standard: 'Essenciais', vibrant: 'Vibrantes', professional: 'Sóbrio', seasonal: 'Sazonais' };

  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    containerRef.current?.addEventListener('keydown', escape);
    const container = containerRef.current;
    return () => {
      document.removeEventListener('pointerdown', outside);
      container?.removeEventListener('keydown', escape);
    };
  }, [isOpen]);

  return <div className="relative" ref={containerRef}>
    <button ref={triggerRef} type="button" aria-label="Alterar cor de destaque" aria-expanded={isOpen}
      onClick={() => setIsOpen(!isOpen)} className={`flex items-center gap-2 rounded-lg border border-border bg-surface text-text-muted hover:bg-elevated ${size === 'sm' ? 'p-2' : 'p-2.5'}`}>
      <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: current.colors.primary }} aria-hidden="true" />
      <Palette size={16} aria-hidden="true" />{showLabel && <span className="text-sm">Aparência</span>}
    </button>
    {isOpen && <div ref={listRef} className="absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-32px)] max-h-[min(22rem,55vh)] overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-xl" aria-label="Cores de destaque">
      <p className="px-3 py-2 text-xs font-medium text-text-muted">Cor de destaque</p>
      {availableThemes.map((theme, index) => <React.Fragment key={theme.key}>
        {showCategories && (index === 0 || availableThemes[index - 1].category !== theme.category) &&
          <p className="px-3 pb-1 pt-3 text-xs text-text-subtle">{categoryLabels[theme.category]}</p>}
        <button type="button" aria-pressed={theme.key === currentTheme}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-text hover:bg-elevated"
          onClick={() => { changeTheme(theme.key); setIsOpen(false); triggerRef.current?.focus(); }}>
          <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: theme.colors.primary }} aria-hidden="true" />
          <span className="flex-1">{theme.label}</span>{theme.key === currentTheme && <Check size={16} className="text-accent" aria-hidden="true" />}
        </button>
      </React.Fragment>)}
    </div>}
  </div>;
}