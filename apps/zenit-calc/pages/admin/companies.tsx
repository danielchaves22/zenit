import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';

export default function CompaniesRedirectPage() {
  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Empresas' }]} />

      <Card className="p-6">
        <div className="space-y-3">
          <h1 className="text-2xl font-semibold text-white">Gestão de empresas movida</h1>
          <p className="text-gray-300">
            A administração de empresas agora está centralizada na nova aplicação <strong>Zenit Admin</strong>. Esta app
            continua focada nos fluxos operacionais e a criação ou edição de empresas deve ser feita apenas no ambiente
            administrativo.
          </p>

          <div className="flex flex-wrap gap-3 items-center">
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              <ExternalLink size={16} />
              Abrir Zenit Admin
            </Link>
            <span className="text-sm text-gray-400">Disponível apenas para usuários ADMIN.</span>
          </div>
        </div>
      </Card>
    </DashboardLayout>
  );
}
