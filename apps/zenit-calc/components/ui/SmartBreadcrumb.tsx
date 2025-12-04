// frontend/components/ui/SmartBreadcrumb.tsx - BREADCRUMB INTELIGENTE COM PERMISSÃ•ES
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

// âœ… MAPEAMENTO DE ROTAS PARA BREADCRUMBS AUTOMÃTICOS
const routeToBreadcrumb: Record<string, BreadcrumbItem[]> = {
  '/': [
    { label: 'Dashboard', href: '/', icon: <Home size={14} /> }
  ],
  // Financeiro removido

  
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

  // âœ… GERAR BREADCRUMBS AUTOMATICAMENTE SE NÃƒO FORNECIDOS
  const breadcrumbItems = items || generateAutoBreadcrumbs(router.pathname, router.query);

  // âœ… FILTRAR ITENS COM BASE EM PERMISSÃ•ES
  const filteredItems = breadcrumbItems
    .filter(item => {
      // Se nÃ£o tem href, sempre mostrar (Ã© um item final)
      if (!item.href) return true;
      
      // Verificar permissÃµes para links
      return checkLinkPermission(item.href);
    })
    .slice(0, maxItems);

  // âœ… VERIFICAR SE UM LINK Ã‰ ACESSÃVEL
  function checkLinkPermission(href: string): boolean {
    // Rotas sempre permitidas
    const alwaysAllowed = ['/', '/profile'];
    if (alwaysAllowed.includes(href)) return true;
    
    // Verificar permissÃµes especÃ­ficas
    if (href.startsWith('/admin/companies')) { return hasPermission({ allowedRoles: ['ADMIN'] }); }

    if (href.startsWith('/admin')) {
      return hasPermission({ requiredRole: 'SUPERUSER' });
    }
    
    // Financeiro Ã© permitido para todos
    if (href.startsWith('/financial')) { return false; }
    
    return true; // Default: permitir
  }

  // âœ… GERAR BREADCRUMBS AUTOMÃTICOS
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
      
      // Mapear segmentos para labels amigÃ¡veis
      const label = getSegmentLabel(segments[i], currentPath);
      
      items.push({
        label,
        href: isLast ? undefined : currentPath
      });
    }
    
    return items;
  }

  // âœ… CONVERTER SEGMENTOS DE URL EM LABELS AMIGÃVEIS
  function getSegmentLabel(segment: string, fullPath: string): string {
    const labelMap: Record<string, string> = {
      'admin': 'Administração',
      'dashboard': 'Dashboard',
      'users': 'Usuários',
      'companies': 'Empresas',
      'settings': 'Configurações',
      'new': 'Novo',
      'edit': 'Editar',
      'profile': 'Meu Perfil'
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
            
            {/* âœ… INDICADOR DE PERMISSÃƒO NEGADA */}
            {showPermissionWarnings && item.href && !checkLinkPermission(item.href) && (
              <span className="ml-1 text-red-400" title="Acesso restrito">
                <Lock size={12} />
              </span>
            )}
          </li>
        ))}
      </ol>
      
      {/* âœ… INDICADOR DE TRUNCAMENTO */}
      {breadcrumbItems.length > maxItems && (
        <span className="ml-2 text-gray-500" title={`${breadcrumbItems.length - maxItems} itens ocultos`}>
          (+{breadcrumbItems.length - maxItems})
        </span>
      )}
    </nav>
  );
}

// âœ… BREADCRUMB SIMPLES PARA CASOS ESPECÃFICOS
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


// âœ… BREADCRUMB PARA PÃGINAS ADMINISTRATIVAS
export function AdminBreadcrumb({ currentPage }: { currentPage: string }) {
  const items: BreadcrumbItem[] = [
    { label: 'Dashboard', href: '/', icon: <Home size={14} /> },
    { label: 'Administração' },
    { label: currentPage }
  ];
  
  return <SmartBreadcrumb items={items} showHome={false} />;
}





