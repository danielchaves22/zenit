import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useState } from 'react';
import {
  Building2,
  LogOut,
  Menu,
  Package,
  ShoppingBag,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Brand } from './Brand';
import { Breadcrumb, BreadcrumbItem } from './Breadcrumb';
import { useNavigation } from '@/contexts/NavigationContext';

export function Layout({
  children,
  breadcrumbs
}: {
  children: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}) {
  const { user, company, companies, selectCompany, logout } = useAuth();
  const router = useRouter();
  const { request } = useNavigation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = [
    {
      label: 'Operação',
      links: [{ href: '/compras', label: 'Compras', Icon: ShoppingBag }]
    },
    {
      label: 'Relacionamento',
      links: [{ href: '/pessoas', label: 'Pessoas e empresas', Icon: Users }]
    },
    {
      label: 'Cadastros',
      links: [{ href: '/produtos-servicos', label: 'Produtos e serviços', Icon: Package }]
    }
  ];
  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      {mobileOpen && (
        <button
          className="nav-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <Link
            href="/pessoas"
            aria-label="Zenit Bizz, início"
            onNavigate={(event) => {
              event.preventDefault();
              request(() => {
                void router.push('/pessoas');
              });
            }}
          >
            <Brand />
          </Link>
          <button
            className="icon-button mobile-close"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="Navegação principal">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-heading">{group.label.toUpperCase()}</span>
              {group.links.map(({ href, label, Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={`nav-link ${router.pathname === href || router.pathname.startsWith(`${href}/`) ? 'active' : ''}`}
                  aria-current={
                    router.pathname === href || router.pathname.startsWith(`${href}/`)
                      ? 'page'
                      : undefined
                  }
                  title={collapsed ? label : undefined}
                  onNavigate={(event) => {
                    event.preventDefault();
                    request(() => {
                      setMobileOpen(false);
                      void router.push(href);
                    });
                  }}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="button quiet collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            <span>Recolher menu</span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={22} />
          </button>
          <div className="company-selector">
            <Building2 size={18} />
            {companies.length > 1 ? (
              <label className="sr-only-label">
                <span className="sr-only">Empresa ativa</span>
                <select
                  aria-label="Empresa ativa"
                  value={company?.id}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    request(() => selectCompany(id));
                  }}
                >
                  {companies.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span>{company?.name}</span>
            )}
          </div>
          <div className="user-menu">
            <span className="avatar" aria-hidden="true">
              {user?.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="user-name">{user?.name}</span>
            <button
              className="icon-button"
              onClick={() => request(logout)}
              aria-label="Sair da conta"
              title="Sair da conta"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="main-content" key={company?.id}>
          {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
          {children}
        </main>
      </div>
    </div>
  );
}
