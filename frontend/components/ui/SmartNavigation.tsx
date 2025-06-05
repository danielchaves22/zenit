// frontend/components/ui/SmartNavigation.tsx - NAVEGAÇÃO INTELIGENTE COM PERMISSÕES
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePermissions, UserRole } from '@/hooks/usePermissions';
import { 
  Home, DollarSign, CreditCard, Receipt, Building2, 
  BarChart3, Users, Settings, TrendingUp, TrendingDown,
  ArrowUpDown, Calendar
} from 'lucide-react';

interface NavigationItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  description?: string;
  requiredRole?: UserRole;
  allowedRoles?: UserRole[];
  category?: string;
}

const quickNavigationItems: NavigationItem[] = [
  {
    label: 'Nova Despesa',
    href: '/financial/transactions/new?type=EXPENSE&locked=true',
    icon: <TrendingDown size={16} />,
    description: 'Registrar nova despesa',
    category: 'financeiro'
  },
  {
    label: 'Nova Receita',
    href: '/financial/transactions/new?type=INCOME&locked=true',
    icon: <TrendingUp size={16} />,
    description: 'Registrar nova receita',
    category: 'financeiro'
  },
  {
    label: 'Nova Transferência',
    href: '/financial/transactions/new?type=TRANSFER&locked=true',
    icon: <ArrowUpDown size={16} />,
    description: 'Transferir entre contas',
    category: 'financeiro'
  },
  
  {
    label: 'Transações',
    href: '/financial/transactions',
    icon: <Receipt size={20} />,
    description: 'Lançamentos financeiros',
    category: 'financeiro'
  },
  {
    label: 'Dashboard Financeiro',
    href: '/financial/dashboard',
    icon: <DollarSign size={20} />,
    description: 'Resumos e indicadores financeiros',
    category: 'financeiro'
  }
];

// ✅ DEFINIR TODAS AS ROTAS COM SUAS PERMISSÕES
const navigationItems: NavigationItem[] = [
  // Dashboard Principal
  {
    label: 'Dashboard',
    href: '/',
    icon: <Home size={20} />,
    description: 'Visão geral do sistema',
    category: 'principal'
  },
  
  // Módulo Financeiro
  {
    label: 'Dashboard Financeiro',
    href: '/financial/dashboard',
    icon: <DollarSign size={20} />,
    description: 'Resumos e indicadores financeiros',
    category: 'financeiro'
  },
  {
    label: 'Nova Despesa',
    href: '/financial/transactions/new?type=EXPENSE&locked=true',
    icon: <TrendingDown size={16} />,
    description: 'Registrar nova despesa',
    category: 'financeiro'
  },
  {
    label: 'Nova Receita',
    href: '/financial/transactions/new?type=INCOME&locked=true',
    icon: <TrendingUp size={16} />,
    description: 'Registrar nova receita',
    category: 'financeiro'
  },
  {
    label: 'Nova Transferência',
    href: '/financial/transactions/new?type=TRANSFER&locked=true',
    icon: <ArrowUpDown size={16} />,
    description: 'Transferir entre contas',
    category: 'financeiro'
  },
  
  {
    label: 'Transações',
    href: '/financial/transactions',
    icon: <Receipt size={20} />,
    description: 'Lançamentos financeiros',
    category: 'financeiro'
  },
  
  {
    label: 'Contas Financeiras',
    href: '/financial/accounts',
    icon: <CreditCard size={20} />,
    description: 'Gerenciar contas bancárias e cartões',
    category: 'financeiro'
  },
  {
    label: 'Categorias',
    href: '/financial/categories',
    icon: <Building2 size={20} />,
    description: 'Organizar receitas e despesas',
    category: 'financeiro'
  },
  
  // Relatórios
  {
    label: 'Relatórios Financeiros',
    href: '/financial/reports',
    icon: <BarChart3 size={20} />,
    description: 'Análises e demonstrativos',
    category: 'relatórios'
  },
  {
    label: 'Movimentação de Contas',
    href: '/financial/reports/financial-account-movement',
    icon: <Calendar size={16} />,
    description: 'Relatório detalhado de movimentações',
    category: 'relatórios'
  },
  
  // Administração
  {
    label: 'Usuários',
    href: '/admin/users',
    icon: <Users size={20} />,
    description: 'Gerenciar usuários do sistema',
    category: 'administração',
    requiredRole: 'SUPERUSER'
  },
  {
    label: 'Empresas',
    href: '/admin/companies',
    icon: <Building2 size={20} />,
    description: 'Administrar empresas',
    category: 'administração',
    allowedRoles: ['ADMIN']
  },
  {
    label: 'Configurações',
    href: '/admin/settings',
    icon: <Settings size={20} />,
    description: 'Configurações do sistema',
    category: 'administração',
    requiredRole: 'SUPERUSER'
  }
];

