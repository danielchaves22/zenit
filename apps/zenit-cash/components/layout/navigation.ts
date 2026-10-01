import { Activity, ChartNoAxesCombined, CreditCard, House, Landmark, PiggyBank, Receipt, Repeat, Settings2, Tags, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavigationLink { label: string; href: string; }
export interface NavigationItem extends NavigationLink {
  id: string;
  icon: LucideIcon;
  matches?: string[];
  children?: NavigationLink[];
  permission?: 'FINANCIAL_ACCOUNTS' | 'FINANCIAL_CATEGORIES';
  adminOnly?: boolean;
}

export const mainNavigation: NavigationItem[] = [
  { id: 'home', label: 'Início', href: '/', icon: House },
  {
    id: 'transactions', label: 'Transações', href: '/financial/transactions', icon: Receipt,
    matches: ['/financial/installment-purchases'],
    children: [
      { label: 'Todas as transações', href: '/financial/transactions' },
      { label: 'Compras parceladas', href: '/financial/installment-purchases' },
      { label: 'Nova despesa', href: '/financial/transactions/new?type=EXPENSE&locked=true' },
      { label: 'Nova receita', href: '/financial/transactions/new?type=INCOME&locked=true' },
      { label: 'Nova transferência', href: '/financial/transactions/new?type=TRANSFER&locked=true' },
      { label: 'Compra no cartão', href: '/financial/transactions/new-credit-card-purchase' },
    ],
  },
  { id: 'fixed', label: 'Fixas', href: '/financial/fixed-transactions', icon: Repeat },
  { id: 'accounts', label: 'Contas', href: '/financial/accounts', icon: Landmark, permission: 'FINANCIAL_ACCOUNTS' },
  {
    id: 'cards', label: 'Cartões', href: '/financial/credit-cards', icon: CreditCard, permission: 'FINANCIAL_ACCOUNTS',
    children: [
      { label: 'Cartões e faturas', href: '/financial/credit-cards' },
      { label: 'Compras parceladas no cartão', href: '/financial/credit-cards/purchases' },
      { label: 'Novo cartão', href: '/financial/credit-cards/new' },
    ],
  },
  {
    id: 'planning', label: 'Planejamento', href: '/financial/budgets?view=overview', icon: PiggyBank,
    children: [
      { label: 'Visão geral do orçamento', href: '/financial/budgets?view=overview' },
      { label: 'Plano de disponibilidade', href: '/financial/budgets?view=availability' },
      { label: 'Planejamento mensal', href: '/financial/budgets?view=monthly' },
      { label: 'Provisões', href: '/financial/budgets?view=provisions' },
    ],
  },
  {
    id: 'analysis', label: 'Análises', href: '/financial/dashboard', icon: ChartNoAxesCombined,
    matches: ['/financial/reports'],
    children: [
      { label: 'Análise financeira', href: '/financial/dashboard' },
      { label: 'Movimentação de contas', href: '/financial/reports/financial-account-movement' },
      { label: 'Fluxo de caixa', href: '/financial/reports/cashflow' },
    ],
  },
];

export const settingsNavigation: NavigationItem[] = [
  { id: 'categories', label: 'Categorias', href: '/financial/categories', icon: Tags, permission: 'FINANCIAL_CATEGORIES' },
  { id: 'users', label: 'Usuários', href: '/admin/users', icon: Users, adminOnly: true },
  { id: 'settings', label: 'Configurações', href: '/admin/settings', icon: Settings2, adminOnly: true },
  { id: 'operations', label: 'Operações', href: '/admin/operations', icon: Activity, adminOnly: true },
];

export function isNavigationItemActive(item: NavigationItem, pathname: string): boolean {
  return [item.href.split('?')[0], ...(item.matches || [])].some(path =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
  );
}

export function isNavigationLinkActive(href: string, asPath: string): boolean {
  const [pathname, query = ''] = asPath.split('#')[0].split('?');
  const [targetPath, targetQuery = ''] = href.split('?');
  if (pathname !== targetPath) return false;
  const expected = new URLSearchParams(targetQuery);
  const actual = new URLSearchParams(query);
  if (targetPath === '/financial/budgets' && !actual.has('view')) actual.set('view', 'overview');
  return Array.from(expected.entries()).every(([key, value]) => actual.get(key) === value);
}
