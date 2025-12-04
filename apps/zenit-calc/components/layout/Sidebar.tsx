// frontend/components/layout/Sidebar.tsx
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Building2, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  isCollapsed?: boolean;
}

type SubMenuItem = {
  label: string;
  href?: string;
  isHeader?: boolean;
  hideWhenExpanded?: boolean;
};

type MenuItem = {
  icon: (cls: string) => React.ReactNode;
  label: string;
  subItems: SubMenuItem[];
  visible: boolean;
};

export function Sidebar({ onToggle, isCollapsed }: SidebarProps) {
  const { userRole } = useAuth();
  const router = useRouter();

  const getSavedCollapsedState = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  };

  const [internalCollapsed, setInternalCollapsed] = useState(getSavedCollapsedState);
  const collapsed = isCollapsed !== undefined ? isCollapsed : internalCollapsed;

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', JSON.stringify(collapsed));
  }, [collapsed]);

  const toggleSidebar = () => {
    const next = !collapsed;
    if (isCollapsed === undefined) setInternalCollapsed(next);
    if (onToggle) onToggle(next);
  };

  const canSeeUsers = userRole === 'ADMIN' || userRole === 'SUPERUSER';
  const canSeeCompanies = userRole === 'ADMIN';

  const menuItems: MenuItem[] = [
    {
      icon: (cls: string) => <Users size={20} className={cls} />,
      label: 'Usuários',
      visible: canSeeUsers,
      subItems: [
        { label: 'Usuários', href: '/admin/users', isHeader: true, hideWhenExpanded: true },
      ],
    },
    {
      icon: (cls: string) => <Building2 size={20} className={cls} />,
      label: 'Empresas',
      visible: canSeeCompanies,
      subItems: [
        { label: 'Empresas', href: '/admin/companies', isHeader: true, hideWhenExpanded: true },
      ],
    },
  ].filter(i => i.visible);

  const [activeMenu, setActiveMenu] = useState<MenuItem | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const getFirstClickableSubItem = (item: MenuItem) => item.subItems.find(s => !!s.href);
  const hasMultipleClickableSubItems = (item: MenuItem) =>
    item.subItems.filter(s => !!s.href && !s.hideWhenExpanded).length > 1;

  const handleMouseEnter = (item: MenuItem, e: React.MouseEvent) => {
    try {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setSubmenuPosition({ top: rect.top + window.scrollY, left: rect.right + 8 });
    } catch {}
    if (collapsed || hasMultipleClickableSubItems(item)) {
      setActiveMenu(item);
    } else {
      setActiveMenu(null);
    }
  };

  const handleMouseLeave = () => setActiveMenu(null);

  return (
    <div
      className={`h-[calc(100vh-60px)] bg-surface text-base-color flex flex-col transition-all duration-300 fixed z-30 top-[60px] left-0 ${
        collapsed ? 'w-16' : 'w-52'
      } border-r border-soft`}
    >
      <div className="h-12 flex items-center justify-between px-3 border-b border-soft">
        <span className={`text-sm font-medium ${collapsed ? 'hidden' : 'block'}`}>Menu</span>
        <button className="p-1 rounded hover:bg-elevated" onClick={toggleSidebar} aria-label="Alternar menu">
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <ul className="py-2">
          {menuItems.map((item, idx) => {
            const first = getFirstClickableSubItem(item);
            const href = first?.href || '#';
            const isActive = item.subItems.some(sub => sub.href && router.pathname === sub.href);

            if (collapsed) {
              return (
                <li key={idx}>
                  <div
                    className={`flex items-center justify-center px-3 py-2 cursor-pointer ${
                      isActive ? 'bg-elevated' : 'hover:bg-elevated'
                    }`}
                    onMouseEnter={(e) => handleMouseEnter(item, e)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => href !== '#' && router.push(href)}
                  >
                    {item.icon(isActive ? 'text-accent' : 'text-muted')}
                  </div>
                </li>
              );
            }

            return (
              <li key={idx}>
                <Link
                  href={href}
                  className="flex items-center justify-between px-3 py-2 hover:bg-elevated"
                  style={{ borderRight: isActive ? '2px solid var(--color-primary)' : undefined }}
                  onMouseEnter={(e) => handleMouseEnter(item, e)}
                  onMouseLeave={handleMouseLeave}
                >
                  <div className="flex items-center gap-3">
                    {item.icon(isActive ? 'text-accent' : 'text-muted')}
                    <span>{item.label}</span>
                  </div>
                  {item.subItems.length > 1 && <ChevronRight size={16} className="text-muted" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-3 border-t border-soft text-xs text-muted">
        <div className={`${collapsed ? 'hidden' : 'block'}`}>Acesso controlado por role</div>
      </div>

      {activeMenu && (
        <div
          className="fixed bg-surface border border-soft rounded shadow-lg z-50 animate-fadeIn"
          style={{ left: submenuPosition.left, top: submenuPosition.top, minWidth: 200 }}
          onMouseEnter={() => setActiveMenu(activeMenu)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="py-1">
            {activeMenu.subItems
              .filter(sub => !sub.hideWhenExpanded || collapsed)
              .map((sub, i) =>
                sub.isHeader ? (
                  <div
                    key={i}
                    className="px-4 py-2 bg-elevated text-muted whitespace-nowrap hover:text-accent transition-colors"
                    onClick={() => sub.href && router.push(sub.href!)}
                    style={{ cursor: sub.href ? ('pointer' as React.CSSProperties['cursor']) : 'default' }}
                  >
                    {sub.label}
                  </div>
                ) : (
                  <Link
                    key={i}
                    href={sub.href || '#'}
                    className="block px-4 py-2 text-sm text-base-color whitespace-nowrap hover:bg-elevated hover:text-accent transition-colors"
                  >
                    {sub.label}
                  </Link>
                )
              )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;