import React from 'react';
import { useRouter } from 'next/router';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { InitialCalculationWorkspace } from '@/components/processes/InitialCalculationWorkspace';

export default function ProcessInitialCalculationPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };

  return (
    <DashboardLayout>
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Processos', href: '/processes' },
          { label: id ? `Processo #${id}` : 'Processo', href: id ? `/processes/${id}` : '/processes' },
          { label: 'Calculo Inicial' }
        ]}
      />

      <AccessGuard allowedRoles={['ADMIN']}>
        {id ? (
          <InitialCalculationWorkspace processId={id} />
        ) : null}
      </AccessGuard>
    </DashboardLayout>
  );
}
