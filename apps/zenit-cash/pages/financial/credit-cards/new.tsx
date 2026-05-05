import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import CreditCardForm from '@/components/financial/CreditCardForm';

function NewCreditCardPageInner() {
  return (
    <DashboardLayout title="Novo Cartão">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
          { label: 'Novo Cartão' }
        ]}
      />

      <CreditCardForm mode="create" />
    </DashboardLayout>
  );
}

export default function NewCreditCardPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <NewCreditCardPageInner />
    </PageGuard>
  );
}