interface SmartNavigationProps {
  quickNavigation?: boolean; // Se for true, usa quickNavigationItems
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
  const itemsToUse = quickNavigation ? quickNavigationItems : navigationItems;

  // ✅ FILTRAR ITENS BASEADO NAS PERMISSÕES
  const allowedItems = itemsToUse.filter(item => {
    // Filtrar por categoria se especificada
    if (category && item.category !== category) {
      return false;
    }

    // Verificar permissões
    return hasPermission({
      requiredRole: item.requiredRole,
      allowedRoles: item.allowedRoles
    });
  }).slice(0, maxItems);

  // ✅ AGRUPAR POR CATEGORIA
  const itemsByCategory = allowedItems.reduce((acc, item) => {
    const cat = item.category || 'outros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, NavigationItem[]>);

  // ✅ VERIFICAR SE ITEM ESTÁ ATIVO
  const isActive = (href: string) => {
    if (href === '/') {
      return router.pathname === '/';
    }
    return router.pathname.startsWith(href.split('?')[0]);
  };

  // ✅ RENDERIZAR ITEM DE NAVEGAÇÃO
  const renderNavigationItem = (item: NavigationItem, index: number) => {
    const active = isActive(item.href);
    
    const baseClasses = "group relative block p-4 rounded-lg border transition-all duration-200 hover:shadow-lg";
    const layoutClasses = {
      grid: "h-full",
      list: "flex items-center gap-4",
      compact: "flex items-center gap-2 p-2"
    };
    
    const stateClasses = active
      ? "bg-accent text-white border-accent shadow-lg"
      : "bg-[#151921] border-gray-700 hover:border-accent hover:bg-[#1a1f2b]";

    return (
      <Link key={index} href={item.href} className={`${baseClasses} ${layoutClasses[layout]} ${stateClasses}`}>
        <div className={layout === 'list' ? 'flex-shrink-0' : 'mb-3'}>
          <div className={`${active ? 'text-white' : 'text-accent'} ${layout === 'compact' ? '' : 'mb-2'}`}>
            {item.icon}
          </div>
        </div>
        
        <div className={layout === 'list' ? 'flex-1 min-w-0' : ''}>
          <h3 className={`font-medium ${active ? 'text-white' : 'text-white'} ${
            layout === 'compact' ? 'text-sm' : 'text-base'
          } group-hover:text-white transition-colors`}>
            {item.label}
          </h3>
          
          {showDescriptions && item.description && layout !== 'compact' && (
            <p className={`text-sm mt-1 ${
              active ? 'text-white/80' : 'text-gray-400'
            } group-hover:text-white/80 transition-colors`}>
              {item.description}
            </p>
          )}
        </div>
        
        {/* Indicador de ativo */}
        {active && (
          <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full opacity-80" />
        )}
      </Link>
    );
  };

  if (allowedItems.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <p className="text-gray-400">Nenhuma opção de navegação disponível para seu perfil.</p>
        <p className="text-sm text-gray-500 mt-2">
          Perfil atual: <span className="font-medium">{currentRole}</span>
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {showCategories && Object.keys(itemsByCategory).length > 1 ? (
        // ✅ LAYOUT COM CATEGORIAS
        <div className="space-y-8">
          {Object.entries(itemsByCategory).map(([categoryName, items]) => (
            <div key={categoryName}>
              <h2 className="text-lg font-semibold text-white mb-4 capitalize">
                {categoryName}
              </h2>
              <div className={
                layout === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' :
                layout === 'list' ? 'space-y-2' :
                'grid grid-cols-1 md:grid-cols-2 gap-2'
              }>
                {items.map((item, index) => renderNavigationItem(item, index))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ✅ LAYOUT SIMPLES
        <div className={
          layout === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' :
          layout === 'list' ? 'space-y-2' :
          'grid grid-cols-1 md:grid-cols-2 gap-2'
        }>
          {allowedItems.map((item, index) => renderNavigationItem(item, index))}
        </div>
      )}
    </div>
  );
}

// ✅ COMPONENTE SIMPLIFICADO PARA MENU RÁPIDO
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

// ✅ COMPONENTE PARA NAVEGAÇÃO PRINCIPAL
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