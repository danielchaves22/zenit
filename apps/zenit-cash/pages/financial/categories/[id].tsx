import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import { PageLoader } from '@/components/ui/PageLoader';
import CategoryForm from '@/components/financial/CategoryForm';

function EditCategoryPageInner() {
  const router = useRouter();
  const { id } = router.query;

  if (typeof id !== 'string') {
    return <PageLoader message="Carregando categoria..." />;
  }

  return <CategoryForm mode="edit" categoryId={id} />;
}

export default function EditCategoryPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_CATEGORIES">
      <DashboardLayout title="Editar Categoria">
        <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/' },
            { label: 'Financeiro' },
            { label: 'Categorias', href: '/financial/categories' },
            { label: 'Editar Categoria' }
          ]}
        />

        <EditCategoryPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
