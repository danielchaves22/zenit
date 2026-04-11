import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { ProcessForm } from '@/components/processes/ProcessForm';

export default function EditProcessPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };

  return (
    <DashboardLayout>
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Processos', href: '/processes' },
          { label: 'Editar' }
        ]}
      />
      <AccessGuard allowedRoles={['ADMIN', 'SUPERUSER', 'USER']}>
        <ProcessForm mode="edit" processId={id} />
      </AccessGuard>
    </DashboardLayout>
  );
}

