import Link from 'next/link';
import { Building2, ShieldCheck, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminHomePage() {
  const { user } = useAuth();

  return (
    <DashboardLayout title="Administração do Zenit">
      <Breadcrumb items={[{ label: 'Início' }]} />

      <div className="space-y-6">
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-700/20 to-transparent" />
          <div className="relative p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <ShieldCheck size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm text-blue-200">Área restrita</p>
                <h1 className="text-2xl font-semibold text-white">Administração do Zenit</h1>
              </div>
            </div>

            <p className="text-gray-300">
              Gerencie empresas, usuários e serviços do ecossistema. Acesso exclusivo aos administradores do Zenit, independente de vínculo com uma empresa.
            </p>

            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="/admin/users"
                className="inline-flex items-center gap-2 rounded-md border border-blue-700/60 bg-[#111827] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-blue-500 hover:bg-[#172033]"
              >
                <Users size={16} />
                Ir para usuarios
              </Link>
              <Link
                href="/admin/companies"
                className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                <Building2 size={16} />
                Ir para empresas
              </Link>
              {user && (
                <span className="px-3 py-1 rounded-full bg-[#1f2937] text-blue-100 text-sm border border-blue-700/50">
                  Logado como: {user.name}
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white">Como funciona</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-2">
              <li>No cadastro da empresa, defina quais aplicativos ela pode utilizar.</li>
              <li>No cadastro do usuário, conceda os acessos necessários em cada empresa.</li>
              <li>O acesso ao Zenit Admin é uma permissão separada de administração da plataforma.</li>
            </ul>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
