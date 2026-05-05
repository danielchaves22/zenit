import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import { PageLoader } from '@/components/ui/PageLoader';
import CreditCardForm from '@/components/financial/CreditCardForm';

function EditCreditCardPageInner() {
  const router = useRouter();
  const { accountId } = router.query;

  if (!accountId) {
    return (
      <DashboardLayout title="Carregando...">
        <PageLoader message="Carregando cartao..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Editar Cartão">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
          { label: 'Editar Cartão' }
        ]}
      />

      <CreditCardForm mode="edit" cardId={accountId as string} />
    </DashboardLayout>
  );
}

export default function EditCreditCardPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <EditCreditCardPageInner />
    </PageGuard>
  );
}
