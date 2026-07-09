import React, { useEffect, useState } from 'react';
import {
  Building2,
  Link as LinkIcon,
  MessageCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Unplug
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { WhatsAppQrCode } from '@/components/integrations/WhatsAppQrCode';

type WhatsAppBackendConfig = {
  cloudApiConfigured: boolean;
  webhookVerificationConfigured: boolean;
  signatureValidationConfigured: boolean;
  deepLinkConfigured: boolean;
  ready: boolean;
};

type WhatsAppCompanyAccess = {
  companyId: number;
  companyName: string;
  isCurrent: boolean;
  role: string;
  whatsappAccess: {
    allowed: boolean;
    appKey: string;
    enabled: boolean;
    granted: boolean;
  };
};

type WhatsAppBindingStatus = {
  activeCompanyId: number;
  activeCompanyName: string;
  connectedAt: string | null;
  displayName: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  phoneNumber: string;
  waId: string;
};

type WhatsAppPendingChallenge = {
  code: string;
  deepLinkUrl: string | null;
  expiresAt: string | null;
  preferredCompanyId: number;
  preferredCompanyName: string;
  qrPayload: string;
  text: string;
};

type WhatsAppStatusResponse = {
  backendConfig: WhatsAppBackendConfig;
  binding: WhatsAppBindingStatus | null;
  companies: WhatsAppCompanyAccess[];
  pendingChallenge: WhatsAppPendingChallenge | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Nao informado';
  }

  return new Date(value).toLocaleString('pt-BR');
}

