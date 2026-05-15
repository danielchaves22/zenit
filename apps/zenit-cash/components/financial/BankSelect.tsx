import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import BankLogo from '@/components/financial/BankLogo';
import { FinancialBank, getBankBySelectValue, normalizeBankText } from '@/utils/banks';

interface BankSelectProps {
  banks: FinancialBank[];
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

function BankOptionRow({
  bank,
  label,
  showCheck = false,
  compact = false
}: {
  bank?: FinancialBank | null;
  label: string;
  showCheck?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`flex min-w-0 items-center ${compact ? 'gap-2.5' : 'gap-3'}`}>
      <BankLogo bank={bank} bankName={label} size={compact ? 'sm' : 'md'} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {showCheck && <Check size={16} className="shrink-0 text-accent" />}
    </div>
  );
}

export default function BankSelect({
  banks,
  label,
  value,
  onChange,
  placeholder = 'Selecione um banco',
  emptyLabel = 'Sem banco definido',
  disabled = false,
  className = '',
  triggerClassName = ''
}: BankSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const selectedBank = useMemo(() => getBankBySelectValue(banks, value), [banks, value]);
  const filteredBanks = useMemo(() => {
    const normalizedSearch = normalizeBankText(searchTerm);

    if (!normalizedSearch) {
      return banks;
    }

    return banks.filter((bank) => normalizeBankText(bank.name).includes(normalizedSearch));
  }, [banks, searchTerm]);

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

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm('');
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isOpen]);

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
    setSearchTerm('');
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
        {selectedBank ? (
          <BankOptionRow bank={selectedBank} label={selectedBank.name} compact />
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
            <div className="border-b border-gray-700 px-3 py-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Buscar banco..."
                className="w-full rounded border border-gray-600 bg-[#11161d] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-accent focus:outline-none focus:ring"
              />
            </div>

            <button
              type="button"
              onClick={() => handleSelect('')}
              className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                value === '' ? 'bg-accent/10 text-accent' : 'text-gray-300 hover:bg-[#262b36]'
              }`}
            >
              <span>{emptyLabel}</span>
            </button>

            {filteredBanks.map((bank) => {
              const bankValue = String(bank.id);
              const isSelected = bankValue === value;

              return (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => handleSelect(bankValue)}
                  className={`flex w-full items-center px-3 py-2 text-left text-sm transition-colors ${
                    isSelected ? 'bg-accent/10 text-accent' : 'text-white hover:bg-[#262b36]'
                  }`}
                >
                  <BankOptionRow bank={bank} label={bank.name} showCheck={isSelected} />
                </button>
              );
            })}

            {filteredBanks.length === 0 && (
              <div className="px-3 py-3 text-sm text-gray-400">
                Nenhum banco encontrado para "{searchTerm}".
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
