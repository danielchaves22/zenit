import React from 'react';
import BankForm from '@/components/admin/BankForm';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

export default function NewBankPage() {
  return (
    <DashboardLayout title="Novo Banco">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administracao' },
          { label: 'Bancos', href: '/admin/banks' },
          { label: 'Novo Banco' }
        ]}
      />

      <AccessGuard allowedRoles={['ADMIN']}>
        <BankForm mode="create" />
      </AccessGuard>
    </DashboardLayout>
  );
}
