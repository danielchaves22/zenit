import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePermissions } from '@/hooks/usePermissions';
import { ChevronRight, Home, Lock } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface SmartBreadcrumbProps {
  items?: BreadcrumbItem[];
  showHome?: boolean;
  showPermissionWarnings?: boolean;
  maxItems?: number;
  className?: string;
}

const routeToBreadcrumb: Record<string, BreadcrumbItem[]> = {
  '/': [{ label: 'Dashboard', href: '/', icon: <Home size={14} /> }],

  '/financial/dashboard': [
    { label: 'Dashboard', href: '/' },
    { label: 'Dashboard Financeiro' }
  ],
  '/financial/accounts': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Contas' }
  ],
  '/financial/accounts/new': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Contas', href: '/financial/accounts' },
    { label: 'Nova Conta' }
  ],
  '/financial/accounts/[id]': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Contas', href: '/financial/accounts' },
    { label: 'Editar Conta' }
  ],
  '/financial/credit-cards': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Cartões e Faturas' }
  ],
  '/financial/credit-cards/new': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
    { label: 'Novo Cartão' }
  ],
  '/financial/credit-cards/purchases': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
    { label: 'Compras Parceladas no Cartão' }
  ],
  '/financial/credit-cards/[accountId]': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
    { label: 'Editar Cartão' }
  ],
  '/financial/credit-cards/[accountId]/invoices': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
    { label: 'Faturas' }
  ],
  '/financial/transactions': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Transações' }
  ],
  '/financial/transactions/new': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Transações', href: '/financial/transactions' },
    { label: 'Nova Transação' }
  ],
  '/financial/transactions/new-credit-card-purchase': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Transações', href: '/financial/transactions' },
    { label: 'Nova Compra no Cartão' }
  ],
  '/financial/categories': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Categorias' }
  ],
  '/financial/categories/new': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Categorias', href: '/financial/categories' },
    { label: 'Nova Categoria' }
  ],
  '/financial/categories/[id]': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Categorias', href: '/financial/categories' },
    { label: 'Editar Categoria' }
  ],
  '/financial/fixed-transactions': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Transações Fixas' }
  ],
  '/financial/fixed-transactions/new': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Transações Fixas', href: '/financial/fixed-transactions' },
    { label: 'Nova Fixa' }
  ],
  '/financial/fixed-transactions/[id]': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Transações Fixas', href: '/financial/fixed-transactions' },
    { label: 'Editar Fixa' }
  ],
  '/financial/reports': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Relatórios' }
  ],
  '/financial/reports/financial-account-movement': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Relatórios', href: '/financial/reports' },
    { label: 'Movimentação de Contas' }
  ],

  '/admin/users': [
    { label: 'Dashboard', href: '/' },
    { label: 'Administração' },
    { label: 'Usuários' }
  ],
  '/admin/users/new': [
    { label: 'Dashboard', href: '/' },
    { label: 'Administração' },
    { label: 'Usuários', href: '/admin/users' },
    { label: 'Novo Usuário' }
  ],
  '/admin/users/[id]': [
    { label: 'Dashboard', href: '/' },
    { label: 'Administração' },
    { label: 'Usuários', href: '/admin/users' },
    { label: 'Editar Usuário' }
  ],
  '/admin/companies': [
    { label: 'Dashboard', href: '/' },
    { label: 'Administração' },
    { label: 'Empresas' }
  ],
  '/admin/settings': [
    { label: 'Dashboard', href: '/' },
    { label: 'Administração' },
    { label: 'Configurações' }
  ],

  '/profile': [
    { label: 'Dashboard', href: '/' },
    { label: 'Meu Perfil' }
  ]
};

