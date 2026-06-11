export type UserRole = 'ADMIN' | 'SUPERUSER' | 'USER';

export type AppPermission = 'FINANCIAL_ACCOUNTS' | 'FINANCIAL_CATEGORIES';

export type NavModuleKey =
  | 'home'
  | 'movement'
  | 'accounts'
  | 'planning'
  | 'analytics'
  | 'catalog'
  | 'admin';

export type SurfaceTemplate =
  | 'overview'
  | 'workspace'
  | 'form'
  | 'reporting'
  | 'settings';

export type IconToken =
  | 'home'
  | 'movement'
  | 'wallet'
  | 'target'
  | 'chart'
  | 'folder'
  | 'shield'
  | 'plus'
  | 'credit-card'
  | 'repeat'
  | 'receipt'
  | 'building';

export interface AccessPolicy {
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  requiredPermission?: AppPermission;
}

export interface AppShellDestination extends AccessPolicy {
  key: NavModuleKey;
  label: string;
  href: string;
  icon: IconToken;
  mobile: boolean;
  matchers: string[];
}

export interface GlobalCreateAction extends AccessPolicy {
  key: string;
  label: string;
  href: string;
  icon: IconToken;
  module: NavModuleKey;
}

export interface LocalTab {
  label: string;
  href: string;
}

export interface RouteSurface extends AccessPolicy {
  pattern: string;
  module: NavModuleKey;
  template: SurfaceTemplate;
  title: string;
  description?: string;
  localTabs?: LocalTab[];
  supportsDetailPanel?: boolean;
}

export const primaryDestinations: AppShellDestination[] = [
  {
    key: 'home',
    label: 'Inicio',
    href: '/',
    icon: 'home',
    mobile: true,
    matchers: ['/'],
  },
  {
    key: 'movement',
    label: 'Movimentacao',
    href: '/financial/transactions',
    icon: 'movement',
    mobile: true,
    matchers: ['/financial/transactions/*'],
  },
  {
    key: 'accounts',
    label: 'Contas',
    href: '/financial/accounts',
    icon: 'wallet',
    mobile: true,
    matchers: ['/financial/accounts/*', '/financial/credit-cards/*'],
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    key: 'planning',
    label: 'Planejamento',
    href: '/financial/budgets',
    icon: 'target',
    mobile: false,
    matchers: ['/financial/budgets/*', '/financial/fixed-transactions/*'],
  },
  {
    key: 'analytics',
    label: 'Analises',
    href: '/financial/dashboard',
    icon: 'chart',
    mobile: false,
    matchers: ['/financial/dashboard', '/financial/reports/*'],
  },
  {
    key: 'catalog',
    label: 'Cadastros',
    href: '/financial/categories',
    icon: 'folder',
    mobile: false,
    matchers: ['/financial/categories/*'],
    requiredPermission: 'FINANCIAL_CATEGORIES',
  },
  {
    key: 'admin',
    label: 'Administracao',
    href: '/admin/users',
    icon: 'shield',
    mobile: false,
    matchers: ['/admin/*'],
    requiredRole: 'SUPERUSER',
  },
];

export const globalCreateActions: GlobalCreateAction[] = [
  {
    key: 'new-expense',
    label: 'Nova despesa',
    href: '/financial/transactions/new?type=EXPENSE&locked=true',
    icon: 'plus',
    module: 'movement',
  },
  {
    key: 'new-income',
    label: 'Nova receita',
    href: '/financial/transactions/new?type=INCOME&locked=true',
    icon: 'plus',
    module: 'movement',
  },
  {
    key: 'new-transfer',
    label: 'Nova transferencia',
    href: '/financial/transactions/new?type=TRANSFER&locked=true',
    icon: 'plus',
    module: 'movement',
  },
  {
    key: 'new-card-purchase',
    label: 'Nova compra no cartao',
    href: '/financial/transactions/new-credit-card-purchase',
    icon: 'credit-card',
    module: 'movement',
  },
  {
    key: 'new-account',
    label: 'Nova conta',
    href: '/financial/accounts/new',
    icon: 'wallet',
    module: 'accounts',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    key: 'new-card',
    label: 'Novo cartao',
    href: '/financial/credit-cards/new',
    icon: 'credit-card',
    module: 'accounts',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    key: 'new-category',
    label: 'Nova categoria',
    href: '/financial/categories/new',
    icon: 'folder',
    module: 'catalog',
    requiredPermission: 'FINANCIAL_CATEGORIES',
  },
];

