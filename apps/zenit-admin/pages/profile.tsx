import Link from 'next/link';
import { Pencil, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <DashboardLayout title="Meu perfil">
      <div className="max-w-3xl">
        <PageHeader title="Meu perfil">
          {user && (
            <Link href={'/admin/users/' + user.id} className="admin-button admin-button-outline">
              <Pencil size={16} />
              Editar cadastro
            </Link>
          )}
        </PageHeader>
        <Card>
          <dl className="space-y-6">
            <div>
              <dt className="text-xs text-text-muted mb-2">Nome</dt>
              <dd className="font-medium break-words">{user?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted mb-2">E-mail</dt>
              <dd className="break-all">{user?.email}</dd>
            </div>
            <div className="flex items-center gap-2 pt-5 border-t border-border text-sm">
              <ShieldCheck size={18} className="text-accent" />
              Administrador do Zenit
            </div>
          </dl>
        </Card>
      </div>
    </DashboardLayout>
  );
}
