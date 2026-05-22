import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import {
  FinancialBankReference,
  getBankDisplayName,
  getBankIconUrl,
  getBankInitials
} from '@/utils/banks';

interface BankLogoProps {
  bank?: FinancialBankReference | null;
  bankName?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  surface?: 'transparent' | 'solid' | 'glass';
  outlined?: boolean;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base'
} as const;

const iconSizes = {
  sm: 14,
  md: 16,
  lg: 18
} as const;

const surfaceClasses = {
  transparent: 'border-transparent bg-transparent text-white/90 shadow-none',
  solid: 'border border-white/15 bg-white/90 text-slate-700 shadow-sm',
  glass: 'border border-white/18 bg-white/20 text-slate-700 shadow-sm backdrop-blur-[2px]'
} as const;

export default function BankLogo({
  bank,
  bankName,
  size = 'md',
  className = '',
  surface = 'transparent',
  outlined = false
}: BankLogoProps) {
  const iconUrl = getBankIconUrl(bank);
  const displayName = getBankDisplayName(bank, bankName);
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [iconUrl]);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-bold uppercase tracking-[0.12em] ${sizeClasses[size]} ${surfaceClasses[surface]} ${className}`}
      title={displayName || 'Banco'}
      aria-hidden="true"
    >
      {iconUrl && !hasImageError ? (
        <img
          src={iconUrl}
          alt=""
          className={`h-full w-full object-contain p-0.5 ${
            outlined
              ? 'drop-shadow-[0_0_1px_rgba(255,255,255,0.95)] drop-shadow-[0_1px_2px_rgba(15,23,42,0.35)]'
              : ''
          }`}
          onError={() => setHasImageError(true)}
        />
      ) : displayName ? (
        <span>{getBankInitials(displayName)}</span>
      ) : (
        <Building2 size={iconSizes[size]} />
      )}
    </div>
  );
}
