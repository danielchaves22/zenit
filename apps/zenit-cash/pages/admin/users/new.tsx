import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import UserForm from '@/components/admin/UserForm';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

export default function NewUserPage() {
  return (
    <DashboardLayout title="Novo Usuário">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administração' },
          { label: 'Usuários', href: '/admin/users' },
          { label: 'Novo Usuário' }
        ]}
      />

      <AccessGuard requiredRole="SUPERUSER">
        <UserForm mode="create" />
      </AccessGuard>
    </DashboardLayout>
  );
}