export default function ProfilePage() {
  const { user, userId, companyId } = useAuth();
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    email: user?.email || '',
    name: user?.name || '',
    password: ''
  });
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingWhatsApp, setLoadingWhatsApp] = useState(true);
  const [refreshingWhatsApp, setRefreshingWhatsApp] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(companyId || null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppStatusResponse | null>(null);

  useEffect(() => {
    setFormData({
      email: user?.email || '',
      name: user?.name || '',
      password: ''
    });
  }, [user?.email, user?.name]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    void loadWhatsAppStatus(true);
  }, [userId]);

  useEffect(() => {
    if (!whatsAppStatus?.pendingChallenge) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadWhatsAppStatus(false);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [whatsAppStatus?.pendingChallenge]);

  async function loadWhatsAppStatus(showLoader: boolean) {
    if (showLoader) {
      setLoadingWhatsApp(true);
    } else {
      setRefreshingWhatsApp(true);
    }

    try {
      const response = await api.get('/integrations/whatsapp/status');
      const nextStatus = response.data as WhatsAppStatusResponse;
      setWhatsAppStatus(nextStatus);

      const allowedCompanies = nextStatus.companies.filter(
        (entry) => entry.whatsappAccess.allowed
      );

      if (nextStatus.binding?.activeCompanyId) {
        setSelectedCompanyId(nextStatus.binding.activeCompanyId);
      } else if (
        selectedCompanyId &&
        allowedCompanies.some((entry) => entry.companyId === selectedCompanyId)
      ) {
        setSelectedCompanyId(selectedCompanyId);
      } else if (allowedCompanies.some((entry) => entry.companyId === companyId)) {
        setSelectedCompanyId(companyId || null);
      } else {
        setSelectedCompanyId(allowedCompanies[0]?.companyId || null);
      }
    } catch (error: any) {
      addToast(
        error.response?.data?.error || 'Erro ao carregar status do WhatsApp',
        'error'
      );
    } finally {
      setLoadingWhatsApp(false);
      setRefreshingWhatsApp(false);
    }
  }

  async function handleProfileSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!userId) {
      return;
    }

    setLoadingProfile(true);

    try {
      await api.put(`/users/${userId}`, {
        email: formData.email.trim(),
        name: formData.name.trim(),
        ...(formData.password ? { password: formData.password } : {})
      });

      setFormData((prev) => ({ ...prev, password: '' }));
      addToast('Perfil atualizado com sucesso', 'success');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao atualizar perfil', 'error');
    } finally {
      setLoadingProfile(false);
    }
  }

  async function handleCreateChallenge() {
    if (!selectedCompanyId) {
      addToast('Selecione uma empresa para ativar o canal', 'error');
      return;
    }

    setActionLoading(true);

    try {
      await api.post('/integrations/whatsapp/challenge', {
        preferredCompanyId: selectedCompanyId
      });

      await loadWhatsAppStatus(false);
      addToast('QR Code do WhatsApp gerado com sucesso', 'success');
    } catch (error: any) {
      addToast(
        error.response?.data?.error || 'Erro ao gerar QR Code do WhatsApp',
        'error'
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisconnect() {
    setActionLoading(true);

    try {
      await api.post('/integrations/whatsapp/disconnect');
      await loadWhatsAppStatus(false);
      addToast('WhatsApp desconectado com sucesso', 'success');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao desconectar WhatsApp', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleChangeActiveCompany(nextCompanyId: number) {
    setSelectedCompanyId(nextCompanyId);

    if (!whatsAppStatus?.binding) {
      return;
    }

    setActionLoading(true);

    try {
      await api.put('/integrations/whatsapp/active-company', {
        companyId: nextCompanyId
      });

      await loadWhatsAppStatus(false);
      addToast('Empresa ativa do WhatsApp atualizada', 'success');
    } catch (error: any) {
      addToast(
        error.response?.data?.error || 'Erro ao atualizar empresa ativa do WhatsApp',
        'error'
      );
    } finally {
      setActionLoading(false);
    }
  }

  const allowedCompanies =
    whatsAppStatus?.companies.filter((entry) => entry.whatsappAccess.allowed) || [];
  const blockedCompanies =
    whatsAppStatus?.companies.filter((entry) => !entry.whatsappAccess.allowed) || [];

  return (
    <DashboardLayout title="Meu Perfil">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Meu Perfil' }
        ]}
      />

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card
          headerSubtitle="Atualize seus dados de acesso ao Zenit"
          headerTitle="Informacoes do Perfil"
        >
          <form onSubmit={handleProfileSubmit}>
            <Input
              label="Nome"
              name="name"
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
              required
              value={formData.name}
            />

            <Input
              label="Email"
              name="email"
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, email: event.target.value }))
              }
              required
              type="email"
              value={formData.email}
            />

            <Input
              label="Nova Senha"
              name="password"
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="Deixe em branco para manter a atual"
              type="password"
              value={formData.password}
            />

            <Button className="w-full" disabled={loadingProfile} type="submit" variant="accent">
              {loadingProfile ? 'Salvando...' : 'Salvar Alteracoes'}
            </Button>
          </form>
        </Card>

        <Card
          headerSubtitle="Conecte o operador do Zenit ao seu numero"
          headerTitle="Canal do WhatsApp"
        >
          <div className="space-y-5">
            <div className="rounded-xl border border-gray-700 bg-[#1a1f2b] p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-green-600/20 p-2">
                  <MessageCircle className="text-green-300" size={18} />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">
                    {whatsAppStatus?.binding ? 'Conectado' : 'Nao conectado'}
                  </div>
                  <div className="text-sm text-gray-400">
                    {whatsAppStatus?.binding
                      ? `Numero vinculado: ${whatsAppStatus.binding.phoneNumber}`
                      : 'Gere um QR Code e envie a mensagem pre-preenchida para o numero do Zenit.'}
                  </div>
                </div>
                {refreshingWhatsApp && (
                  <RefreshCw className="animate-spin text-gray-400" size={16} />
                )}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Empresa ativa no canal
              </label>
              <select
                className="w-full rounded border border-gray-700 bg-background px-3 py-2 text-white"
                disabled={loadingWhatsApp || actionLoading || allowedCompanies.length === 0}
                onChange={(event) => void handleChangeActiveCompany(Number(event.target.value))}
                value={selectedCompanyId || ''}
              >
                {allowedCompanies.length === 0 ? (
                  <option value="">Nenhuma empresa liberada para o canal</option>
                ) : (
                  allowedCompanies.map((entry) => (
                    <option key={entry.companyId} value={entry.companyId}>
                      {entry.companyName}
                    </option>
                  ))
                )}
              </select>
            </div>

            {blockedCompanies.length > 0 && (
              <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/10 p-4 text-sm text-yellow-100">
                Existem empresas sem acesso ao canal para este usuario. O superusuario precisa
                habilitar o app na empresa e conceder o grant no cadastro do usuario.
              </div>
            )}

            {!whatsAppStatus?.backendConfig.ready && (
              <div className="rounded-lg border border-red-800/50 bg-red-900/10 p-4 text-sm text-red-100">
                O backend ainda nao esta pronto para o WhatsApp. Revise as variaveis de ambiente
                e o webhook da Meta antes de conectar usuarios.
              </div>
            )}

            {whatsAppStatus?.binding && (
              <div className="rounded-lg border border-gray-700 bg-[#161a20] p-4 text-sm text-gray-300">
                <div className="flex items-center gap-2 text-white">
                  <Building2 size={16} />
                  Empresa ativa: {whatsAppStatus.binding.activeCompanyName}
                </div>
                <div className="mt-2">Conectado em: {formatDateTime(whatsAppStatus.binding.connectedAt)}</div>
                <div className="mt-1">
                  Ultima mensagem recebida: {formatDateTime(whatsAppStatus.binding.lastInboundAt)}
                </div>
                <div className="mt-1">
                  Ultima resposta enviada: {formatDateTime(whatsAppStatus.binding.lastOutboundAt)}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
              <div className="flex items-center gap-2 text-white">
                <QrCode size={16} />
                <span className="font-medium">
                  {whatsAppStatus?.pendingChallenge ? 'QR Code pronto' : 'Previa do QR Code'}
                </span>
              </div>

              {whatsAppStatus?.pendingChallenge ? (
                <>
                  <div className="mt-2 text-sm text-gray-300">
                    Empresa prevista para o vinculo:{' '}
                    {whatsAppStatus.pendingChallenge.preferredCompanyName}
                  </div>
                  <div className="mt-1 text-sm text-gray-300">
                    Expira em: {formatDateTime(whatsAppStatus.pendingChallenge.expiresAt)}
                  </div>
                  <div className="mt-4 flex justify-center">
                    <WhatsAppQrCode value={whatsAppStatus.pendingChallenge.qrPayload} />
                  </div>
                  <div className="mt-4 rounded-lg border border-gray-700 bg-[#111827] p-3 text-xs text-gray-300">
                    <div className="font-semibold text-white">Mensagem pre-preenchida</div>
                    <div className="mt-2 break-all">{whatsAppStatus.pendingChallenge.text}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {whatsAppStatus.pendingChallenge.deepLinkUrl && (
                      <a
                        className="inline-flex items-center gap-2 rounded font-semibold transition-all duration-200 bg-accent px-3 py-1.5 text-white hover:bg-accent-hover"
                        href={whatsAppStatus.pendingChallenge.deepLinkUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <LinkIcon size={16} />
                        Abrir WhatsApp
                      </a>
                    )}
                    <Button
                      className="flex items-center gap-2"
                      disabled={actionLoading}
                      onClick={() => void handleCreateChallenge()}
                      type="button"
                      variant="outline"
                    >
                      <RefreshCw size={16} />
                      Regenerar QR
                    </Button>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <div className="flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 bg-[#111827] px-6 text-center">
                    <div className="rounded-full bg-white/5 p-4">
                      <QrCode className="text-gray-400" size={32} />
                    </div>
                    <div className="mt-4 text-sm font-medium text-white">
                      A previa do QR aparece aqui
                    </div>
                    <div className="mt-2 max-w-xs text-sm text-gray-400">
                      Escolha a empresa e clique em {whatsAppStatus?.binding ? '"Reconectar Numero"' : '"Gerar QR Code"'} para montar a mensagem pre-preenchida do WhatsApp.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                className="flex items-center gap-2"
                disabled={
                  actionLoading ||
                  loadingWhatsApp ||
                  allowedCompanies.length === 0 ||
                  !whatsAppStatus?.backendConfig.ready
                }
                onClick={() => void handleCreateChallenge()}
                type="button"
                variant="accent"
              >
                <QrCode size={16} />
                {whatsAppStatus?.binding ? 'Reconectar Numero' : 'Gerar QR Code'}
              </Button>

              <Button
                className="flex items-center gap-2"
                disabled={actionLoading || !whatsAppStatus?.binding}
                onClick={() => void handleDisconnect()}
                type="button"
                variant="outline"
              >
                <Unplug size={16} />
                Desconectar
              </Button>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#161a20] p-4 text-sm text-gray-300">
              <div className="flex items-center gap-2 text-white">
                <ShieldCheck size={16} />
                Backend e seguranca
              </div>
              <div className="mt-3 space-y-1">
                <div>
                  Cloud API: {whatsAppStatus?.backendConfig.cloudApiConfigured ? 'ok' : 'pendente'}
                </div>
                <div>
                  Verify token:{' '}
                  {whatsAppStatus?.backendConfig.webhookVerificationConfigured
                    ? 'ok'
                    : 'pendente'}
                </div>
                <div>
                  Assinatura HMAC:{' '}
                  {whatsAppStatus?.backendConfig.signatureValidationConfigured
                    ? 'ok'
                    : 'pendente'}
                </div>
                <div>
                  Deep link / QR:{' '}
                  {whatsAppStatus?.backendConfig.deepLinkConfigured ? 'ok' : 'pendente'}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
