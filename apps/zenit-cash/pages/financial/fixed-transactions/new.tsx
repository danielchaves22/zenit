import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import FixedTransactionForm from '@/components/financial/FixedTransactionForm';

function NewFixedTransactionPageInner() {
  return (
    <DashboardLayout title="Nova Transação Fixa">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Transações Fixas', href: '/financial/fixed-transactions' },
          { label: 'Nova Fixa' }
        ]}
      />

      <FixedTransactionForm mode="create" />
    </DashboardLayout>
  );
}

export default function NewFixedTransactionPage() {
  return (
    <PageGuard requiredRole="USER">
      <NewFixedTransactionPageInner />
    </PageGuard>
  );
}
