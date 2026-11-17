import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, FlaskConical, KeyRound, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

interface Company {
  id: number;
  name: string;
  address?: string;
  code: number;
  createdAt: string;
  updatedAt: string;
}

interface AdminOpenAiStatusResponse {
  configured: boolean;
  credential: {
    id: number;
    provider: 'OPENAI';
    model: string;
    assistantModelOverride?: string | null;
    promptVersion: string;
    isActive: boolean;
    updatedAt: string;
    createdAt: string;
  } | null;
}

interface CompanyFormProps {
  mode: 'create' | 'edit';
  companyId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface CompanyApp {
  appKey: string;
  name: string;
  enabled: boolean;
}

const DEFAULT_COMPANY_APPS = ['zenit-cash', 'zenit-calc'];

const DEFAULT_OPENAI_MODEL = 'gpt-5.4-nano';

export default function CompanyForm({
  mode,
  companyId,
  onSuccess,
  onCancel
}: CompanyFormProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [apps, setApps] = useState<CompanyApp[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [appsError, setAppsError] = useState('');
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: ''
  });

  const [loadingOpenAi, setLoadingOpenAi] = useState(false);
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [testingOpenAi, setTestingOpenAi] = useState(false);

  const [openAiStatus, setOpenAiStatus] = useState<AdminOpenAiStatusResponse | null>(null);
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiModel, setOpenAiModel] = useState(DEFAULT_OPENAI_MODEL);
  const [assistantModelOverride, setAssistantModelOverride] = useState<string | null>(null);
  const [openAiPromptVersion, setOpenAiPromptVersion] = useState('v1');
  const [openAiEnabled, setOpenAiEnabled] = useState(true);
  const credential = openAiStatus?.credential;
  const supportsAssistantOverride = !credential || credential.assistantModelOverride !== undefined;
  const openAiChanges = {
    apiKey: openAiApiKey.trim() || undefined,
    model: openAiModel.trim() !== credential?.model ? openAiModel.trim() : undefined,
    assistantModelOverride: supportsAssistantOverride && assistantModelOverride?.trim() !== credential?.assistantModelOverride?.trim()
      ? assistantModelOverride?.trim() ?? null : undefined,
    promptVersion: openAiPromptVersion.trim() !== credential?.promptVersion ? openAiPromptVersion.trim() : undefined,
    isActive: openAiEnabled !== credential?.isActive ? openAiEnabled : undefined
  };
  const canSaveOpenAi = !!openAiStatus && Object.values(openAiChanges).some((value) => value !== undefined);

  useEffect(() => {
    void loadApps();
    if (mode === 'edit' && companyId) {
      void initializeEdit(companyId);
    }
  }, [companyId, mode]);

  async function loadApps() {
    setLoadingApps(true);
    setAppsError('');
    try {
      const [catalog, entitlements] = await Promise.all([
        api.get<CompanyApp[]>('/app-access/catalog'),
        mode === 'edit'
          ? api.get<Array<{ appKey: string; enabled: boolean }>>(`/app-access/company/${companyId}/entitlements`)
          : Promise.resolve(null)
      ]);
      setApps(catalog.data.map((app) => ({
        ...app,
        enabled: entitlements
          ? entitlements.data.some((item) => item.appKey === app.appKey && item.enabled)
          : DEFAULT_COMPANY_APPS.includes(app.appKey)
      })));
    } catch {
      setAppsError('Não foi possível carregar os aplicativos. Tente novamente antes de salvar.');
    } finally {
      setLoadingApps(false);
    }
  }

  function resetOpenAiState() {
    setOpenAiStatus(null);
    setOpenAiApiKey('');
    setOpenAiModel(DEFAULT_OPENAI_MODEL);
    setAssistantModelOverride(null);
    setOpenAiPromptVersion('v1');
    setOpenAiEnabled(true);
  }

  async function initializeEdit(id: string) {
    setLoading(true);

    try {
      const response = await api.get('/companies');
      const companies = (response.data || []) as Company[];
      const company = companies.find((item) => item.id.toString() === id);

      if (!company) {
        addToast('Empresa nao encontrada', 'error');
        handleCancel();
        return;
      }

      setEditingCompany(company);
      setFormData({
        name: company.name,
        address: company.address || ''
      });

      await loadOpenAiConfig(company.id);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar empresa', 'error');
      handleCancel();
    } finally {
      setLoading(false);
    }
  }

  async function loadOpenAiConfig(targetCompanyId: number) {
    setLoadingOpenAi(true);
    try {
      const response = await api.get<AdminOpenAiStatusResponse>(
        `/admin/companies/${targetCompanyId}/openai`
      );
      const data = response.data;
      setOpenAiStatus(data);
      setAssistantModelOverride(data.credential?.assistantModelOverride ?? null);

      if (data.credential) {
        setOpenAiModel(data.credential.model || DEFAULT_OPENAI_MODEL);
        setOpenAiPromptVersion(data.credential.promptVersion || 'v1');
        setOpenAiEnabled(data.credential.isActive);
      } else {
        setOpenAiModel(DEFAULT_OPENAI_MODEL);
        setOpenAiPromptVersion('v1');
        setOpenAiEnabled(true);
      }

      setOpenAiApiKey('');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar configuracao OpenAI.', 'error');
      resetOpenAiState();
    } finally {
      setLoadingOpenAi(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    router.push('/admin/companies');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || loadingApps || appsError) return;

    if (!formData.name.trim()) {
      addToast('Nome da empresa e obrigatorio', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...formData,
        appEntitlements: apps.map(({ appKey, enabled }) => ({ appKey, enabled }))
      };
      if (mode === 'create') {
        await api.post('/companies', payload);
        addToast('Empresa criada com sucesso', 'success');
      } else {
        await api.put(`/companies/${companyId}`, payload);
        addToast('Empresa atualizada com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/admin/companies');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar empresa', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveOpenAiConfig() {
    if (!editingCompany || !canSaveOpenAi || savingOpenAi || testingOpenAi) return;

    if (!openAiApiKey.trim() && !openAiStatus?.configured) {
      addToast('Informe a chave OpenAI para salvar a primeira configuracao.', 'error');
      return;
    }

    if (assistantModelOverride !== null && !assistantModelOverride.trim()) {
      addToast('Informe o modelo do assistente do Cash desta empresa.', 'error');
      return;
    }

    try {
      setSavingOpenAi(true);
      await api.put(`/admin/companies/${editingCompany.id}/openai`, openAiChanges);

      setOpenAiApiKey('');
      addToast('Configuracao OpenAI salva com sucesso.', 'success');
      await loadOpenAiConfig(editingCompany.id);
    } catch (error: any) {
      const data = error.response?.data;
      addToast(data?.details?.[0]?.message || data?.error || 'Erro ao salvar a configuração OpenAI.', 'error');
    } finally {
      setSavingOpenAi(false);
    }
  }

  async function testOpenAiConfig() {
    if (!editingCompany) return;

    try {
      setTestingOpenAi(true);
      const response = await api.post(`/admin/companies/${editingCompany.id}/openai/test`, {
        apiKey: openAiApiKey.trim() || undefined,
        model: openAiModel
      });

      if (response.data?.ok) {
        addToast('Teste OpenAI executado com sucesso.', 'success');
      } else {
        addToast(response.data?.error || 'Falha no teste OpenAI.', 'error');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Falha no teste OpenAI.', 'error');
    } finally {
      setTestingOpenAi(false);
    }
  }

  if (loading) {
    return <PageLoader message="Carregando empresa..." />;
  }

  return (
    <div className="max-w-4xl">
      <div className="admin-form-header">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex items-center gap-2"
            disabled={saving}
          >
            <ArrowLeft size={16} />
            Voltar
          </Button>
          <h1 className="text-2xl font-semibold text-text">
            {mode === 'create' ? 'Nova empresa' : 'Editar empresa'}
          </h1>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <X size={16} />
            Cancelar
          </Button>
          <Button
            type="submit"
            form="company-form"
            variant="accent"
            disabled={saving || loadingApps || Boolean(appsError)}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving
              ? 'Salvando...'
              : mode === 'create'
                ? 'Criar empresa'
                : 'Salvar alterações'}
          </Button>
        </div>
      </div>

      <div className="max-w-4xl">
        <Card>
          <form id="company-form" onSubmit={handleSubmit} className="space-y-6">
            <h2 className="admin-form-section">Dados da empresa</h2>
            <Input
              label="Nome da empresa"
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
              required
              placeholder="Ex: Minha Empresa Ltda"
              disabled={saving}
            />

            <Input
              label="Endereço"
              value={formData.address}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, address: event.target.value }))
              }
              placeholder="Ex: Rua das Flores, 123 - Centro"
              disabled={saving}
            />

            <fieldset className="space-y-4 border-t border-border pt-6" disabled={saving || loadingApps}>
              <legend className="px-1 text-base font-medium text-text">Aplicativos da empresa</legend>

              {loadingApps ? (
                <p role="status" className="text-sm text-text-muted">Carregando aplicativos…</p>
              ) : appsError ? (
                <div className="space-y-3">
                  <p role="alert" className="text-sm text-tone-red">{appsError}</p>
                  <Button type="button" variant="outline" onClick={() => void loadApps()}>Tentar novamente</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {apps.map((app) => (
                    <label key={app.appKey} className="admin-app-choice flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface p-4 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={app.enabled}
                        onChange={(event) => setApps((current) => current.map((item) =>
                          item.appKey === app.appKey ? { ...item, enabled: event.target.checked } : item
                        ))}
                        className="h-4 w-4 rounded border-border text-accent focus:ring-accent focus:ring-offset-2 focus:ring-offset-[#11161d]"
                      />
                      {app.name}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-text-muted">
                Desabilitar um aplicativo bloqueia o acesso de todos os usuários desta empresa, sem apagar os dados. As permissões individuais são mantidas para uma futura reativação.
              </p>
            </fieldset>

            {editingCompany && (
              <div className="border-t border-border pt-6">
                <div className="mb-4 flex items-center gap-2">
                  <KeyRound size={16} className="text-accent" />
                  <h2 className="text-base font-medium text-text">
                    Integração OpenAI
                  </h2>
                </div>

                {loadingOpenAi ? (
                  <div className="text-sm text-text">Carregando configuracao OpenAI...</div>
                ) : !openAiStatus ? (
                  <div className="space-y-3">
                    <p role="alert" className="text-sm text-tone-red">Não foi possível carregar a configuração OpenAI.</p>
                    <Button type="button" variant="outline" onClick={() => void loadOpenAiConfig(editingCompany.id)}>Tentar novamente</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input
                        label="Chave API OpenAI"
                        type="password"
                        placeholder={
                          openAiStatus?.configured
                            ? '******** (manter atual se vazio)'
                            : 'sk-...'
                        }
                        value={openAiApiKey}
                        onChange={(event) => setOpenAiApiKey(event.target.value)}
                        disabled={savingOpenAi || testingOpenAi}
                      />

                      <Input
                        label="Modelo das demais funções financeiras"
                        value={openAiModel}
                        onChange={(event) => setOpenAiModel(event.target.value)}
                        placeholder={DEFAULT_OPENAI_MODEL}
                        disabled={savingOpenAi || testingOpenAi}
                      />

                      <Input
                        label="Versão do prompt"
                        value={openAiPromptVersion}
                        onChange={(event) => setOpenAiPromptVersion(event.target.value)}
                        placeholder="v1"
                        disabled={savingOpenAi || testingOpenAi}
                      />

                      <div>
                        <label className="mb-1 block text-sm text-text">Ativa</label>
                        <select
                          value={openAiEnabled ? 'true' : 'false'}
                          onChange={(event) => setOpenAiEnabled(event.target.value === 'true')}
                          className="w-full rounded border border-soft bg-background px-3 py-2 text-base-color"
                          disabled={savingOpenAi || testingOpenAi}
                        >
                          <option value="true">Sim</option>
                          <option value="false">Nao</option>
                        </select>
                      </div>
                    </div>

                    <fieldset className="space-y-3 border-t border-border pt-4" disabled={savingOpenAi || testingOpenAi}>
                      <legend className="px-1 text-base font-medium text-text">Assistente do Cash</legend>
                      {supportsAssistantOverride ? (
                        <>
                          <div className="admin-field">
                            <label className="admin-label" htmlFor="company-assistant-source">Modelo para o chat da empresa</label>
                            <select id="company-assistant-source" className="admin-input appearance-auto"
                              value={assistantModelOverride === null ? 'inherit' : 'custom'}
                              onChange={(event) => setAssistantModelOverride(event.target.value === 'inherit' ? null : credential?.assistantModelOverride ?? '')}>
                              <option value="inherit">Usar padrão do Zenit</option>
                              <option value="custom">Usar outro modelo nesta empresa</option>
                            </select>
                          </div>
                          {assistantModelOverride !== null && (
                            <Input label="Modelo do assistente do Cash" value={assistantModelOverride}
                              maxLength={100} spellCheck={false} onChange={(event) => setAssistantModelOverride(event.target.value)} />
                          )}
                          <Link href="/admin/assistant-defaults" className="inline-block text-sm text-accent underline">
                            Ver padrão dos assistentes
                          </Link>
                        </>
                      ) : (
                        <p className="text-sm text-text-muted">A seleção de modelo do chat estará disponível após a atualização do backend.</p>
                      )}
                    </fieldset>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="accent"
                        onClick={saveOpenAiConfig}
                        disabled={!canSaveOpenAi || savingOpenAi || testingOpenAi || saving}
                        className="flex items-center gap-2"
                      >
                        <Save size={16} />
                        {savingOpenAi ? 'Salvando OpenAI...' : 'Salvar OpenAI'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={testOpenAiConfig}
                        disabled={testingOpenAi || savingOpenAi || saving}
                        className="flex items-center gap-2"
                      >
                        <FlaskConical size={16} />
                        {testingOpenAi ? 'Testando...' : 'Testar credencial'}
                      </Button>
                    </div>

                    <div className="text-sm text-text-muted">
                      Status: {openAiStatus?.configured ? 'Configurada' : 'Nao configurada'}
                      {openAiStatus?.credential
                        ? ` | Atualizada em ${new Date(openAiStatus.credential.updatedAt).toLocaleString('pt-BR')}`
                        : ''}
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </Card>

      </div>
    </div>
  );
}
