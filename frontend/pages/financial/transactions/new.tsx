// frontend/pages/financial/transactions/new.tsx - REFATORADO
import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import TransactionForm from '@/components/financial/TransactionForm';

export default function NewTransactionPage() {
  const router = useRouter();
  
  // Extrair query params
  const { type: queryType, locked } = router.query;
  const isTypeLocked = locked === 'true';
  const initialType = (queryType as 'INCOME' | 'EXPENSE' | 'TRANSFER') || 'EXPENSE';

  const getPageTitle = () => {
    switch (initialType) {
      case 'INCOME':
        return 'Nova Receita';
      case 'EXPENSE':
        return 'Nova Despesa';
      case 'TRANSFER':
        return 'Nova Transferência';
      default:
        return 'Nova Transação';
    }
  };

  return (
    <DashboardLayout title={getPageTitle()}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Financeiro' },
        { label: 'Transações', href: '/financial/transactions' },
        { label: getPageTitle() }
      ]} />

      <div className="max-w-4xl mx-auto">
        <TransactionForm
          mode="create"
          initialType={initialType}
          isTypeLocked={isTypeLocked}
        />
      </div>
    </DashboardLayout>
  );
}