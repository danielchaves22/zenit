import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';

export default function IntegrationsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    const nextQuery = { ...router.query, tab: 'company' };
    void router.replace({ pathname: '/settings', query: nextQuery });
  }, [router]);

  return (
    <DashboardLayout>
      <Card>
        <div className="text-gray-300">Redirecionando para Configuracoes...</div>
      </Card>
    </DashboardLayout>
  );
}
