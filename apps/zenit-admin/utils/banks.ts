import { buildPublicAssetUrl } from '@/utils/assets';

export interface AdminBank {
  id: number;
  code: string;
  name: string;
  iconSlug: string;
  iconPath?: string | null;
  displayOrder: number;
  isActive: boolean;
  linkedAccountsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface BankIconOption {
  label: string;
  value: string;
  iconSlug: string;
  iconPath?: string | null;
}

export function getBankIconUrl(iconPath?: string | null) {
  return buildPublicAssetUrl(iconPath);
}

export function getBankInitials(name?: string | null) {
  if (!name?.trim()) {
    return 'BK';
  }

  const tokens = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return tokens
    .slice(0, 2)
    .map((token) => token[0])
    .join('')
    .toUpperCase();
}
