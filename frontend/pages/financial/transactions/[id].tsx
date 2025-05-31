// frontend/pages/financial/transactions/[id].tsx - LARGURA AJUSTADA
import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';
import TransactionForm from '@/components/financial/TransactionForm';

export default function EditTransactionPage() {
  const router = useRouter();
  const { id } = router.query;

  if (!id) {
    return (
      <DashboardLayout title="Carregando...">
        <PageLoader message="Carregando transação..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Editar Transação">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Financeiro' },
        { label: 'Transações', href: '/financial/transactions' },
        { label: 'Editar Transação' }
      ]} />

      {/* ✅ Sem limitação de largura para ocupar o espaço total igual ao card da listagem */}
      <TransactionForm
        mode="edit"
        transactionId={id as string}
      />
    </DashboardLayout>
  );
}