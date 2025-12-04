// frontend/components/ui/SmartNavigation.tsx - NavegaÃ§Ã£o mÃ­nima (Usuários/Empresas)
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePermissions, UserRole } from '@/hooks/usePermissions';
import { Building2, Users } from 'lucide-react';

interface NavigationItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  description?: string;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  category?: string;
}

interface SmartNavigationProps {
  quickNavigation?: boolean;
  showCategories?: boolean;
  showDescriptions?: boolean;
  maxItems?: number;
  category?: string;
  layout?: 'grid' | 'list' | 'compact';
  className?: string;
}

export function SmartNavigation({
  quickNavigation = false,
  showCategories = true,
  showDescriptions = true,
  maxItems = 20,
  category,
  layout = 'grid',
  className = ''
}: SmartNavigationProps) {
  const router = useRouter();
  const { hasPermission, currentRole } = usePermissions();

  const items: NavigationItem[] = [
    {
      label: 'Usuários',
      href: '/admin/users',
      icon: <Users size={20} />,
      description: 'Gerenciar Usuários',
      category: 'administração',
      allowedRoles: ['ADMIN', 'SUPERUSER', 'USER']
    },
    {
      label: 'Empresas',
      href: '/admin/companies',
      icon: <Building2 size={20} />,
      description: 'Administrar empresas',
      category: 'administração',
      allowedRoles: ['ADMIN']
    }
  ];

  const allowedItems = items
    .filter((item) => !category || item.category === category)
    .filter((item) => hasPermission({ requiredRole: item.requiredRole, allowedRoles: item.allowedRoles }))
    .slice(0, maxItems);

  const itemsByCategory = allowedItems.reduce((acc, item) => {
    const cat = item.category || 'outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, NavigationItem[]>);

  const isActive = (href: string) => {
    if (href === '/') return router.pathname === '/';
    return router.pathname.startsWith(href.split('?')[0]);
  };

  const renderNavigationItem = (item: NavigationItem, index: number) => {
    const active = isActive(item.href);
    const baseClasses = 'group relative block p-4 rounded-lg border transition-all duration-200 hover:shadow-lg';
    const layoutClasses = {
      grid: 'h-full',
      list: 'flex items-center gap-4',
      compact: 'flex items-center gap-2 p-2'
    } as const;
    const stateClasses = active
      ? 'bg-accent text-white border-accent shadow-lg'
      : 'bg-surface border-gray-700 hover:border-accent hover:bg-elevated';

    return (
      <Link key={index} href={item.href} className={`${baseClasses} ${layoutClasses[layout]} ${stateClasses}`}>
        <div className={layout === 'list' ? 'flex-shrink-0' : 'mb-3'}>
          <div className={`${active ? 'text-white' : 'text-accent'} ${layout === 'compact' ? '' : 'mb-2'}`}>
            {item.icon}
          </div>
        </div>
        <div className={layout === 'list' ? 'flex-1 min-w-0' : ''}>
          <h3 className={`font-medium ${active ? 'text-white' : 'text-white'} ${layout === 'compact' ? 'text-sm' : 'text-base'} group-hover:text-white transition-colors`}>
            {item.label}
          </h3>
          {showDescriptions && item.description && layout !== 'compact' && (
            <p className={`text-sm mt-1 ${active ? 'text-white/80' : 'text-gray-400'} group-hover:text-white/80 transition-colors`}>
              {item.description}
            </p>
          )}
        </div>
        {active && <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full opacity-80" />}
      </Link>
    );
  };

  if (allowedItems.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-400">Nenhuma opção de navegação disponível para seu perfil.</p>
        <p className="text-sm text-gray-500 mt-2">Perfil atual: <span className="font-medium">{currentRole}</span></p>
      </div>
    );
  }

  return (
    <div className={className}>
      {showCategories && Object.keys(itemsByCategory).length > 1 ? (
        <div className="space-y-8">
          {Object.entries(itemsByCategory).map(([categoryName, items]) => (
            <div key={categoryName}>
              <h2 className="text-lg font-semibold text-white mb-4 capitalize">{categoryName}</h2>
              <div className={layout === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : layout === 'list' ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 gap-2'}>
                {items.map((item, index) => renderNavigationItem(item, index))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={layout === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : layout === 'list' ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 gap-2'}>
          {allowedItems.map((item, index) => renderNavigationItem(item, index))}
        </div>
      )}
    </div>
  );
}

export function QuickNavigation({ category }: { category?: string }) {
  return (
    <SmartNavigation
      quickNavigation={true}
      category={category}
      layout="compact"
      showCategories={false}
      showDescriptions={false}
      maxItems={6}
      className="grid grid-cols-2 md:grid-cols-3 gap-2"
    />
  );
}

export function MainNavigation() {
  return (
    <SmartNavigation
      showCategories={true}
      showDescriptions={true}
      layout="grid"
      className="max-w-6xl mx-auto"
    />
  );
}

export default SmartNavigation;




