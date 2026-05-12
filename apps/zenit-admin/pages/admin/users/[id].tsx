import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import UserForm from '@/components/admin/UserForm';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';

export default function EditUserPage() {
  const router = useRouter();
  const { id } = router.query;

  if (!id || Array.isArray(id)) {
    return <PageLoader message="Carregando usuario..." />;
  }

  return (
    <DashboardLayout title="Editar Usuario">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administracao' },
          { label: 'Usuarios', href: '/admin/users' },
          { label: 'Editar Usuario' }
        ]}
      />

      <AccessGuard requiredRole="SUPERUSER">
        <UserForm mode="edit" userId={id} />
      </AccessGuard>
    </DashboardLayout>
  );
}
