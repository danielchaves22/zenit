import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import UserForm from '@/components/admin/UserForm';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';

function EditUserPageInner() {
  const router = useRouter();
  const { id } = router.query;

  if (typeof id !== 'string') {
    return <PageLoader message="Carregando usuário..." />;
  }

  return <UserForm mode="edit" userId={id} />;
}

export default function EditUserPage() {
  return (
    <DashboardLayout title="Editar Usuário">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administração' },
          { label: 'Usuários', href: '/admin/users' },
          { label: 'Editar Usuário' }
        ]}
      />

      <AccessGuard requiredRole="SUPERUSER">
        <EditUserPageInner />
      </AccessGuard>
    </DashboardLayout>
  );
}
