import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import { PageLoader } from '@/components/ui/PageLoader';
import FixedTransactionForm from '@/components/financial/FixedTransactionForm';

function EditFixedTransactionPageInner() {
  const router = useRouter();
  const { id } = router.query;

  if (typeof id !== 'string') {
    return <PageLoader message="Carregando transação fixa..." />;
  }

  return <FixedTransactionForm mode="edit" transactionId={id} />;
}

export default function EditFixedTransactionPage() {
  return (
    <PageGuard requiredRole="USER">
      <DashboardLayout title="Editar Transação Fixa">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Financeiro' },
            { label: 'Transações Fixas', href: '/financial/fixed-transactions' },
            { label: 'Editar Fixa' }
          ]}
        />

        <EditFixedTransactionPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
