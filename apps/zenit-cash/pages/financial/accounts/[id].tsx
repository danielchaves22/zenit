import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import { PageLoader } from '@/components/ui/PageLoader';
import AccountForm from '@/components/financial/AccountForm';

function EditAccountPageInner() {
  const router = useRouter();
  const { id } = router.query;

  if (typeof id !== 'string') {
    return <PageLoader message="Carregando conta..." />;
  }

  return <AccountForm mode="edit" accountId={id} />;
}

export default function EditAccountPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <DashboardLayout title="Editar Conta Financeira">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Financeiro' },
            { label: 'Contas', href: '/financial/accounts' },
            { label: 'Editar Conta' }
          ]}
        />

        <EditAccountPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
