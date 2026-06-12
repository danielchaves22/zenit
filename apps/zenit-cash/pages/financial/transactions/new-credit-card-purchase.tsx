import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import TransactionForm from '@/components/financial/TransactionForm';

function readQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }

  return null;
}

export default function NewCreditCardPurchasePage() {
  const router = useRouter();
  const cardId = readQueryValue(router.query.cardId);
  const returnTo = readQueryValue(router.query.returnTo);

  return (
    <DashboardLayout title="Nova Compra no Cartão">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Transações', href: '/financial/transactions' },
          { label: 'Nova Compra no Cartão' }
        ]}
      />

      <TransactionForm
        mode="create"
        initialType="EXPENSE"
        isTypeLocked
        createFlow="credit-card-purchase"
        defaultCreditCardId={cardId}
        returnTo={returnTo}
      />
    </DashboardLayout>
  );
}
