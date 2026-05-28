import {
  BadgeDollarSign,
  Banknote,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  BusFront,
  Calculator,
  Car,
  Coffee,
  CreditCard,
  Droplets,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Handshake,
  HeartPulse,
  Home,
  Landmark,
  Lightbulb,
  Megaphone,
  Music,
  Package,
  PartyPopper,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  Scale,
  Scissors,
  Shirt,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Stethoscope,
  Store,
  Tag,
  Ticket,
  Trophy,
  TrendingUp,
  Tv,
  UtensilsCrossed,
  Wallet,
  Wrench,
  type LucideIcon
} from 'lucide-react';

export const DEFAULT_CATEGORY_ICON = 'tag';

const CATEGORY_ICON_DEFINITIONS = [
  { value: 'dumbbell', label: 'Academia', icon: Dumbbell },
  { value: 'droplets', label: 'Agua', icon: Droplets },
  { value: 'utensilsCrossed', label: 'Alimentacao', icon: UtensilsCrossed },
  { value: 'bookOpen', label: 'Livros', icon: BookOpen },
  { value: 'busFront', label: 'Onibus', icon: BusFront },
  { value: 'calculator', label: 'Calculadora', icon: Calculator },
  { value: 'coffee', label: 'Cafe', icon: Coffee },
  { value: 'scale', label: 'Conciliacao', icon: Scale },
  { value: 'creditCard', label: 'Cartao', icon: CreditCard },
  { value: 'wallet', label: 'Carteira', icon: Wallet },
  { value: 'stethoscope', label: 'Consultas', icon: Stethoscope },
  { value: 'fuel', label: 'Combustivel', icon: Fuel },
  { value: 'handCoins', label: 'Comissoes', icon: HandCoins },
  { value: 'shoppingCart', label: 'Compras', icon: ShoppingCart },
  { value: 'receipt', label: 'Contas', icon: Receipt },
  { value: 'graduationCap', label: 'Educacao', icon: GraduationCap },
  { value: 'lightbulb', label: 'Eletricidade', icon: Lightbulb },
  { value: 'building2', label: 'Empresa', icon: Building2 },
  { value: 'trophy', label: 'Esportes', icon: Trophy },
  { value: 'banknote', label: 'Faturamento', icon: Banknote },
  { value: 'partyPopper', label: 'Festa', icon: PartyPopper },
  { value: 'tag', label: 'Geral', icon: Tag },
  { value: 'ticket', label: 'Ingressos', icon: Ticket },
  { value: 'landmark', label: 'Impostos', icon: Landmark },
  { value: 'trendingUp', label: 'Investimentos', icon: TrendingUp },
  { value: 'store', label: 'Loja', icon: Store },
  { value: 'gamepad2', label: 'Lazer', icon: Gamepad2 },
  { value: 'wrench', label: 'Manutencao', icon: Wrench },
  { value: 'megaphone', label: 'Marketing', icon: Megaphone },
  { value: 'home', label: 'Moradia', icon: Home },
  { value: 'music', label: 'Musica', icon: Music },
  { value: 'handshake', label: 'Parcerias', icon: Handshake },
  { value: 'pawPrint', label: 'Pets', icon: PawPrint },
  { value: 'gift', label: 'Presentes', icon: Gift },
  { value: 'package', label: 'Produtos', icon: Package },
  { value: 'shieldCheck', label: 'Seguros', icon: ShieldCheck },
  { value: 'badgeDollarSign', label: 'Recebimentos', icon: BadgeDollarSign },
  { value: 'piggyBank', label: 'Reserva', icon: PiggyBank },
  { value: 'heartPulse', label: 'Saude', icon: HeartPulse },
  { value: 'scissors', label: 'Salao', icon: Scissors },
  { value: 'tv', label: 'Streaming', icon: Tv },
  { value: 'smartphone', label: 'Tecnologia', icon: Smartphone },
  { value: 'briefcaseBusiness', label: 'Trabalho', icon: BriefcaseBusiness },
  { value: 'car', label: 'Transporte', icon: Car },
  { value: 'plane', label: 'Viagens', icon: Plane },
  { value: 'shirt', label: 'Vestuario', icon: Shirt }
] as const;

export type CategoryIconName = (typeof CATEGORY_ICON_DEFINITIONS)[number]['value'];

export type CategoryIconOption = (typeof CATEGORY_ICON_DEFINITIONS)[number];

export const CATEGORY_ICON_OPTIONS = [...CATEGORY_ICON_DEFINITIONS].sort((left, right) =>
  left.label.localeCompare(right.label, 'pt-BR')
);

const CATEGORY_ICON_MAP = CATEGORY_ICON_OPTIONS.reduce<Record<string, LucideIcon>>(
  (map, option) => {
    map[option.value] = option.icon;
    return map;
  },
  {}
);

export function getCategoryIconComponent(icon?: string | null): LucideIcon {
  if (!icon) {
    return Tag;
  }

  return CATEGORY_ICON_MAP[icon] || Tag;
}

export function getCategoryIconLabel(icon?: string | null): string {
  if (!icon) {
    return 'Geral';
  }

  return CATEGORY_ICON_OPTIONS.find((option) => option.value === icon)?.label || 'Geral';
}

interface CategoryIconProps {
  icon?: string | null;
  size?: number;
  className?: string;
  color?: string;
}

export function CategoryIcon({
  icon,
  size = 16,
  className = '',
  color
}: CategoryIconProps) {
  const Icon = getCategoryIconComponent(icon);

  return <Icon size={size} className={className} style={color ? { color } : undefined} />;
}