export const routeSurfaces: RouteSurface[] = [
  {
    pattern: '/',
    module: 'home',
    template: 'overview',
    title: 'Inicio',
    description: 'Visao geral da empresa, pendencias e atalhos.',
  },
  {
    pattern: '/financial/transactions',
    module: 'movement',
    template: 'workspace',
    title: 'Movimentacao',
    supportsDetailPanel: true,
    localTabs: [
      { label: 'Transacoes', href: '/financial/transactions' },
      { label: 'Transferencias', href: '/financial/transactions?tab=transfers' },
      { label: 'Parceladas', href: '/financial/credit-cards/purchases' },
      { label: 'Pendentes', href: '/financial/transactions?tab=pending' },
    ],
  },
  {
    pattern: '/financial/transactions/new',
    module: 'movement',
    template: 'form',
    title: 'Nova transacao',
  },
  {
    pattern: '/financial/transactions/new-credit-card-purchase',
    module: 'movement',
    template: 'form',
    title: 'Nova compra no cartao',
  },
  {
    pattern: '/financial/transactions/[id]',
    module: 'movement',
    template: 'form',
    title: 'Detalhe da transacao',
  },
  {
    pattern: '/financial/accounts',
    module: 'accounts',
    template: 'workspace',
    title: 'Contas',
    localTabs: [
      { label: 'Contas', href: '/financial/accounts' },
      { label: 'Cartoes', href: '/financial/credit-cards' },
      { label: 'Parceladas', href: '/financial/credit-cards/purchases' },
    ],
  },
  {
    pattern: '/financial/accounts/new',
    module: 'accounts',
    template: 'form',
    title: 'Nova conta',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    pattern: '/financial/accounts/[id]',
    module: 'accounts',
    template: 'form',
    title: 'Detalhe da conta',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    pattern: '/financial/credit-cards',
    module: 'accounts',
    template: 'workspace',
    title: 'Cartoes',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
    localTabs: [
      { label: 'Cartoes', href: '/financial/credit-cards' },
      { label: 'Faturas', href: '/financial/credit-cards?tab=invoices' },
      { label: 'Parceladas', href: '/financial/credit-cards/purchases' },
    ],
  },
  {
    pattern: '/financial/credit-cards/new',
    module: 'accounts',
    template: 'form',
    title: 'Novo cartao',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    pattern: '/financial/credit-cards/purchases',
    module: 'accounts',
    template: 'workspace',
    title: 'Compras parceladas',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    pattern: '/financial/credit-cards/[accountId]',
    module: 'accounts',
    template: 'form',
    title: 'Detalhe do cartao',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    pattern: '/financial/credit-cards/[accountId]/invoices',
    module: 'accounts',
    template: 'workspace',
    title: 'Faturas do cartao',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    pattern: '/financial/credit-cards/[accountId]/reconciliation',
    module: 'accounts',
    template: 'workspace',
    title: 'Conciliacao do cartao',
    requiredPermission: 'FINANCIAL_ACCOUNTS',
  },
  {
    pattern: '/financial/budgets',
    module: 'planning',
    template: 'workspace',
    title: 'Planejamento',
    localTabs: [
      { label: 'Orcamentos', href: '/financial/budgets' },
      { label: 'Fixas', href: '/financial/fixed-transactions' },
    ],
  },
  {
    pattern: '/financial/budgets/[budgetId]',
    module: 'planning',
    template: 'form',
    title: 'Detalhe do orcamento',
  },
  {
    pattern: '/financial/fixed-transactions',
    module: 'planning',
    template: 'workspace',
    title: 'Transacoes fixas',
    localTabs: [
      { label: 'Fixas', href: '/financial/fixed-transactions' },
      { label: 'Orcamentos', href: '/financial/budgets' },
    ],
  },
  {
    pattern: '/financial/fixed-transactions/new',
    module: 'planning',
    template: 'form',
    title: 'Nova transacao fixa',
  },
  {
    pattern: '/financial/fixed-transactions/[id]',
    module: 'planning',
    template: 'form',
    title: 'Detalhe da transacao fixa',
  },
  {
    pattern: '/financial/dashboard',
    module: 'analytics',
    template: 'overview',
    title: 'Analises',
  },
  {
    pattern: '/financial/reports',
    module: 'analytics',
    template: 'overview',
    title: 'Relatorios',
  },
  {
    pattern: '/financial/reports/cashflow',
    module: 'analytics',
    template: 'reporting',
    title: 'Fluxo de caixa',
  },
  {
    pattern: '/financial/reports/dre',
    module: 'analytics',
    template: 'reporting',
    title: 'DRE',
  },
  {
    pattern: '/financial/reports/balance',
    module: 'analytics',
    template: 'reporting',
    title: 'Balanco',
  },
  {
    pattern: '/financial/reports/financial-account-movement',
    module: 'analytics',
    template: 'reporting',
    title: 'Movimentacao de contas',
  },
  {
    pattern: '/financial/categories',
    module: 'catalog',
    template: 'settings',
    title: 'Categorias',
    requiredPermission: 'FINANCIAL_CATEGORIES',
  },
  {
    pattern: '/financial/categories/new',
    module: 'catalog',
    template: 'form',
    title: 'Nova categoria',
    requiredPermission: 'FINANCIAL_CATEGORIES',
  },
  {
    pattern: '/financial/categories/[id]',
    module: 'catalog',
    template: 'form',
    title: 'Detalhe da categoria',
    requiredPermission: 'FINANCIAL_CATEGORIES',
  },
  {
    pattern: '/admin/users',
    module: 'admin',
    template: 'workspace',
    title: 'Usuarios',
    requiredRole: 'SUPERUSER',
  },
  {
    pattern: '/admin/users/new',
    module: 'admin',
    template: 'form',
    title: 'Novo usuario',
    requiredRole: 'SUPERUSER',
  },
  {
    pattern: '/admin/users/[id]',
    module: 'admin',
    template: 'form',
    title: 'Detalhe do usuario',
    requiredRole: 'SUPERUSER',
  },
  {
    pattern: '/admin/settings',
    module: 'admin',
    template: 'settings',
    title: 'Configuracoes',
    requiredRole: 'SUPERUSER',
  },
  {
    pattern: '/admin/companies',
    module: 'admin',
    template: 'settings',
    title: 'Empresas',
    requiredRole: 'SUPERUSER',
  },
];

