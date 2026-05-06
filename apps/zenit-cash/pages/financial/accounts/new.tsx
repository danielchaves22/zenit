import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import AccountForm from '@/components/financial/AccountForm';

function NewAccountPageInner() {
  return (
    <DashboardLayout title="Nova Conta Financeira">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Contas', href: '/financial/accounts' },
          { label: 'Nova Conta' }
        ]}
      />

      <AccountForm mode="create" />
    </DashboardLayout>
  );
}

export default function NewAccountPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <NewAccountPageInner />
    </PageGuard>
  );
}
