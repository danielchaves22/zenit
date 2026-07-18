// frontend/pages/financial/transactions/[id].tsx - LARGURA AJUSTADA
import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';
import TransactionForm from '@/components/financial/TransactionForm';
import { formatTransactionDescription } from '@/utils/transactions';

function readQueryValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].length > 0) {
    return value[0];
  }

  return null;
}

export default function EditTransactionPage() {
  const router = useRouter();
  const { id } = router.query;
  const returnTo = readQueryValue(router.query.returnTo);
  const [transactionTitle, setTransactionTitle] = useState<string | null>(null);

  const handleTransactionLoaded = useCallback((txn: {
    description: string;
    installmentNumber?: number | null;
    totalInstallments?: number | null;
  }) => {
    setTransactionTitle(
      formatTransactionDescription(
        txn.description,
        txn.installmentNumber,
        txn.totalInstallments
      )
    );
  }, []);

  if (!id) {
    return (
      <DashboardLayout title="Carregando...">
        <PageLoader message="Carregando transação..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={transactionTitle ?? 'Editar Transação'}>
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Financeiro' },
        { label: 'Transações', href: '/financial/transactions' },
        { label: transactionTitle ?? 'Editar Transação' }
      ]} />

      {/* ✅ Sem limitação de largura para ocupar o espaço total igual ao card da listagem */}
      <TransactionForm
        mode="edit"
        transactionId={id as string}
        returnTo={returnTo}
        onTransactionLoaded={handleTransactionLoaded}
      />
    </DashboardLayout>
  );
}
