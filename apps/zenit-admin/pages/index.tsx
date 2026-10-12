import Link from 'next/link';
import { ArrowRight, Building2, Landmark, Plus, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';

const sections = [
  {
    href: '/admin/companies',
    title: 'Empresas',
    detail: 'Cadastros e aplicativos',
    icon: Building2,
    action: 'Nova empresa'
  },
  {
    href: '/admin/users',
    title: 'Usuários',
    detail: 'Contas e permissões',
    icon: Users,
    action: 'Novo usuário'
  },
  {
    href: '/admin/banks',
    title: 'Bancos',
    detail: 'Catálogo de instituições',
    icon: Landmark,
    action: 'Novo banco'
  }
];
export default function AdminHomePage() {
  return (
    <DashboardLayout title="Início">
      <PageHeader title="Administração" />
      <div className="admin-home-grid">
        {sections.map(({ href, title, detail, icon: Icon, action }) => (
          <section className="admin-home-card" key={href}>
            <Link href={href} className="admin-home-main">
              <span className="admin-section-icon">
                <Icon size={25} strokeWidth={1.6} />
              </span>
              <h2>{title}</h2>
              <p>{detail}</p>
              <ArrowRight className="admin-home-arrow" size={21} />
            </Link>
            <Link href={`${href}/new`} className="admin-home-create">
              <Plus size={16} />
              {action}
            </Link>
          </section>
        ))}
      </div>
    </DashboardLayout>
  );
}
