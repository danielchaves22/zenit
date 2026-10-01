import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, Settings2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePermissions } from '@/hooks/usePermissions';
import { isNavigationItemActive, isNavigationLinkActive, mainNavigation, NavigationItem, settingsNavigation } from './navigation';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: (collapsed: boolean) => void;
  isMobile?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ isCollapsed, onToggle, isMobile = false, mobileOpen = false, onMobileClose }: SidebarProps) {
  const router = useRouter();
  const { userRole } = useAuth();
  const { colorMode } = useTheme();
  const { hasAppPermission, hasRole } = usePermissions();
  const sidebarRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [flyout, setFlyout] = useState<{ item: NavigationItem; top: number } | null>(null);
  const collapsed = isCollapsed && !isMobile;
  const settingsActive = settingsNavigation.some(item => isNavigationItemActive(item, router.pathname));
  const canSee = (item: NavigationItem) => Boolean(userRole) &&
    (!item.permission || hasAppPermission(item.permission)) && (!item.adminOnly || hasRole('SUPERUSER'));
  const visibleSettings = settingsNavigation.filter(canSee);

  useEffect(() => {
    setFlyout(null);
    const active = mainNavigation.find(item => item.children && isNavigationItemActive(item, router.pathname));
    setExpandedItem(active?.id || null);
    setSettingsOpen(settingsNavigation.some(item => isNavigationItemActive(item, router.pathname)));
  }, [router.asPath, router.pathname]);

  useEffect(() => { setFlyout(null); }, [collapsed]);

  useEffect(() => {
    if (!flyout) return;
    flyoutRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const closeOnOutside = (event: PointerEvent) => {
      if (!flyoutRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setFlyout(null);
    };
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setFlyout(null);
        triggerRef.current?.focus();
      }
    };
    const closeOnScroll = (event: Event) => {
      if (!flyoutRef.current?.contains(event.target as Node)) setFlyout(null);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnKey);
    window.addEventListener('resize', closeOnScroll);
    document.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnKey);
      window.removeEventListener('resize', closeOnScroll);
      document.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [flyout]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || [])
      .filter(element => !element.closest('[hidden]'));
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileClose?.();
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', trapFocus);
      previousFocus?.focus();
    };
  }, [isMobile, mobileOpen, onMobileClose]);

  function toggleChildren(item: NavigationItem, event: React.MouseEvent<HTMLButtonElement>) {
    if (!collapsed) { setExpandedItem(current => current === item.id ? null : item.id); return; }
    triggerRef.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedHeight = 58 + (item.children?.length || 0) * 42;
    setFlyout(current => current?.item.id === item.id ? null : {
      item, top: Math.max(12, Math.min(rect.top, window.innerHeight - estimatedHeight - 12)),
    });
  }

  function renderChildren(item: NavigationItem, floating = false) {
    return <div className={floating ? 'cash-flyout-links' : 'cash-subnav'}>
      {item.children?.map(link => <Link key={link.href} href={link.href}
        className="cash-subnav-link" aria-current={isNavigationLinkActive(link.href, router.asPath || router.pathname) ? 'page' : undefined}
        onClick={() => { setFlyout(null); onMobileClose?.(); }}>
        {link.label}
      </Link>)}
    </div>;
  }

  function renderItem(item: NavigationItem) {
    const active = isNavigationItemActive(item, router.pathname);
    const expanded = collapsed ? flyout?.item.id === item.id : expandedItem === item.id;
    const Icon = item.icon;
    return <div key={item.id} className="cash-nav-group">
      <div className={`cash-nav-row${active ? ' is-active' : ''}`}>
        {collapsed && item.children ? (
          <button type="button" className="cash-nav-link" aria-label={item.label} aria-expanded={expanded}
            aria-controls={expanded ? 'cash-navigation-flyout' : undefined} onClick={event => toggleChildren(item, event)}>
            <Icon size={20} aria-hidden="true" /><span className="cash-nav-tooltip" aria-hidden="true">{item.label}</span>
          </button>
        ) : (
          <Link href={item.href} className="cash-nav-link" aria-label={collapsed ? item.label : undefined}
            aria-current={active ? 'page' : undefined} onClick={onMobileClose}>
            <Icon size={20} aria-hidden="true" />
            {collapsed ? <span className="cash-nav-tooltip" aria-hidden="true">{item.label}</span> : <span>{item.label}</span>}
          </Link>
        )}
        {!collapsed && item.children && <button type="button" className="cash-nav-expand"
          aria-label={`${expanded ? 'Recolher' : 'Expandir'} opções de ${item.label}`} aria-expanded={expanded}
          aria-controls={`cash-subnav-${item.id}`} onClick={event => toggleChildren(item, event)}>
          <ChevronDown size={15} className={expanded ? 'rotate-180' : ''} aria-hidden="true" />
        </button>}
      </div>
      {!collapsed && item.children && <div id={`cash-subnav-${item.id}`} hidden={!expanded}>{renderChildren(item)}</div>}
    </div>;
  }

  return <>
    {isMobile && mobileOpen && <div className="cash-sidebar-backdrop" onClick={onMobileClose} aria-hidden="true" />}
    <aside ref={sidebarRef} id="cash-sidebar" className={`cash-sidebar${collapsed ? ' is-collapsed' : ''}${mobileOpen ? ' is-mobile-open' : ''}`}
      role={isMobile && mobileOpen ? 'dialog' : undefined} aria-modal={isMobile && mobileOpen ? true : undefined}
      aria-label="Navegação do Zenit Cash">
      <div className="cash-sidebar-brand">
        <Link href="/" aria-label="Zenit Cash — início" onClick={onMobileClose}>
          <Image src={collapsed ? '/assets/images/favicon-symbol.png' : `/assets/images/logo_principal${colorMode === 'light' ? '_light' : ''}.png`}
            alt="Zenit Cash" width={collapsed ? 32 : 132} height={collapsed ? 32 : 50} priority className="cash-logo" />
        </Link>
        {isMobile && <button type="button" className="cash-icon-button" aria-label="Fechar navegação" onClick={onMobileClose}><X size={20} /></button>}
      </div>
      <nav className="cash-navigation" aria-label="Menu principal">
        {!collapsed && <p className="cash-nav-caption">Suas finanças</p>}
        {mainNavigation.filter(canSee).map(renderItem)}
        {visibleSettings.length > 0 && <div className="cash-settings-nav">
          {collapsed ? renderItem({ id: 'adjustments', label: 'Ajustes', href: visibleSettings[0].href, icon: Settings2,
            matches: visibleSettings.map(item => item.href), children: visibleSettings }) : <>
            <button type="button" className={`cash-settings-toggle${settingsActive ? ' is-active' : ''}`}
              aria-expanded={settingsOpen} aria-controls="cash-settings-links" onClick={() => setSettingsOpen(!settingsOpen)}>
              <Settings2 size={18} aria-hidden="true" /><span>Ajustes</span><ChevronDown size={15} className={settingsOpen ? 'rotate-180' : ''} aria-hidden="true" />
            </button>
            <div id="cash-settings-links" hidden={!settingsOpen}>{visibleSettings.map(renderItem)}</div>
          </>}
        </div>}
      </nav>
      {!isMobile && <div className="cash-sidebar-footer">
        <button type="button" className="cash-collapse-button" onClick={() => onToggle(!isCollapsed)}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!collapsed} aria-controls="cash-sidebar">
          {collapsed ? <PanelLeftOpen size={20} /> : <><PanelLeftClose size={20} /><span>Recolher menu</span></>}
        </button>
      </div>}
    </aside>
    {collapsed && flyout && <div ref={flyoutRef} id="cash-navigation-flyout" className="cash-navigation-flyout"
      style={{ top: flyout.top }} aria-label={`Opções de ${flyout.item.label}`}>
      <div className="cash-flyout-heading"><span>{flyout.item.label}</span><button type="button" className="cash-icon-button"
        aria-label="Fechar submenu" onClick={() => { setFlyout(null); triggerRef.current?.focus(); }}><X size={16} /></button></div>
      {renderChildren(flyout.item, true)}
    </div>}
  </>;
}
