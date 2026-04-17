import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';

export default function LegacyAdminSettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    void router.replace('/settings?tab=company');
  }, [router]);

  return (
    <DashboardLayout title="Configuracoes">
      <Card>
        <div className="text-gray-300">Redirecionando para Configuracoes...</div>
      </Card>
    </DashboardLayout>
  );
}
