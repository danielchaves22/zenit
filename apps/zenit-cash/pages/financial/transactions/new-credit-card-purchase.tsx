import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import TransactionForm from '@/components/financial/TransactionForm';

export default function NewCreditCardPurchasePage() {
  const router = useRouter();
  const cardId =
    typeof router.query.cardId === 'string' && router.query.cardId.length > 0
      ? router.query.cardId
      : null;

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
      />
    </DashboardLayout>
  );
}
