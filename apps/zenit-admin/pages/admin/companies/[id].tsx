import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import CompanyForm from '@/components/admin/CompanyForm';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';

export default function EditCompanyPage() {
  const router = useRouter();
  const { id } = router.query;

  if (!id || Array.isArray(id)) {
    return <PageLoader message="Carregando empresa..." />;
  }

  return (
    <DashboardLayout title="Editar Empresa">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administracao' },
          { label: 'Empresas', href: '/admin/companies' },
          { label: 'Editar Empresa' }
        ]}
      />

      <AccessGuard allowedRoles={['ADMIN']}>
        <CompanyForm mode="edit" companyId={id} />
      </AccessGuard>
    </DashboardLayout>
  );
}
