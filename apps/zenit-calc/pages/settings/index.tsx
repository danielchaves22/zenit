import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ThemeSelector } from '@/components/ui/ThemeSelector';
import { useToast } from '@/components/ui/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';

type SettingsTab = 'user' | 'company';

interface OpenAiTenantStatusResponse {
  configured: boolean;
  model: string | null;
  promptVersion: string | null;
  isActive: boolean | null;
  updatedAt: string | null;
  managedBy: 'PLATFORM_ADMIN';
}

interface GmailStatusResponse {
  connected: boolean;
  connection: {
    id: number;
    companyId: number;
    googleEmail: string;
    status: 'ACTIVE' | 'ERROR' | 'DISCONNECTED';
    watchExpiration: string | null;
    lastError: string | null;
    disabledAt: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  config: {
    enabled: boolean;
    subjectRequiredText: string;
    lookbackDays: number;
    pollingIntervalMinutes: number;
    reconciliationIntervalMinutes: number;
    maxEmailsPerRun: number;
  };
  syncState: {
    lastHistoryId: string | null;
    lastPollingAt: string | null;
    lastReconcileAt: string | null;
    lastProcessedMessageAt: string | null;
    updatedAt: string;
  } | null;
}

function parseTab(rawTab: unknown, isSuperUser: boolean): SettingsTab {
  const value = String(rawTab || '').toLowerCase();
  if (value === 'company' && isSuperUser) return 'company';
  return 'user';
}

export default function SettingsPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const { userRole, userName, companyName } = useAuth();

  const isSuperUser = userRole === 'SUPERUSER';
  const [activeTab, setActiveTab] = useState<SettingsTab>('user');

