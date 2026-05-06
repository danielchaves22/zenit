import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import CategoryForm from '@/components/financial/CategoryForm';

function NewCategoryPageInner() {
  const router = useRouter();
  const type = router.query.type === 'INCOME' ? 'INCOME' : 'EXPENSE';

  return (
    <DashboardLayout
      title={type === 'INCOME' ? 'Nova Categoria de Receita' : 'Nova Categoria de Despesa'}
    >
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Categorias', href: '/financial/categories' },
          { label: 'Nova Categoria' }
        ]}
      />

      <CategoryForm mode="create" initialType={type} />
    </DashboardLayout>
  );
}

export default function NewCategoryPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_CATEGORIES">
      <NewCategoryPageInner />
    </PageGuard>
  );
}
