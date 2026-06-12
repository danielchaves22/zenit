// frontend/pages/financial/transactions/new.tsx - LARGURA AJUSTADA
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

export default function NewTransactionPage() {
  const router = useRouter();
  const queryType = readQueryValue(router.query.type);
  const locked = readQueryValue(router.query.locked);
  const accountId = readQueryValue(router.query.accountId);
  const returnTo = readQueryValue(router.query.returnTo);
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

      {/* ✅ Sem limitação de largura para ocupar o espaço total igual ao card da listagem */}
      <TransactionForm
        mode="create"
        initialType={initialType}
        isTypeLocked={isTypeLocked}
        createFlow="standard"
        defaultFinancialAccountId={accountId}
        returnTo={returnTo}
      />
    </DashboardLayout>
  );
}
