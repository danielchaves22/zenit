import React from 'react';
import BankForm from '@/components/admin/BankForm';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

export default function NewBankPage() {
  return (
    <DashboardLayout title="Novo banco">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
                    { label: 'Bancos', href: '/admin/banks' },
          { label: 'Novo banco' }
        ]}
      />

      <AccessGuard allowedRoles={['ADMIN']}>
        <BankForm mode="create" />
      </AccessGuard>
    </DashboardLayout>
  );
}
