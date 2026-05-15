import React from 'react';
import { useRouter } from 'next/router';
import BankForm from '@/components/admin/BankForm';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

export default function EditBankPage() {
  const router = useRouter();
  const { id } = router.query;

  if (!router.isReady || typeof id !== 'string') {
    return (
      <DashboardLayout title="Editar Banco">
        <div className="text-sm text-gray-400">Carregando banco...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Editar Banco">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administracao' },
          { label: 'Bancos', href: '/admin/banks' },
          { label: 'Editar Banco' }
        ]}
      />

      <AccessGuard allowedRoles={['ADMIN']}>
        <BankForm mode="edit" bankId={id} />
      </AccessGuard>
    </DashboardLayout>
  );
}
