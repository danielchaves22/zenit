import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import CompanyForm from '@/components/admin/CompanyForm';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';

export default function NewCompanyPage() {
  return (
    <DashboardLayout title="Nova empresa">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
                    { label: 'Empresas', href: '/admin/companies' },
          { label: 'Nova empresa' }
        ]}
      />

      <AccessGuard allowedRoles={['ADMIN']}>
        <CompanyForm mode="create" />
      </AccessGuard>
    </DashboardLayout>
  );
}