function normalizePathname(pathname: string): string {
  const [withoutQuery] = pathname.split('?');
  const [withoutHash] = withoutQuery.split('#');
  if (!withoutHash) {
    return '/';
  }

  if (withoutHash.length > 1 && withoutHash.endsWith('/')) {
    return withoutHash.slice(0, -1);
  }

  return withoutHash;
}

function patternToRegExp(pattern: string): RegExp {
  if (pattern === '/') {
    return /^\/$/;
  }

  const normalized = normalizePathname(pattern)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\/\*$/g, '(?:\\/.*)?')
    .replace(/\\\[\.{3}[^\]]+\\\]/g, '(.+)')
    .replace(/\\\[[^\]]+\\\]/g, '([^/]+)');

  return new RegExp(`^${normalized}$`);
}

export function matchesRoutePattern(pathname: string, pattern: string): boolean {
  return patternToRegExp(pattern).test(normalizePathname(pathname));
}

export function resolvePrimaryDestination(
  pathname: string
): AppShellDestination | undefined {
  const normalized = normalizePathname(pathname);

  return primaryDestinations.find((destination) =>
    destination.matchers.some((matcher) => matchesRoutePattern(normalized, matcher))
  );
}

export function resolveRouteSurface(pathname: string): RouteSurface | undefined {
  const normalized = normalizePathname(pathname);

  return routeSurfaces.find((surface) =>
    matchesRoutePattern(normalized, surface.pattern)
  );
}
