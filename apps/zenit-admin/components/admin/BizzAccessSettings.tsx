import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/ToastContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

function CompanyBizzAccess({ companyId }: { companyId: number }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useToast();
  useEffect(() => {
    let active = true;
    void api
      .get('/app-access/company/entitlements', { headers: { 'X-Company-Id': String(companyId) } })
      .then((response) => {
        if (active)
          setEnabled(
            response.data.some(
              (item: { appKey: string; enabled: boolean }) => item.appKey === 'zenit-bizz' && item.enabled
            )
          );
      })
      .catch(() => {
        if (active)
          setError('Não foi possível consultar o acesso ao Bizz. Atualize a página para tentar novamente.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId]);
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await api.put(
        '/app-access/company/entitlements',
        {
          entitlements: [{ appKey: 'zenit-bizz', enabled }]
        },
        { headers: { 'X-Company-Id': String(companyId) } }
      );
      addToast('Acesso da empresa ao Bizz atualizado.');
    } catch {
      addToast('Não foi possível salvar o acesso ao Bizz.', 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-3">Zenit Bizz</h2>
      <p className="text-sm text-gray-400 mb-5">
        Habilite o Bizz para a empresa selecionada. Depois, conceda acesso a cada pessoa em Administração →
        Usuários.
      </p>
      {error && (
        <p role="alert" className="text-red-400 mb-4">
          {error}
        </p>
      )}
      <label className="flex items-center gap-3 mb-5">
        <input
          type="checkbox"
          checked={enabled}
          disabled={loading || busy || Boolean(error)}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Habilitar Zenit Bizz nesta empresa
      </label>
      <Button onClick={save} disabled={loading || busy || Boolean(error)}>
        {busy ? 'Salvando…' : 'Salvar acesso ao Bizz'}
      </Button>
    </Card>
  );
}
export default function BizzAccessSettings() {
  const { companyId } = useAuth();
  return companyId ? <CompanyBizzAccess key={companyId} companyId={companyId} /> : null;
}
