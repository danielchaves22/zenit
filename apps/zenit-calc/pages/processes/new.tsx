import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { ProcessForm } from '@/components/processes/ProcessForm';

export default function NewProcessPage() {
  return (
    <DashboardLayout>
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Processos', href: '/processes' },
          { label: 'Novo' }
        ]}
      />
      <AccessGuard allowedRoles={['ADMIN', 'SUPERUSER', 'USER']}>
        <ProcessForm mode="create" />
      </AccessGuard>
    </DashboardLayout>
  );
}

