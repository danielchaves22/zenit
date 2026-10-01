import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronDown, CircleUserRound, LogOut, Menu, Moon, Repeat, Sun, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Sidebar } from './Sidebar';
import { AssistantFloatingChat } from '@/components/assistant/AssistantFloatingChat';
import { ThemeSelector } from '@/components/ui/ThemeSelector';
import { CompanySwitcherModal } from '@/components/ui/CompanySwitcherModal';

interface DashboardLayoutProps { children: React.ReactNode; title?: string; }

export function DashboardLayout({ children, title = 'Início' }: DashboardLayoutProps) {
  const { logout, userName, companyName, user, hasCurrentAppAccess } = useAuth();
  const { colorMode, changeColorMode } = useTheme();
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userTriggerRef = useRef<HTMLButtonElement>(null);
  const canSwitchCompany = Boolean(user?.companies && user.companies.length > 1);
  const closeMobileNavigation = useCallback(() => setMobileOpen(false), []);

  useEffect(() => {
    try { setSidebarCollapsed(localStorage.getItem('sidebarCollapsed') === 'true'); } catch { /* Use the expanded default when storage is unavailable. */ }
    const query = window.matchMedia('(max-width: 767px)');
    const updateScreen = () => { setIsMobile(query.matches); setMobileOpen(false); };
    updateScreen();
    query.addEventListener('change', updateScreen);
    return () => query.removeEventListener('change', updateScreen);
  }, []);

  useEffect(() => { setMobileOpen(false); setUserMenuOpen(false); }, [router.asPath]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) setUserMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setUserMenuOpen(false); userTriggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [userMenuOpen]);

  function toggleSidebar(collapsed: boolean) {
    setSidebarCollapsed(collapsed);
    try { localStorage.setItem('sidebarCollapsed', String(collapsed)); } catch { /* The current session still keeps the chosen layout. */ }
  }

  if (user && !hasCurrentAppAccess) return <div className="min-h-screen bg-background text-text flex items-center justify-center p-6">
    <div className="max-w-lg w-full bg-surface border border-border rounded-xl p-6 text-center">
      <h2 className="text-xl font-semibold mb-3">Acesso ao aplicativo negado</h2>
      <p className="text-text-muted mb-4">Seu usuário não possui acesso a este aplicativo no espaço selecionado.</p>
      <button onClick={logout} className="px-4 py-2 rounded-lg bg-accent text-on-accent">Sair</button>
    </div>
  </div>;

  return <div className={`cash-shell${sidebarCollapsed ? ' is-sidebar-collapsed' : ''}`}>
    <a className="cash-skip-link" href="#cash-main-content">Ir para o conteúdo</a>
    <Sidebar isCollapsed={sidebarCollapsed} onToggle={toggleSidebar} isMobile={isMobile} mobileOpen={mobileOpen} onMobileClose={closeMobileNavigation} />
    <div className="cash-workspace">
      <header className="cash-header">
        <button type="button" className="cash-icon-button cash-mobile-menu" aria-label="Abrir navegação" aria-expanded={mobileOpen}
          aria-controls="cash-sidebar" onClick={() => setMobileOpen(true)}><Menu size={22} /></button>
        <div className="cash-space-context">
          <CircleUserRound size={21} aria-hidden="true" />
          {canSwitchCompany ? <button type="button" className="cash-space-switcher" onClick={() => setCompanyModalOpen(true)} aria-label={`Alterar espaço: ${companyName}`}>
            <span>{companyName}</span><ChevronDown size={15} aria-hidden="true" />
          </button> : <span className="cash-space-name">{companyName || 'Meu espaço'}</span>}
          <span className="cash-header-location">{title}</span>
        </div>
        <div className="cash-header-tools">
          <button type="button" className="cash-icon-button" onClick={() => changeColorMode(colorMode === 'light' ? 'dark' : 'light')}
            aria-label={colorMode === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'} title={colorMode === 'light' ? 'Tema escuro' : 'Tema claro'}>
            {colorMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <div className="cash-profile" ref={userMenuRef}>
            <button ref={userTriggerRef} type="button" className="cash-profile-trigger" aria-label="Abrir menu do usuário" aria-expanded={userMenuOpen}
              aria-controls="cash-profile-menu" onClick={() => setUserMenuOpen(!userMenuOpen)}>
              <span className="cash-avatar">{userName?.trim().slice(0, 1).toUpperCase() || <UserRound size={18} />}</span>
              <span className="cash-user-name">{userName?.split(' ')[0]}</span><ChevronDown size={14} aria-hidden="true" />
            </button>
            {userMenuOpen && <div id="cash-profile-menu" className="cash-profile-menu">
              <div className="cash-profile-summary"><strong>{userName}</strong><span>{companyName}</span></div>
              <Link href="/profile" className="cash-profile-link" onClick={() => setUserMenuOpen(false)}><UserRound size={17} />Meu perfil</Link>
              <Link href="/profile/financial" className="cash-profile-link" onClick={() => setUserMenuOpen(false)}>Perfil financeiro</Link>
              {canSwitchCompany && <button type="button" className="cash-profile-link" onClick={() => { setUserMenuOpen(false); setCompanyModalOpen(true); }}><Repeat size={17} />Trocar espaço</button>}
              <div className="cash-profile-appearance"><span>Cor de destaque</span><ThemeSelector showLabel={false} size="sm" showCategories={false} /></div>
              <button type="button" className="cash-profile-link cash-signout" onClick={logout}><LogOut size={17} />Sair</button>
            </div>}
          </div>
        </div>
      </header>
      <main id="cash-main-content" className="cash-main" tabIndex={-1}>{children}</main>
    </div>
    {canSwitchCompany && <CompanySwitcherModal isOpen={companyModalOpen} onClose={() => setCompanyModalOpen(false)} />}
    <AssistantFloatingChat />
  </div>;
}
