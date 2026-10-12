import { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  Building2,
  Home,
  Landmark,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onClose: () => void;
}
const links = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/admin/companies', label: 'Empresas', icon: Building2 },
  { href: '/admin/users', label: 'Usuários', icon: Users },
  { href: '/admin/banks', label: 'Bancos', icon: Landmark }
];
export function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: SidebarProps) {
  const router = useRouter();
  const { hasCurrentAppAccess } = useAuth();
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLElement>('button')?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        sidebar.current?.querySelectorAll<HTMLElement>('a, button') || []
      ).filter((element) => element.offsetParent !== null);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKey);
      previous?.focus();
    };
  }, [mobileOpen, onClose]);
  return (
    <>
      {mobileOpen && <div className="admin-nav-backdrop" onClick={onClose} />}
      <aside
        ref={sidebar}
        id="admin-sidebar"
        className={`admin-sidebar${mobileOpen ? ' is-open' : ''}`}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen || undefined}
        aria-label="Navegação principal"
      >
        <button className="admin-nav-close" onClick={onClose} aria-label="Fechar navegação">
          <X size={20} />
        </button>
        <Link href="/" className="admin-brand" aria-label="Zenit Admin — início">
          <Image
            src="/assets/images/logo_principal.png"
            alt="Zenit Admin"
            width={2000}
            height={768}
            priority
            className="admin-brand-full"
          />
          <Image
            src="/assets/images/favicon-symbol.png"
            alt=""
            width={36}
            height={36}
            className="admin-brand-symbol"
          />
        </Link>
        <div className="admin-nav-caption">Plataforma</div>
        <nav className="admin-navigation">
          {hasCurrentAppAccess &&
            links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={
                  (href === '/' ? router.pathname === '/' : router.pathname.startsWith(href))
                    ? 'page'
                    : undefined
                }
                className="admin-nav-link"
                title={collapsed ? label : undefined}
              >
                <Icon size={20} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            ))}
        </nav>
        <div className="admin-sidebar-footer">
          <Link
            href="/admin/settings"
            className="admin-nav-link"
            aria-current={router.pathname === '/admin/settings' ? 'page' : undefined}
            title={collapsed ? 'Aparência' : undefined}
          >
            <Settings size={20} aria-hidden="true" />
            <span>Aparência</span>
          </Link>
          <div className="admin-platform-tag">
            <ShieldCheck size={16} />
            <span>Administração Zenit</span>
          </div>
          <button
            className="admin-nav-link admin-collapse"
            onClick={onToggle}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            <span>Recolher menu</span>
          </button>
        </div>
      </aside>
    </>
  );
}
