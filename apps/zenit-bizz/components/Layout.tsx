import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useState } from 'react';
import { Building2, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Truck, Users, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Brand } from './Brand';

export function Layout({ children }: { children: ReactNode }) {
  const { user, company, companies, selectCompany, logout } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = [
    { href: '/clientes', label: 'Clientes', Icon: Users },
    { href: '/fornecedores', label: 'Fornecedores', Icon: Truck }
  ];
  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
      {mobileOpen && (
        <button className="nav-backdrop" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-brand">
          <Link href="/clientes" aria-label="Zenit Bizz, início">
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
        <span className="nav-heading">RELACIONAMENTOS</span>
        <nav aria-label="Navegação principal">
          {links.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${router.pathname === href ? 'active' : ''}`}
              aria-current={router.pathname === href ? 'page' : undefined}
              title={collapsed ? label : undefined}
              onClick={() => setMobileOpen(false)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            Uma boa relação é<br />o começo de bons negócios.
          </p>
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
                  onChange={(e) => selectCompany(Number(e.target.value))}
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
            <button className="icon-button" onClick={logout} aria-label="Sair da conta" title="Sair da conta">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <main className="main-content" key={company?.id}>
          {children}
        </main>
      </div>
    </div>
  );
}
