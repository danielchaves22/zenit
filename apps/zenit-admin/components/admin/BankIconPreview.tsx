import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { getBankIconUrl, getBankInitials } from '@/utils/banks';

interface BankIconPreviewProps {
  iconPath?: string | null;
  label?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-10 w-10 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-14 w-14 text-base'
} as const;

const iconSizes = {
  sm: 16,
  md: 18,
  lg: 20
} as const;

export default function BankIconPreview({
  iconPath,
  label,
  size = 'md',
  className = ''
}: BankIconPreviewProps) {
  const iconUrl = getBankIconUrl(iconPath);
  const [hasImageError, setHasImageError] = useState(false);

  useEffect(() => {
    setHasImageError(false);
  }, [iconUrl]);

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-xl border border-gray-700 bg-white/95 font-semibold text-slate-700 shadow-sm ${sizeClasses[size]} ${className}`}
      title={label || 'Banco'}
      aria-hidden="true"
    >
      {iconUrl && !hasImageError ? (
        <img
          src={iconUrl}
          alt=""
          className="h-full w-full object-contain p-1.5"
          onError={() => setHasImageError(true)}
        />
      ) : label ? (
        <span>{getBankInitials(label)}</span>
      ) : (
        <Building2 size={iconSizes[size]} />
      )}
    </div>
  );
}
