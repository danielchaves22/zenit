import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronDown, LogOut, Menu, Moon, ShieldCheck, Sun, UserRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Sidebar } from './Sidebar';
import { useFormNavigation } from '@/contexts/FormNavigationContext';

export function DashboardLayout({
  children,
  title = 'Início'
}: {
  children: ReactNode;
  title?: string;
}) {
  const { logout, userName, user, hasCurrentAppAccess } = useAuth();
  const { request } = useFormNavigation();
  const { colorMode, changeColorMode } = useTheme();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const workspace = useRef<HTMLDivElement>(null);
  const profile = useRef<HTMLDivElement>(null);
  const profileTrigger = useRef<HTMLButtonElement>(null);
  const closeNavigation = useCallback(() => setMobileOpen(false), []);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('zenit-admin-sidebar-collapsed') === 'true');
    } catch {
      /* Session state remains available. */
    }
    const media = window.matchMedia('(min-width: 768px)');
    const resize = () => setMobileOpen(false);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [router.asPath]);
  useEffect(() => {
    if (!profileOpen) return;
    const outside = (event: PointerEvent) => {
      if (!profile.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileOpen(false);
        profileTrigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keyboard);
    };
  }, [profileOpen]);
  useEffect(() => {
    if (workspace.current) workspace.current.inert = mobileOpen;
  }, [mobileOpen]);
  function toggleSidebar() {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem('zenit-admin-sidebar-collapsed', String(!collapsed));
    } catch {
      /* Optional preference. */
    }
  }
  if (user && !hasCurrentAppAccess)
    return (
      <div className="admin-auth-page">
        <div className="admin-card max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold mb-3">Acesso ao aplicativo negado</h1>
          <p className="text-text-muted mb-6">
            O Zenit Admin é exclusivo dos administradores da plataforma.
          </p>
          <button onClick={logout} className="admin-button admin-button-primary">
            Sair
          </button>
        </div>
      </div>
    );
  return (
    <div className={`admin-shell${collapsed ? ' is-collapsed' : ''}`}>
      <a href="#admin-main" className="admin-skip-link">
        Ir para o conteúdo
      </a>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
        onClose={closeNavigation}
      />
      <div ref={workspace} className="admin-workspace">
        <header className="admin-header">
          <button
            className="admin-icon-button admin-mobile-trigger"
            aria-label="Abrir navegação"
            aria-expanded={mobileOpen}
            aria-controls="admin-sidebar"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="admin-header-context">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>Plataforma Zenit</span>
            <span className="admin-header-location">{title}</span>
          </div>
          <div className="admin-header-tools">
            <button
              className="admin-icon-button"
              aria-label={colorMode === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
              onClick={() => changeColorMode(colorMode === 'light' ? 'dark' : 'light')}
            >
              {colorMode === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <div className="admin-profile" ref={profile}>
              <button
                ref={profileTrigger}
                className="admin-profile-trigger"
                aria-label="Menu do usuário"
                aria-expanded={profileOpen}
                aria-controls="admin-profile-menu"
                onClick={() => setProfileOpen(!profileOpen)}
              >
                <span className="admin-avatar">
                  {userName?.trim().slice(0, 1).toUpperCase() || <UserRound size={18} />}
                </span>
                <span className="admin-profile-name">{userName?.split(' ')[0]}</span>
                <ChevronDown size={14} />
              </button>
              {profileOpen && (
                <div id="admin-profile-menu" className="admin-profile-menu">
                  <div className="admin-profile-summary">
                    <strong>{userName}</strong>
                    <span>Administrador do Zenit</span>
                  </div>
                  <Link href="/profile">
                    <UserRound size={17} />
                    Meu perfil
                  </Link>
                  <button onClick={() => request(logout)}>
                    <LogOut size={17} />
                    Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="admin-main" className="admin-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
