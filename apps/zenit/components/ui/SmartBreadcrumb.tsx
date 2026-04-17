// frontend/components/ui/SmartBreadcrumb.tsx - BREADCRUMB INTELIGENTE COM PERMISSÕES
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

// ✅ MAPEAMENTO DE ROTAS PARA BREADCRUMBS AUTOMÁTICOS
const routeToBreadcrumb: Record<string, BreadcrumbItem[]> = {
  '/': [
    { label: 'Dashboard', href: '/', icon: <Home size={14} /> }
  ],
  
  // Financeiro
  '/financial/dashboard': [
    { label: 'Dashboard', href: '/' },
    { label: 'Dashboard Financeiro' }
  ],
  '/financial/accounts': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Contas' }
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
  '/financial/categories': [
    { label: 'Dashboard', href: '/' },
    { label: 'Financeiro' },
    { label: 'Categorias' }
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
  
  // Administração
  '/admin/users': [
    { label: 'Dashboard', href: '/' },
    { label: 'Administração' },
    { label: 'Usuários' }
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
  
  // Perfil
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

  // ✅ GERAR BREADCRUMBS AUTOMATICAMENTE SE NÃO FORNECIDOS
  const breadcrumbItems = items || generateAutoBreadcrumbs(router.pathname, router.query);

  // ✅ FILTRAR ITENS COM BASE EM PERMISSÕES
  const filteredItems = breadcrumbItems
    .filter(item => {
      // Se não tem href, sempre mostrar (é um item final)
      if (!item.href) return true;
      
      // Verificar permissões para links
      return checkLinkPermission(item.href);
    })
    .slice(0, maxItems);

  // ✅ VERIFICAR SE UM LINK É ACESSÍVEL
  function checkLinkPermission(href: string): boolean {
    // Rotas sempre permitidas
    const alwaysAllowed = ['/', '/profile'];
    if (alwaysAllowed.includes(href)) return true;
    
    // Verificar permissões específicas
    if (href.startsWith('/admin/companies')) {
      return hasPermission({ allowedRoles: ['ADMIN'] });
    }
    if (href.startsWith('/admin')) {
      return hasPermission({ requiredRole: 'SUPERUSER' });
    }
    
    // Financeiro é permitido para todos
    if (href.startsWith('/financial')) {
      return true;
    }
    
    return true; // Default: permitir
  }

  // ✅ GERAR BREADCRUMBS AUTOMÁTICOS
  function generateAutoBreadcrumbs(pathname: string, query: any): BreadcrumbItem[] {
    // Tentar match exato primeiro
    if (routeToBreadcrumb[pathname]) {
      return [...routeToBreadcrumb[pathname]];
    }
    
    // Verificar dynamic routes
    for (const [route, breadcrumb] of Object.entries(routeToBreadcrumb)) {
      if (route.includes('[') && pathname.match(route.replace(/\[.*?\]/g, '[^/]+'))) {
        return [...breadcrumb];
      }
    }
    
    // Tentar construir baseado na estrutura da URL
    const segments = pathname.split('/').filter(Boolean);
    const items: BreadcrumbItem[] = [{ label: 'Dashboard', href: '/' }];
    
    let currentPath = '';
    for (let i = 0; i < segments.length; i++) {
      currentPath += `/${segments[i]}`;
      const isLast = i === segments.length - 1;
      
      // Mapear segmentos para labels amigáveis
      const label = getSegmentLabel(segments[i], currentPath);
      
      items.push({
        label,
        href: isLast ? undefined : currentPath
      });
    }
    
    return items;
  }

  // ✅ CONVERTER SEGMENTOS DE URL EM LABELS AMIGÁVEIS
  function getSegmentLabel(segment: string, fullPath: string): string {
    const labelMap: Record<string, string> = {
      'financial': 'Financeiro',
      'admin': 'Administração',
      'dashboard': 'Dashboard',
      'accounts': 'Contas',
      'transactions': 'Transações',
      'categories': 'Categorias',
      'reports': 'Relatórios',
      'users': 'Usuários',
      'companies': 'Empresas',
      'settings': 'Configurações',
      'new': 'Novo',
      'edit': 'Editar',
      'profile': 'Meu Perfil',
      'financial-account-movement': 'Movimentação de Contas',
      'cashflow': 'Fluxo de Caixa',
      'income': 'DRE',
      'balance': 'Balancete'
    };
    
    return labelMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
  }

  if (filteredItems.length === 0) {
    return null;
  }

  return (
    <nav className={`flex items-center text-sm text-gray-400 mb-4 ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-1">
        {filteredItems.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && (
              <ChevronRight size={14} className="mx-2 text-gray-500" />
            )}
            
            {item.href ? (
              <Link 
                href={item.href}
                className="flex items-center gap-1 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50 rounded px-1 py-0.5"
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ) : (
              <span className="flex items-center gap-1 text-gray-300 font-medium">
                {item.icon}
                <span>{item.label}</span>
              </span>
            )}
            
            {/* ✅ INDICADOR DE PERMISSÃO NEGADA */}
            {showPermissionWarnings && item.href && !checkLinkPermission(item.href) && (
              <span className="ml-1 text-red-400" title="Acesso restrito">
                <Lock size={12} />
              </span>
            )}
          </li>
        ))}
      </ol>
      
      {/* ✅ INDICADOR DE TRUNCAMENTO */}
      {breadcrumbItems.length > maxItems && (
        <span className="ml-2 text-gray-500" title={`${breadcrumbItems.length - maxItems} itens ocultos`}>
          (+{breadcrumbItems.length - maxItems})
        </span>
      )}
    </nav>
  );
}

// ✅ BREADCRUMB SIMPLES PARA CASOS ESPECÍFICOS
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

// ✅ BREADCRUMB PARA PÁGINAS FINANCEIRAS
export function FinancialBreadcrumb({ currentPage }: { currentPage: string }) {
  const items: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/', icon: <Home size={14} /> },
    { label: 'Financeiro' },
    { label: currentPage }
  ];
  
  return <SmartBreadcrumb items={items} showHome={false} />;
}

// ✅ BREADCRUMB PARA PÁGINAS ADMINISTRATIVAS
export function AdminBreadcrumb({ currentPage }: { currentPage: string }) {
  const items: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/', icon: <Home size={14} /> },
    { label: 'Administração' },
    { label: currentPage }
  ];
  
  return <SmartBreadcrumb items={items} showHome={false} />;
}