  const [loadingCompanyData, setLoadingCompanyData] = useState(false);
  const [savingGmailConfig, setSavingGmailConfig] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);

  const [openAiStatus, setOpenAiStatus] = useState<OpenAiTenantStatusResponse | null>(null);
  const [gmailStatus, setGmailStatus] = useState<GmailStatusResponse | null>(null);

  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [subjectRequiredText, setSubjectRequiredText] = useState('Inicial Trabalhista');
  const [lookbackDays, setLookbackDays] = useState(3);
  const [pollingIntervalMinutes, setPollingIntervalMinutes] = useState(5);
  const [reconciliationIntervalMinutes, setReconciliationIntervalMinutes] = useState(60);
  const [maxEmailsPerRun, setMaxEmailsPerRun] = useState(50);

  useEffect(() => {
    if (!router.isReady) return;
    setActiveTab(parseTab(router.query.tab, isSuperUser));
  }, [router.isReady, router.query.tab, isSuperUser]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!isSuperUser || activeTab !== 'company') return;
    void loadCompanyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, isSuperUser, activeTab]);

  useEffect(() => {
    if (!router.isReady) return;
    const gmailResult = String(router.query.gmail || '');
    const reasonRaw = String(router.query.reason || '');

    if (!gmailResult) return;

    if (gmailResult === 'connected') {
      addToast('Conexao Gmail concluida com sucesso.', 'success');
      if (isSuperUser && activeTab === 'company') {
        void loadCompanyData();
      }
    } else if (gmailResult === 'error') {
      const reason = reasonRaw ? decodeURIComponent(reasonRaw) : 'erro desconhecido';
      addToast(`Falha na conexao Gmail: ${reason}`, 'error');
    }

    const nextQuery: Record<string, any> = { ...router.query, tab: 'company' };
    delete nextQuery.gmail;
    delete nextQuery.reason;

    void router.replace({ pathname: '/settings', query: nextQuery }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.gmail, router.query.reason, isSuperUser, activeTab]);

  const companyTabDisabledReason = useMemo(() => {
    if (isSuperUser) return null;
    return 'Apenas SUPERUSER pode acessar as configuracoes da empresa.';
  }, [isSuperUser]);

  async function loadCompanyData() {
    setLoadingCompanyData(true);
    try {
      const [openAiRes, gmailRes] = await Promise.all([
        api.get<OpenAiTenantStatusResponse>('/integrations/openai/status'),
        api.get<GmailStatusResponse>('/integrations/gmail/status')
      ]);

      setOpenAiStatus(openAiRes.data);
      setGmailStatus(gmailRes.data);
      applyGmailConfig(gmailRes.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar configuracoes da empresa.', 'error');
    } finally {
      setLoadingCompanyData(false);
    }
  }

  function applyGmailConfig(status: GmailStatusResponse) {
    setGmailEnabled(status.config.enabled);
    setSubjectRequiredText(status.config.subjectRequiredText || 'Inicial Trabalhista');
    setLookbackDays(status.config.lookbackDays || 3);
    setPollingIntervalMinutes(status.config.pollingIntervalMinutes || 5);
    setReconciliationIntervalMinutes(status.config.reconciliationIntervalMinutes || 60);
    setMaxEmailsPerRun(status.config.maxEmailsPerRun || 50);
  }

  async function connectGmail() {
    try {
      const response = await api.post('/integrations/gmail/oauth/start');
      const authUrl = response.data?.authUrl;
      if (!authUrl) {
        addToast('URL de autenticacao Gmail nao retornada.', 'error');
        return;
      }
      window.location.href = authUrl;
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao iniciar conexao Gmail.', 'error');
    }
  }

  async function disconnectGmail() {
    try {
      await api.post('/integrations/gmail/disconnect');
      addToast('Conexao Gmail desativada.', 'success');
      await loadCompanyData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao desconectar Gmail.', 'error');
    }
  }

  async function saveGmailConfig() {
    try {
      setSavingGmailConfig(true);
      await api.put('/integrations/gmail/config', {
        enabled: gmailEnabled,
        subjectRequiredText,
        lookbackDays,
        pollingIntervalMinutes,
        reconciliationIntervalMinutes,
        maxEmailsPerRun
      });
      addToast('Configuracao de ingestao Gmail salva.', 'success');
      await loadCompanyData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar configuracao Gmail.', 'error');
    } finally {
      setSavingGmailConfig(false);
    }
  }

  async function syncNow() {
    try {
      setSyncingNow(true);
      const response = await api.post('/integrations/gmail/sync-now');
      addToast(`Sincronizacao concluida. Processos criados: ${response.data?.createdProcesses || 0}`, 'success');
      await loadCompanyData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro na sincronizacao manual.', 'error');
    } finally {
      setSyncingNow(false);
    }
  }

  function changeTab(tab: SettingsTab) {
    setActiveTab(tab);
    void router.replace({ pathname: '/settings', query: { ...router.query, tab } }, undefined, { shallow: true });
  }

  return (
    <DashboardLayout title="Configuracoes">
      <Breadcrumb items={[{ label: 'Inicio', href: '/' }, { label: 'Configuracoes' }]} />

      <AccessGuard allowedRoles={['ADMIN', 'SUPERUSER', 'USER']}>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white">Configuracoes</h1>
          <p className="text-sm text-gray-400 mt-1">Gerencie preferencias pessoais e configuracoes da empresa.</p>
        </div>

        <Card className="mb-6">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={activeTab === 'user' ? 'accent' : 'outline'}
              onClick={() => changeTab('user')}
            >
              Configuracoes do Usuario
            </Button>
            <Button
              variant={activeTab === 'company' ? 'accent' : 'outline'}
              onClick={() => changeTab('company')}
              disabled={!isSuperUser}
              title={companyTabDisabledReason || undefined}
            >
              Configuracoes da Empresa
            </Button>
          </div>
        </Card>

        {activeTab === 'user' && (
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-medium text-white mb-4">Perfil e Tema</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                <Input label="Usuario" value={userName || '-'} disabled />
                <Input label="Empresa ativa" value={companyName || '-'} disabled />
              </div>

              <div className="mb-5">
                <label className="block text-sm text-gray-300 mb-2">Tema</label>
                <ThemeSelector showLabel={true} size="md" />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => router.push('/profile')}>
                  Abrir meu perfil
                </Button>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'company' && (
          <AccessGuard allowedRoles={['SUPERUSER']}>
            {loadingCompanyData ? (
              <Card>
                <div className="text-gray-300">Carregando configuracoes da empresa...</div>
              </Card>
            ) : (
              <div className="space-y-6">
                <Card>
                  <h2 className="text-lg font-medium text-white mb-4">OpenAI (Informativo)</h2>
                  <div className="rounded border border-blue-700 bg-blue-950/30 p-3 text-blue-200 text-sm mb-4">
                    Esta configuracao e gerenciada pela plataforma no painel administrativo.
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input label="Status" value={openAiStatus?.configured ? 'Configurada' : 'Nao configurada'} disabled />
                    <Input label="Modelo" value={openAiStatus?.model || '-'} disabled />
                    <Input label="Versao de prompt" value={openAiStatus?.promptVersion || '-'} disabled />
                    <Input
                      label="Atualizada em"
                      value={openAiStatus?.updatedAt ? new Date(openAiStatus.updatedAt).toLocaleString('pt-BR') : '-'}
                      disabled
                    />
                  </div>
                </Card>

                <Card>
                  <h2 className="text-lg font-medium text-white mb-4">Gmail</h2>

                  <div className="mb-4 text-sm text-gray-300">
                    Conexao: {gmailStatus?.connected ? `${gmailStatus.connection?.googleEmail} (${gmailStatus.connection?.status})` : 'Nao conectada'}
                  </div>

                  {gmailStatus?.connection?.lastError && (
                    <div className="mb-4 p-3 rounded border border-red-700 bg-red-950/30 text-red-300 text-sm">
                      Ultimo erro: {gmailStatus.connection.lastError}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mb-6">
                    <Button variant="accent" onClick={connectGmail}>Conectar Gmail</Button>
                    <Button variant="outline" onClick={syncNow} disabled={syncingNow || !gmailStatus?.connected}>
                      {syncingNow ? 'Sincronizando...' : 'Sincronizar agora'}
                    </Button>
                    <Button variant="outline" onClick={disconnectGmail} disabled={!gmailStatus?.connected}>
                      Desconectar Gmail
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Ingestao ativa</label>
                      <select
                        value={gmailEnabled ? 'true' : 'false'}
                        onChange={(event) => setGmailEnabled(event.target.value === 'true')}
                        className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color"
                      >
                        <option value="true">Sim</option>
                        <option value="false">Nao</option>
                      </select>
                    </div>

                    <Input
                      label="Filtro obrigatorio de assunto"
                      value={subjectRequiredText}
                      onChange={(event) => setSubjectRequiredText(event.target.value)}
                    />

                    <Input
                      label="Lookback (dias)"
                      type="number"
                      value={String(lookbackDays)}
                      onChange={(event) => setLookbackDays(Number(event.target.value || 3))}
                    />

                    <Input
                      label="Intervalo polling (min)"
                      type="number"
                      value={String(pollingIntervalMinutes)}
                      onChange={(event) => setPollingIntervalMinutes(Number(event.target.value || 5))}
                    />

                    <Input
                      label="Intervalo reconciliacao (min)"
                      type="number"
                      value={String(reconciliationIntervalMinutes)}
                      onChange={(event) => setReconciliationIntervalMinutes(Number(event.target.value || 60))}
                    />

                    <Input
                      label="Maximo de e-mails por execucao"
                      type="number"
                      value={String(maxEmailsPerRun)}
                      onChange={(event) => setMaxEmailsPerRun(Number(event.target.value || 50))}
                    />
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button variant="accent" onClick={saveGmailConfig} disabled={savingGmailConfig}>
                      {savingGmailConfig ? 'Salvando...' : 'Salvar configuracao Gmail'}
                    </Button>
                  </div>

                  <div className="mt-4 text-sm text-gray-400">
                    Ultimo polling: {gmailStatus?.syncState?.lastPollingAt ? new Date(gmailStatus.syncState.lastPollingAt).toLocaleString('pt-BR') : '-'}
                    {' | '}
                    Ultimo processamento: {gmailStatus?.syncState?.lastProcessedMessageAt ? new Date(gmailStatus.syncState.lastProcessedMessageAt).toLocaleString('pt-BR') : '-'}
                  </div>
                </Card>
              </div>
            )}
          </AccessGuard>
        )}
      </AccessGuard>
    </DashboardLayout>
  );
}