export function SmartBreadcrumb({
  items,
  showHome = true,
  showPermissionWarnings = true,
  maxItems = 5,
  className = ''
}: SmartBreadcrumbProps) {
  const router = useRouter();
  const { hasPermission } = usePermissions();

  const breadcrumbItems = items || generateAutoBreadcrumbs(router.pathname, router.query);

  const filteredItems = breadcrumbItems
    .filter((item) => {
      if (!item.href) return true;
      return checkLinkPermission(item.href);
    })
    .slice(0, maxItems);

  function checkLinkPermission(href: string): boolean {
    const alwaysAllowed = ['/', '/profile'];
    if (alwaysAllowed.includes(href)) return true;

    if (href.startsWith('/admin/companies')) {
      return hasPermission({ allowedRoles: ['ADMIN'] });
    }
    if (href.startsWith('/admin')) {
      return hasPermission({ requiredRole: 'SUPERUSER' });
    }
    if (href.startsWith('/financial')) {
      return true;
    }

    return true;
  }

  function generateAutoBreadcrumbs(pathname: string, query: any): BreadcrumbItem[] {
    if (routeToBreadcrumb[pathname]) {
      return [...routeToBreadcrumb[pathname]];
    }

    for (const [route, breadcrumb] of Object.entries(routeToBreadcrumb)) {
      if (route.includes('[') && pathname.match(route.replace(/\[.*?\]/g, '[^/]+'))) {
        return [...breadcrumb];
      }
    }

    const segments = pathname.split('/').filter(Boolean);
    const generatedItems: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/' }];

    let currentPath = '';
    for (let index = 0; index < segments.length; index += 1) {
      currentPath += `/${segments[index]}`;
      const isLast = index === segments.length - 1;
      const label = getSegmentLabel(segments[index]);

      generatedItems.push({
        label,
        href: isLast ? undefined : currentPath
      });
    }

    return generatedItems;
  }

  function getSegmentLabel(segment: string): string {
    const labelMap: Record<string, string> = {
      financial: 'Financeiro',
      admin: 'Administração',
      dashboard: 'Dashboard',
      accounts: 'Contas',
      purchases: 'Compras Parceladas no Cartão',
      'credit-cards': 'Cartões e Faturas',
      transactions: 'Transações',
      'fixed-transactions': 'Transações Fixas',
      'new-credit-card-purchase': 'Nova Compra no Cartão',
      categories: 'Categorias',
      reports: 'Relatórios',
      users: 'Usuários',
      companies: 'Empresas',
      settings: 'Configurações',
      new: 'Novo',
      edit: 'Editar',
      profile: 'Meu Perfil',
      'financial-account-movement': 'Movimentação de Contas',
      cashflow: 'Fluxo de Caixa',
      income: 'DRE',
      balance: 'Balancete'
    };

    return labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
  }

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <nav
      className={`mb-4 flex items-center text-sm text-gray-400 ${className}`}
      aria-label="Breadcrumb"
    >
      <ol className="flex items-center space-x-1">
        {filteredItems.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && <ChevronRight size={14} className="mx-2 text-gray-500" />}

            {item.href ? (
              <Link
                href={item.href}
                className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50"
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span className="flex items-center gap-1 font-medium text-gray-300">
                {item.icon}
                <span>{item.label}</span>
              </span>
            )}

            {showPermissionWarnings && item.href && !checkLinkPermission(item.href) && (
              <span className="ml-1 text-red-400" title="Acesso restrito">
                <Lock size={12} />
              </span>
            )}
          </li>
        ))}
      </ol>

      {breadcrumbItems.length > maxItems && (
        <span
          className="ml-2 text-gray-500"
          title={`${breadcrumbItems.length - maxItems} itens ocultos`}
        >
          (+{breadcrumbItems.length - maxItems})
        </span>
      )}
    </nav>
  );
}

export function SimpleBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <SmartBreadcrumb
      items={items}
      showPermissionWarnings={false}
      maxItems={10}
      className="mb-2"
    />
  );
}

export function FinancialBreadcrumb({ currentPage }: { currentPage: string }) {
  const items: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/', icon: <Home size={14} /> },
    { label: 'Financeiro' },
    { label: currentPage }
  ];

  return <SmartBreadcrumb items={items} showHome={false} />;
}

export function AdminBreadcrumb({ currentPage }: { currentPage: string }) {
  const items: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/', icon: <Home size={14} /> },
    { label: 'Administração' },
    { label: currentPage }
  ];

  return <SmartBreadcrumb items={items} showHome={false} />;
}
