import { FormEvent, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/ToastContext';
import { useFormNavigation } from '@/contexts/FormNavigationContext';
import api from '@/lib/api';

interface AssistantDefaults {
  model: string;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high' | null;
}

const path = '/admin/assistant-defaults';
const title = 'Padrão dos assistentes';

function DefaultsForm() {
  const [saved, setSaved] = useState<AssistantDefaults | null>(null);
  const [draft, setDraft] = useState<AssistantDefaults | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();
  const { protect } = useFormNavigation();
  const dirty = !!draft && (draft.model.trim() !== saved?.model || draft.reasoningEffort !== saved?.reasoningEffort);

  useEffect(() => {
    const controller = new AbortController();
    setLoadError('');
    api.get<AssistantDefaults>(path, { signal: controller.signal }).then(({ data }) => {
      if (controller.signal.aborted) return;
      setSaved(data);
      setDraft(data);
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError('Não foi possível carregar o padrão dos assistentes.');
    });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    protect(dirty, saving);
    return () => protect(false, false);
  }, [dirty, saving, protect]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !draft.model.trim() || !dirty || saving) return;
    setSaving(true);
    try {
      const { data } = await api.put<AssistantDefaults>(path, { ...draft, model: draft.model.trim() });
      setSaved(data);
      setDraft(data);
      addToast('Padrão dos assistentes salvo.', 'success');
    } catch (error: any) {
      const data = error.response?.data;
      addToast(data?.details?.[0]?.message || data?.error || 'Não foi possível salvar o padrão dos assistentes.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return (
    <Card className="max-w-3xl">
      <p className="mb-3" role="alert">{loadError}</p>
      <Button variant="outline" onClick={() => setReload((value) => value + 1)}>Tentar novamente</Button>
    </Card>
  );
  if (!draft) return <p role="status">Carregando configuração…</p>;

  return (
    <Card className="max-w-3xl">
      <form onSubmit={save} className="space-y-5">
        <p className="text-sm text-text-muted">
          O Hub e o assistente do Cash usam este padrão. Cada empresa pode escolher outro modelo para o chat financeiro.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Modelo OpenAI" value={draft.model} required maxLength={100} spellCheck={false}
            disabled={saving} onChange={(event) => setDraft({ ...draft, model: event.target.value })} />
          <div className="admin-field">
            <label htmlFor="reasoning-effort" className="admin-label">Nível de raciocínio</label>
            <select id="reasoning-effort" className="admin-input appearance-auto" value={draft.reasoningEffort ?? ''} disabled={saving}
              onChange={(event) => setDraft({ ...draft, reasoningEffort: (event.target.value || null) as AssistantDefaults['reasoningEffort'] })}>
              <option value="">Padrão do modelo</option>
              <option value="none">Sem raciocínio (none)</option>
              <option value="low">Baixo (low)</option>
              <option value="medium">Médio (medium)</option>
              <option value="high">Alto (high)</option>
            </select>
          </div>
        </div>
        <Button type="submit" disabled={saving || !dirty || !draft.model.trim()}>
          <Save size={16} /> {saving ? 'Salvando…' : 'Salvar padrão'}
        </Button>
      </form>
    </Card>
  );
}

export default function AssistantDefaultsPage() {
  return (
    <DashboardLayout title={title}>
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: title }]} />
      <AccessGuard allowedRoles={['ADMIN']}>
        <PageHeader title={title} />
        <DefaultsForm />
      </AccessGuard>
    </DashboardLayout>
  );
}
