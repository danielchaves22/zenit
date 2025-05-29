// frontend/components/layout/Sidebar.tsx
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  PieChart, DollarSign, CreditCard, Building2, Receipt, Home,
  Users, Settings, ChevronLeft, ChevronRight, User, 
  TrendingDown, TrendingUp, BarChart3, FileText, Calendar
} from 'lucide-react';

// Tipo para submenu - href é opcional para itens não clicáveis
type SubMenuItem = {
  label: string;
  href?: string;
  isHeader?: boolean; // Para identificar itens que atuam como categorias
  showWhenExpanded?: boolean; // Controla visibilidade no modo expandido
};

// Tipo para item de menu
type MenuItem = {
  icon: React.ReactNode;
  label: string;
  subItems: SubMenuItem[]; // Todos terão pelo menos um subitem
};

// Tipo para título de seção
type SectionTitle = {
  title: string;
  type: 'title';
};

type SidebarItem = MenuItem | SectionTitle;

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean; 
}

export function Sidebar({ onToggle, isCollapsed }: SidebarProps) {
  // Obtém o estado salvo no localStorage ou usa o padrão
  const getSavedCollapsedState = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  };
  
  // Se isCollapsed for fornecido, use-o; caso contrário, gerencia o estado internamente
  const [internalCollapsed, setInternalCollapsed] = useState(getSavedCollapsedState);
  const collapsed = isCollapsed !== undefined ? isCollapsed : internalCollapsed;
  
  const router = useRouter();
  
  // Estado para controlar qual submenu está aberto (para flutuante)
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  // Coordenadas do submenu flutuante
  const [submenuPosition, setSubmenuPosition] = useState({ top: 0, left: 0 });

  // Salva o estado atual no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(collapsed));
  }, [collapsed]);

  const menuItems: SidebarItem[] = [
    {
      title: 'Principal',
      type: 'title'
    },
    {
      icon: <Home size={20} />,
      label: 'Início',
      subItems: [
        { label: 'Início', href: '/', showWhenExpanded: true },
      ],
    },
    {
      title: 'Financeiro',
      type: 'title'
    },
    {
      icon: <PieChart size={20} />,
      label: 'Dashboard',
      subItems: [
        { label: 'Dashboard Financeiro', href: '/financial/dashboard', showWhenExpanded: true },
      ],
    },
    {
      icon: <CreditCard size={20} />,
      label: 'Contas',
      subItems: [
        { label: 'Contas', href: '/financial/accounts', showWhenExpanded: true },
      ],
    },
    {
      icon: <Receipt size={20} />,
      label: 'Transações',
      subItems: [
        { label: 'Transações', href: '/financial/transactions', showWhenExpanded: true },
      ],
    },
    {
      icon: <Building2 size={20} />,
      label: 'Categorias',
      subItems: [
        { label: 'Categorias', href: '/financial/categories', showWhenExpanded: true },
      ],
    },
    {
      icon: <Calendar size={20} />,
      label: 'Recorrentes',
      subItems: [
        { label: 'Recorrentes', href: '/financial/recurring', showWhenExpanded: true },
      ],
    },
    {
      title: 'Relatórios',
      type: 'title'
    },
    {
      icon: <BarChart3 size={20} />,
      label: 'Relatórios',
      subItems: [
        { label: 'Fluxo de Caixa', href: '/reports/cashflow' },
        { label: 'DRE', href: '/reports/income' },
        { label: 'Balancete', href: '/reports/balance' },
      ],
    },
    {
      title: 'Administração',
      type: 'title'
    },
    {
      icon: <Users size={20} />,
      label: 'Usuários',
      subItems: [
        { label: 'Usuários', href: '/admin/users', showWhenExpanded: true },
      ],
    },
    {
      icon: <Building2 size={20} />,
      label: 'Empresas',
      subItems: [
        { label: 'Empresas', href: '/admin/companies', showWhenExpanded: true },
      ],
    },
    {
      icon: <Settings size={20} />,
      label: 'Configurações',
      subItems: [
        { label: 'Configurações', href: '/admin/settings', showWhenExpanded: true },
      ],
    },
  ];

  const toggleSidebar = () => {
    const newCollapsedState = !collapsed;
    
    // Se estamos controlando internamente, atualize o estado
    if (isCollapsed === undefined) {
      setInternalCollapsed(newCollapsedState);
    }
    
    // Notifica o componente pai (DashboardLayout) sobre a mudança
    if (onToggle) {
      onToggle(newCollapsedState);
    }

    // Fecha qualquer submenu aberto
    setActiveSubmenu(null);
  };

  const handleMouseEnter = (item: MenuItem, event: React.MouseEvent) => {
    // No modo colapsado, sempre mostrar o submenu flutuante
    // No modo expandido, mostrar apenas para itens com mais de um subitem
    if (collapsed || hasMultipleClickableSubItems(item)) {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      
      // Posição diferente dependendo do modo
      setSubmenuPosition({ 
        top: rect.top, 
        left: collapsed ? 64 : 208 // 16px ou 52px + um espaço
      });
      
      setActiveSubmenu(item.label);
    }
  };

  const handleMouseLeave = () => {
    setActiveSubmenu(null);
  };

  // Verifica se um item tem mais de um subitem clicável (com href)
  const hasMultipleClickableSubItems = (item: MenuItem) => {
    return item.subItems.filter(subItem => subItem.href).length > 1;
  };

  // Obtém o primeiro subitem clicável
  const getFirstClickableSubItem = (item: MenuItem) => {
    return item.subItems.find(subItem => subItem.href);
  };

  // Determina qual item de menu está ativo
  const getActiveMenuItem = () => {
    if (!activeSubmenu) return null;
    
    return menuItems.find(item => 
      !('type' in item) && item.label === activeSubmenu
    ) as MenuItem | null;
  };

  const activeMenu = getActiveMenuItem();

  return (
    <>
      <div
        className={`h-[calc(100vh-60px)] bg-[#151921] text-gray-300 flex flex-col transition-all duration-300 fixed z-30 top-[60px] left-0 ${
          collapsed ? 'w-16' : 'w-52'
        }`}
        style={{ marginTop: "-1px" }}
      >
        {/* Botão de toggle no centro da borda direita */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-1/2 transform -translate-y-1/2 bg-[#151921] rounded-full p-1 text-gray-300 z-10"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <ChevronLeft size={16} />
          )}
        </button>

        <div className="flex-1 overflow-y-auto">
          {menuItems.map((item, index) => {
            if ('type' in item && item.type === 'title') {
              // Separadores de seção - apenas no modo expandido
              if (!collapsed) {
                return (
                  <div key={index} className="px-4 py-2 mt-4 first:mt-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {item.title}
                    </span>
                  </div>
                );
              }
              return null;
            }

            const menuItem = item as MenuItem;
            const hasMultipleSubItems = hasMultipleClickableSubItems(menuItem);
            const firstClickableSubItem = getFirstClickableSubItem(menuItem);
            const href = firstClickableSubItem?.href || '#';
            
            // Verificar se algum dos subitens corresponde à rota atual
            const isActive = menuItem.subItems.some(
              subItem => subItem.href && router.pathname === subItem.href
            );

            return (
              <div key={index}>
                {collapsed ? (
                  <div 
                    className={`cursor-pointer px-4 py-3 ${
                      isActive ? 'bg-[#f59e0b] text-white' : 'text-gray-300 hover:bg-[#1e2126]'
                    } flex justify-center items-center`}
                    onMouseEnter={(e) => handleMouseEnter(menuItem, e)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => {
                      if (href && href !== '#') {
                        router.push(href);
                      }
                    }}
                  >
                    {menuItem.icon}
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <Link
                      href={href}
                      className={`flex items-center justify-between px-4 py-3 ${
                        isActive ? 'bg-[#f59e0b] text-white font-medium' : 'hover:bg-[#1e2126]'
                      }`}
                      onMouseEnter={(e) => handleMouseEnter(menuItem, e)}
                      onMouseLeave={handleMouseLeave}
                    >
                      <div className="flex items-center">
                        <span className="mr-3">{menuItem.icon}</span>
                        <span>{menuItem.label}</span>
                      </div>
                      
                      {hasMultipleSubItems && <ChevronRight size={16} className="ml-2" />}
                    </Link>

                    {/* Submenu normais para modo expandido - apenas visíveis quando o item está ativo */}
                    {hasMultipleSubItems && (
                      <div className={`pl-10 bg-[#111419] overflow-hidden transition-all duration-300 ease-in-out ${
                        isActive ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
                      }`}>
                        {menuItem.subItems
                          // Filtra apenas os que devem ser mostrados quando expandido
                          .filter(subItem => subItem.showWhenExpanded !== false)
                          .map((subItem, subIndex) => {
                            // Determina se deve renderizar como categoria de destaque
                            const isSingleItem = menuItem.subItems.length === 1;
                            const renderAsCategory = !subItem.href || isSingleItem;
                            
                            return renderAsCategory ? (
                              <div 
                                key={subIndex}
                                className="block py-2 pl-2 pr-4 text-gray-300"
                                onClick={() => {
                                  if (subItem.href) {
                                    router.push(subItem.href);
                                  }
                                }}
                                style={{ cursor: subItem.href ? 'pointer' : 'default' }}
                              >
                                {subItem.label}
                              </div>
                            ) : (
                              <Link
                                key={subIndex}
                                href={subItem.href || '#'}
                                className={`block py-2 pl-2 pr-4 hover:bg-[#1e2126] text-sm ${
                                  router.pathname === subItem.href ? 'text-[#f59e0b]' : 'text-gray-400'
                                }`}
                              >
                                {subItem.label}
                              </Link>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Submenu flutuante - para todos os itens no modo colapsado ou apenas múltiplos subitens no expandido */}
      {activeMenu && (
        <div 
          className="fixed bg-[#1e2126] border border-gray-700 rounded shadow-lg z-50 transition-opacity duration-200 ease-in-out opacity-100"
          style={{ 
            left: `${submenuPosition.left}px`,
            top: submenuPosition.top, 
            minWidth: '200px',
            display: 'block'
          }}
          onMouseEnter={() => setActiveSubmenu(activeMenu.label)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="py-1">
            {activeMenu.subItems
              .map((subItem, index) => {
                // Determina se deve renderizar como categoria de destaque
                const isSingleItem = activeMenu.subItems.length === 1;
                const renderAsCategory = !subItem.href || isSingleItem;
                
                return renderAsCategory ? (
                  <div 
                    key={index}
                    className="block px-4 py-2 text-gray-300 whitespace-nowrap"
                    onClick={() => {
                      if (subItem.href) {
                        router.push(subItem.href);
                      }
                    }}
                    style={{ cursor: subItem.href ? 'pointer' : 'default' }}
                  >
                    {subItem.label}
                  </div>
                ) : (
                  <Link
                    key={index}
                    href={subItem.href || '#'}
                    className="block px-4 py-2 hover:bg-[#262b36] text-gray-300 text-sm whitespace-nowrap"
                  >
                    {subItem.label}
                  </Link>
                );
              })}
          </div>
        </div>
      )}
    </>
  );
}